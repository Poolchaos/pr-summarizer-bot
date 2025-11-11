import { Octokit } from '@octokit/rest';
import { Logger } from 'probot';

export interface GitHubConfig {
  octokit: Octokit;
  logger: Logger;
}

export interface PRDiff {
  additions: number;
  deletions: number;
  changes: number;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}

export interface PRCommit {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
}

export class GitHubService {
  private octokit: Octokit;
  private logger: Logger;
  private readonly MAX_RETRIES = 2;
  private readonly INITIAL_RETRY_DELAY = 1000;

  constructor(config: GitHubConfig) {
    this.octokit = config.octokit;
    this.logger = config.logger;
  }

  /**
   * Fetch PR diff with file changes and patches
   */
  async fetchDiff(owner: string, repo: string, pullNumber: number): Promise<PRDiff> {
    return this.withRetry(async () => {
      this.logger.info({ owner, repo, pullNumber }, 'Fetching PR diff');

      const { data: files } = await this.octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
      });

      const diff: PRDiff = {
        additions: 0,
        deletions: 0,
        changes: 0,
        files: [],
      };

      for (const file of files) {
        diff.additions += file.additions;
        diff.deletions += file.deletions;
        diff.changes += file.changes;

        diff.files.push({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch,
        });
      }

      this.logger.info(
        { owner, repo, pullNumber, fileCount: files.length, additions: diff.additions, deletions: diff.deletions },
        'PR diff fetched successfully'
      );

      return diff;
    });
  }

  /**
   * Fetch PR commits with metadata
   */
  async fetchCommits(owner: string, repo: string, pullNumber: number): Promise<PRCommit[]> {
    return this.withRetry(async () => {
      this.logger.info({ owner, repo, pullNumber }, 'Fetching PR commits');

      const { data: commits } = await this.octokit.pulls.listCommits({
        owner,
        repo,
        pull_number: pullNumber,
      });

      const prCommits = commits.map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author?.name || 'Unknown',
        timestamp: commit.commit.author?.date || new Date().toISOString(),
      }));

      this.logger.info({ owner, repo, pullNumber, commitCount: prCommits.length }, 'PR commits fetched successfully');

      return prCommits;
    });
  }

  /**
   * Post new comment on PR
   */
  async postComment(owner: string, repo: string, pullNumber: number, body: string): Promise<number> {
    return this.withRetry(async () => {
      this.logger.info({ owner, repo, pullNumber }, 'Posting comment on PR');

      const { data: comment } = await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body,
      });

      this.logger.info({ owner, repo, pullNumber, commentId: comment.id }, 'Comment posted successfully');

      return comment.id;
    });
  }

  /**
   * Update existing comment on PR
   */
  async updateComment(owner: string, repo: string, commentId: number, body: string): Promise<void> {
    return this.withRetry(async () => {
      this.logger.info({ owner, repo, commentId }, 'Updating comment on PR');

      await this.octokit.issues.updateComment({
        owner,
        repo,
        comment_id: commentId,
        body,
      });

      this.logger.info({ owner, repo, commentId }, 'Comment updated successfully');
    });
  }

  /**
   * Find existing bot comment on PR
   */
  async findBotComment(owner: string, repo: string, pullNumber: number, botLogin: string): Promise<number | null> {
    return this.withRetry(async () => {
      this.logger.info({ owner, repo, pullNumber, botLogin }, 'Searching for existing bot comment');

      const { data: comments } = await this.octokit.issues.listComments({
        owner,
        repo,
        issue_number: pullNumber,
      });

      const botComment = comments.find((comment) => comment.user?.login === botLogin);

      if (botComment) {
        this.logger.info({ owner, repo, pullNumber, commentId: botComment.id }, 'Found existing bot comment');
        return botComment.id;
      }

      this.logger.info({ owner, repo, pullNumber }, 'No existing bot comment found');
      return null;
    });
  }

  /**
   * Retry logic with exponential backoff for transient errors
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retriable (rate limit, timeout, 5xx)
        const isRetriable = this.isRetriableError(error);

        if (!isRetriable || attempt === this.MAX_RETRIES) {
          this.logger.error({ error, attempt }, 'GitHub API request failed');
          throw error;
        }

        // Exponential backoff with jitter
        const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt) + Math.random() * 1000;
        this.logger.warn({ error, attempt, delay }, 'Retrying GitHub API request');

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Determine if error should trigger retry
   */
  private isRetriableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const err = error as { status?: number; message?: string };

    // Rate limit (429), server errors (5xx), timeouts
    if (err.status === 429 || (err.status && err.status >= 500)) {
      return true;
    }

    // Timeout errors
    if (err.message && (err.message.includes('timeout') || err.message.includes('ETIMEDOUT'))) {
      return true;
    }

    return false;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
