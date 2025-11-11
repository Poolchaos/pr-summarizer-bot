import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { Logger } from 'probot';
import { PRSummary, PRContext, LLMProvider, LLMResponse } from '../types';

export interface SummarizerConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  logger: Logger;
}

export class SummarizerService {
  private llm: ChatOpenAI | ChatAnthropic;
  private logger: Logger;
  private readonly MAX_RETRIES = 2;
  private readonly INITIAL_RETRY_DELAY = 2000;
  private circuitBreakerFailures = 0;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private circuitBreakerResetTime = 0;

  constructor(config: SummarizerConfig) {
    this.logger = config.logger;

    if (config.provider === 'openai') {
      this.llm = new ChatOpenAI({
        openAIApiKey: config.apiKey,
        modelName: config.model || 'gpt-4o',
        temperature: 0.3,
      });
    } else {
      this.llm = new ChatAnthropic({
        anthropicApiKey: config.apiKey,
        modelName: config.model || 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
      });
    }
  }

  /**
   * Generate PR summary from context
   */
  async summarize(context: PRContext): Promise<LLMResponse> {
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      throw new Error('Circuit breaker is open - too many recent LLM failures');
    }

    // Check for insufficient context
    if (this.hasInsufficientContext(context)) {
      return {
        summary: {
          what: '[NEEDS_INPUT]',
          why: '[NEEDS_INPUT]',
          impact: '[NEEDS_INPUT]',
          notes: 'Insufficient source context to generate meaningful summary. Please add more details to the PR description or commit messages.',
        },
        tokensUsed: 0,
        model: 'none',
      };
    }

    const prompt = this.buildPrompt(context);

    return this.withRetry(async () => {
      try {
        this.logger.info({ owner: context.owner, repo: context.repo, pullNumber: context.pullNumber }, 'Generating PR summary');

        const response = await this.llm.invoke(prompt);
        const content = response.content.toString();

        // Parse JSON response
        const summary = this.parseResponse(content);

        this.logger.info(
          { owner: context.owner, repo: context.repo, pullNumber: context.pullNumber },
          'PR summary generated successfully'
        );

        // Reset circuit breaker on success
        this.circuitBreakerFailures = 0;

        // Extract token usage safely
        const metadata = response.response_metadata as { estimatedTokenUsage?: { total?: number } } | undefined;
        const tokensUsed = metadata?.estimatedTokenUsage?.total || 0;

        return {
          summary,
          tokensUsed,
          model: this.llm instanceof ChatOpenAI ? 'gpt-4o' : 'claude-3-5-sonnet',
        };
      } catch (error) {
        this.circuitBreakerFailures++;
        this.logger.error({ error, failures: this.circuitBreakerFailures }, 'LLM summary generation failed');

        // Open circuit breaker if threshold exceeded
        if (this.circuitBreakerFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
          this.circuitBreakerResetTime = Date.now() + 60000; // 1 minute
          this.logger.warn('Circuit breaker opened - too many LLM failures');
        }

        throw error;
      }
    });
  }

  /**
   * Check if context is sufficient for summarization
   */
  private hasInsufficientContext(context: PRContext): boolean {
    const hasDiff = context.diff && context.diff.length > 50;
    const hasCommits = context.commits && context.commits.length > 0;
    const hasDescription = context.description && context.description.length > 20;

    // Need at least diff + (commits OR description)
    if (!hasDiff) {
      return true;
    }

    if (!hasCommits && !hasDescription) {
      return true;
    }

    return false;
  }

  /**
   * Build prompt for LLM
   */
  private buildPrompt(context: PRContext): string {
    const commitMessages = context.commits.map((c) => `- ${c.message}`).join('\n');

    return `You are a code review assistant. Analyze this pull request and provide a structured summary in JSON format.

PR Information:
- Repository: ${context.owner}/${context.repo}
- PR #${context.pullNumber}
${context.description ? `- Description: ${context.description}` : ''}

Commits:
${commitMessages}

Diff (truncated):
${context.diff.substring(0, 8000)}

Provide a JSON response with this exact structure:
{
  "what": "Brief description of WHAT changed (1-2 sentences, technical)",
  "why": "Explanation of WHY this change was made (business/technical rationale)",
  "impact": "Description of the IMPACT (what systems/features are affected, any breaking changes)",
  "notes": "Optional additional notes (testing considerations, deployment notes, etc.)"
}

Requirements:
- Be concise and technical
- Focus on facts from the code, commits, and description
- If information is unclear, state "Not specified in PR" rather than guessing
- Identify breaking changes or deployment requirements in impact
- Keep each field under 200 words`;
  }

  /**
   * Parse LLM response into PRSummary
   */
  private parseResponse(content: string): PRSummary {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonString) as PRSummary;

      // Validate required fields
      if (!parsed.what || !parsed.why || !parsed.impact) {
        throw new Error('Missing required fields in LLM response');
      }

      return parsed;
    } catch (error) {
      this.logger.error({ error, content }, 'Failed to parse LLM response');
      throw new Error('Invalid JSON response from LLM');
    }
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitOpen(): boolean {
    if (this.circuitBreakerFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      if (Date.now() < this.circuitBreakerResetTime) {
        return true;
      }
      // Reset circuit breaker after timeout
      this.circuitBreakerFailures = 0;
      this.circuitBreakerResetTime = 0;
    }
    return false;
  }

  /**
   * Retry logic with exponential backoff
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        const isRetriable = this.isRetriableError(error);

        if (!isRetriable || attempt === this.MAX_RETRIES) {
          throw error;
        }

        const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt) + Math.random() * 1000;
        this.logger.warn({ error, attempt, delay }, 'Retrying LLM request');

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

    const err = error as { status?: number; message?: string; code?: string };

    // Rate limit (429), server errors (5xx), timeouts
    if (err.status === 429 || (err.status && err.status >= 500)) {
      return true;
    }

    // Timeout errors
    if (err.message && (err.message.includes('timeout') || err.message.includes('ETIMEDOUT'))) {
      return true;
    }

    // Connection errors
    if (err.code && (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND')) {
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
