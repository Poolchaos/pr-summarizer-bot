/**
 * Type definitions for PR Summarizer Bot
 */

export interface PRSummary {
  what: string;
  why: string;
  impact: string;
  notes?: string;
}

export interface PRContext {
  owner: string;
  repo: string;
  pullNumber: number;
  sha: string;
  diff: string;
  commits: Array<{
    sha: string;
    message: string;
  }>;
  description?: string;
}

export interface BotConfig {
  enabled: boolean;
  autoSummarizeOn: Array<'opened' | 'synchronize' | 'reopened'>;
  ignoreLabels: string[];
  maxDiffSize: number;
}

export interface AuditLogEntry {
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  details?: Record<string, unknown>;
}

export interface RateLimitStatus {
  allowed: boolean;
  retryAfter?: number;
}

export type LLMProvider = 'openai' | 'anthropic';

export interface LLMResponse {
  summary: PRSummary;
  tokensUsed: number;
  model: string;
}
