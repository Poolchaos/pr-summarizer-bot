/**
 * PR Summarizer Bot Configuration
 * Centralized configuration management with validation
 */

export interface AppConfig {
  github: {
    appId: number;
    privateKey: string;
    webhookSecret: string;
  };
  llm: {
    provider: 'openai' | 'anthropic';
    openaiApiKey?: string;
    anthropicApiKey?: string;
  };
  redis: {
    url: string;
    password?: string;
  };
  rateLimiting: {
    windowSeconds: number;
    maxRequests: number;
  };
  processing: {
    maxDiffSizeLines: number;
    summaryCacheTTL: number;
    auditLogRetentionDays: number;
  };
  server: {
    port: number;
    nodeEnv: string;
    logLevel: string;
  };
  sentry?: {
    dsn: string;
  };
}

/**
 * Load and validate configuration from environment variables
 * Throws error if required variables are missing
 */
export function loadConfig(): AppConfig {
  const requiredEnvVars = [
    'GITHUB_APP_ID',
    'GITHUB_PRIVATE_KEY',
    'GITHUB_WEBHOOK_SECRET',
    'REDIS_URL',
    'LLM_PROVIDER',
  ];

  const missing = requiredEnvVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const llmProvider = process.env.LLM_PROVIDER as 'openai' | 'anthropic';

  if (llmProvider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
  }

  if (llmProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic');
  }

  return {
    github: {
      appId: parseInt(process.env.GITHUB_APP_ID!, 10),
      privateKey: process.env.GITHUB_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
    },
    llm: {
      provider: llmProvider,
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    },
    redis: {
      url: process.env.REDIS_URL!,
      password: process.env.REDIS_PASSWORD,
    },
    rateLimiting: {
      windowSeconds: parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || '10', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1', 10),
    },
    processing: {
      maxDiffSizeLines: parseInt(process.env.MAX_DIFF_SIZE_LINES || '5000', 10),
      summaryCacheTTL: parseInt(process.env.SUMMARY_CACHE_TTL || '86400', 10),
      auditLogRetentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '7', 10),
    },
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
      nodeEnv: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info',
    },
    sentry: process.env.SENTRY_DSN
      ? {
          dsn: process.env.SENTRY_DSN,
        }
      : undefined,
  };
}
