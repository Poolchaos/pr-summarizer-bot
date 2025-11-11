/**
 * Pull Request Event Handler
 * Orchestrates PR summarization workflow
 */

import { Context } from 'probot';
import Redis from 'ioredis';
import { AppConfig } from '../config';
import { GitHubService } from '../services/github';
import { CacheService } from '../services/cache';
import { SummarizerService } from '../services/summarizer';
import { PRContext } from '../types';
import { formatSummaryAsMarkdown, formatNeedsInputMessage } from '../utils/formatter';
import { isValidDiffSize, shouldIgnoreByLabel, hasMeaningfulContent } from '../utils/validator';

/**
 * Handles pull request events (opened, synchronize, reopened)
 * Orchestrates: rate limiting → validation → summarization → comment posting
 */
export async function handlePullRequestEvent(
  context: Context<'pull_request.opened' | 'pull_request.synchronize' | 'pull_request.reopened'>,
  config: AppConfig
): Promise<void> {
  const { payload } = context;
  const pr = payload.pull_request;
  const repo = payload.repository;

  context.log.info('Processing PR event', {
    repo: repo.full_name,
    pr: pr.number,
    action: payload.action,
    sha: pr.head.sha,
  });

  try {
    // Initialize services
    const redis = new Redis(config.redis.url);
    const githubService = new GitHubService({ octokit: context.octokit as never, logger: context.log });
    const cacheService = new CacheService({ redis, logger: context.log });
    const summarizerService = new SummarizerService({
      provider: config.llm.provider,
      apiKey: config.llm.provider === 'openai' ? config.llm.openaiApiKey! : config.llm.anthropicApiKey!,
      logger: context.log,
    });

    // Check if PR should be ignored by label
    const prLabels = pr.labels?.map((l) => l.name) || [];
    if (shouldIgnoreByLabel(prLabels, [])) {
      context.log.info('PR ignored due to labels', { labels: prLabels });
      await redis.quit();
      return;
    }

    // Rate limiting check
    const rateLimitStatus = await cacheService.checkRateLimit(repo.owner.login, repo.name, 10);
    if (rateLimitStatus.isLimited) {
      context.log.warn('Rate limit exceeded', { repo: repo.full_name, remaining: rateLimitStatus.remaining });
      await redis.quit();
      return;
    }

    // Check cache for existing summary (for synchronize events)
    if (payload.action === 'synchronize') {
      const cached = await cacheService.getSummary(repo.owner.login, repo.name, pr.number, pr.head.sha);
      if (cached) {
        context.log.info('Using cached summary', { sha: pr.head.sha });
        const comment = formatSummaryAsMarkdown(cached);
        const botLogin = 'github-actions[bot]';
        const existingCommentId = await githubService.findBotComment(repo.owner.login, repo.name, pr.number, botLogin);

        if (existingCommentId) {
          await githubService.updateComment(repo.owner.login, repo.name, existingCommentId, comment);
        } else {
          await githubService.postComment(repo.owner.login, repo.name, pr.number, comment);
        }

        await redis.quit();
        return;
      }
    }

    // Fetch PR diff and commits
    const [diff, commits] = await Promise.all([
      githubService.fetchDiff(repo.owner.login, repo.name, pr.number),
      githubService.fetchCommits(repo.owner.login, repo.name, pr.number),
    ]);

    // Validate diff size
    if (!isValidDiffSize(diff.additions, diff.deletions, config.processing.maxDiffSizeLines)) {
      context.log.warn('PR diff too large', { additions: diff.additions, deletions: diff.deletions });
      await redis.quit();
      return;
    }

    // Combine all patches into single diff string
    const fullDiff = diff.files.map((f) => `--- ${f.filename}\n${f.patch || ''}`).join('\n\n');

    // Validate meaningful content
    if (!hasMeaningfulContent(fullDiff, commits, pr.body || undefined)) {
      context.log.info('PR lacks meaningful content');
      const message = formatNeedsInputMessage();
      await githubService.postComment(repo.owner.login, repo.name, pr.number, message);
      await redis.quit();
      return;
    }

    // Build PR context
    const prContext: PRContext = {
      owner: repo.owner.login,
      repo: repo.name,
      pullNumber: pr.number,
      sha: pr.head.sha,
      diff: fullDiff,
      commits: commits.map((c) => ({ sha: c.sha, message: c.message })),
      description: pr.body || undefined,
    };

    // Generate summary
    const result = await summarizerService.summarize(prContext);

    // Log audit entry
    await cacheService.logAudit({
      timestamp: Date.now(),
      correlationId: pr.head.sha,
      actor: pr.user?.login || 'unknown',
      action: 'pr_summarized',
      resource: `${repo.full_name}#${pr.number}`,
      details: {
        tokensUsed: result.tokensUsed,
        model: result.model,
      },
    });

    // Format and post comment
    const comment =
      result.summary.what === '[NEEDS_INPUT]'
        ? formatNeedsInputMessage()
        : formatSummaryAsMarkdown(result.summary);

    const botLogin = 'github-actions[bot]';
    const existingCommentId = await githubService.findBotComment(repo.owner.login, repo.name, pr.number, botLogin);

    if (existingCommentId) {
      await githubService.updateComment(repo.owner.login, repo.name, existingCommentId, comment);
    } else {
      await githubService.postComment(repo.owner.login, repo.name, pr.number, comment);
    }

    // Cache summary if successful
    if (result.summary.what !== '[NEEDS_INPUT]') {
      await cacheService.cacheSummary(repo.owner.login, repo.name, pr.number, pr.head.sha, result.summary);
    }

    context.log.info('PR summary posted successfully', {
      repo: repo.full_name,
      pr: pr.number,
      tokensUsed: result.tokensUsed,
    });

    await redis.quit();
  } catch (error) {
    context.log.error({ error }, 'Failed to process PR event');
    throw error;
  }
}
