/**
 * Jest test setup
 * Configures global test environment
 */

// Mock environment variables for tests
process.env.GITHUB_APP_ID = '123456';
process.env.GITHUB_PRIVATE_KEY = 'test-private-key';
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.OPENAI_API_KEY = 'sk-test-key';
process.env.LLM_PROVIDER = 'openai';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

// Increase timeout for integration tests
jest.setTimeout(10000);
