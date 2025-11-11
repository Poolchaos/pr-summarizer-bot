/**
 * Configuration tests
 */

import { loadConfig } from '../config';

describe('Configuration', () => {
  it('should load configuration from environment variables', () => {
    const config = loadConfig();

    expect(config.github.appId).toBe(123456);
    expect(config.llm.provider).toBe('openai');
    expect(config.redis.url).toBe('redis://localhost:6379');
    expect(config.server.nodeEnv).toBe('test');
  });

  it('should throw error when required variables are missing', () => {
    const originalAppId = process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_ID;

    expect(() => loadConfig()).toThrow('Missing required environment variables');

    process.env.GITHUB_APP_ID = originalAppId;
  });

  it('should require OPENAI_API_KEY when provider is openai', () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    expect(() => loadConfig()).toThrow('OPENAI_API_KEY is required');

    process.env.OPENAI_API_KEY = originalKey;
  });

  it('should require ANTHROPIC_API_KEY when provider is anthropic', () => {
    const originalProvider = process.env.LLM_PROVIDER;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

    process.env.LLM_PROVIDER = 'anthropic';
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => loadConfig()).toThrow('ANTHROPIC_API_KEY is required');

    process.env.LLM_PROVIDER = originalProvider;
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  });
});
