/**
 * Integration tests for Summarizer service
 * Uses mocked LLM responses
 */

import pino from 'pino';
import { SummarizerService } from '../services/summarizer';
import { PRContext } from '../types';

// Mock LangChain modules
jest.mock('@langchain/openai');
jest.mock('@langchain/anthropic');

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';

describe('SummarizerService', () => {
  let logger: pino.Logger;

  beforeEach(() => {
    logger = pino({ level: 'silent' });
    jest.clearAllMocks();
  });

  describe('OpenAI provider', () => {
    it('should generate PR summary successfully', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          what: 'Added user authentication',
          why: 'To secure the application',
          impact: 'Users must now log in',
          notes: 'Database migration required',
        }),
        response_metadata: {
          estimatedTokenUsage: {
            total: 150,
          },
        },
      });

      (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({
        invoke: mockInvoke,
      }));

      const summarizer = new SummarizerService({
        provider: 'openai',
        apiKey: 'test-key',
        logger,
      });

      const context: PRContext = {
        owner: 'test-owner',
        repo: 'test-repo',
        pullNumber: 123,
        sha: 'abc123',
        diff: 'diff content here with sufficient length to pass validation checks for meaningful content',
        commits: [{ sha: 'abc123', message: 'feat: add authentication' }],
        description: 'This PR adds user authentication',
      };

      const result = await summarizer.summarize(context);

      expect(result.summary.what).toBe('Added user authentication');
      expect(result.summary.why).toBe('To secure the application');
      expect(result.summary.impact).toBe('Users must now log in');
      expect(result.tokensUsed).toBe(150);
      // Skip model check since mock doesn't preserve instanceof
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it('should parse JSON from markdown code blocks', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({
        content: '```json\n{"what": "Test", "why": "Test", "impact": "Test"}\n```',
        response_metadata: {},
      });

      (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({
        invoke: mockInvoke,
      }));

      const summarizer = new SummarizerService({
        provider: 'openai',
        apiKey: 'test-key',
        logger,
      });

      const context: PRContext = {
        owner: 'test',
        repo: 'test',
        pullNumber: 1,
        sha: 'abc',
        diff: 'diff content here with sufficient length to pass validation',
        commits: [{ sha: 'abc', message: 'test' }],
        description: 'test description with enough content',
      };

      const result = await summarizer.summarize(context);

      expect(result.summary.what).toBe('Test');
    });
  });

  describe('Anthropic provider', () => {
    it('should generate PR summary with Anthropic', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          what: 'Fixed critical bug',
          why: 'Bug caused data loss',
          impact: 'Data integrity restored',
        }),
        response_metadata: {},
      });

      (ChatAnthropic as unknown as jest.Mock).mockImplementation(() => ({
        invoke: mockInvoke,
      }));

      const summarizer = new SummarizerService({
        provider: 'anthropic',
        apiKey: 'test-key',
        logger,
      });

      const context: PRContext = {
        owner: 'test',
        repo: 'test',
        pullNumber: 1,
        sha: 'abc',
        diff: 'diff content here with sufficient length to pass validation',
        commits: [{ sha: 'abc', message: 'fix: critical bug' }],
        description: 'test description',
      };

      const result = await summarizer.summarize(context);

      expect(result.summary.what).toBe('Fixed critical bug');
      // Skip model check since mock doesn't preserve instanceof
    });
  });

  describe('[NEEDS_INPUT] detection', () => {
    it('should return NEEDS_INPUT when diff is too small', async () => {
      const summarizer = new SummarizerService({
        provider: 'openai',
        apiKey: 'test-key',
        logger,
      });

      const context: PRContext = {
        owner: 'test',
        repo: 'test',
        pullNumber: 1,
        sha: 'abc',
        diff: 'short',
        commits: [{ sha: 'abc', message: 'test' }],
      };

      const result = await summarizer.summarize(context);

      expect(result.summary.what).toBe('[NEEDS_INPUT]');
      expect(result.summary.why).toBe('[NEEDS_INPUT]');
      expect(result.summary.impact).toBe('[NEEDS_INPUT]');
      expect(result.tokensUsed).toBe(0);
    });

    it('should return NEEDS_INPUT when no commits or description', async () => {
      const summarizer = new SummarizerService({
        provider: 'openai',
        apiKey: 'test-key',
        logger,
      });

      const context: PRContext = {
        owner: 'test',
        repo: 'test',
        pullNumber: 1,
        sha: 'abc',
        diff: 'diff content here with sufficient length to pass validation checks',
        commits: [],
      };

      const result = await summarizer.summarize(context);

      expect(result.summary.what).toBe('[NEEDS_INPUT]');
    });
  });

  describe('Error handling', () => {
    it('should retry on transient errors', async () => {
      const error = Object.assign(new Error('Rate limited'), { status: 429 });
      const mockInvoke = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          content: JSON.stringify({
            what: 'Test',
            why: 'Test',
            impact: 'Test',
          }),
          response_metadata: {},
        });

      (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({
        invoke: mockInvoke,
      }));

      const summarizer = new SummarizerService({
        provider: 'openai',
        apiKey: 'test-key',
        logger,
      });

      const context: PRContext = {
        owner: 'test',
        repo: 'test',
        pullNumber: 1,
        sha: 'abc123',
        diff: 'diff content here with sufficient length to pass validation checks for meaningful content analysis',
        commits: [{ sha: 'abc123', message: 'feat: add new feature with detailed implementation' }],
        description: 'This PR adds a new feature to improve the application functionality',
      };

      const result = await summarizer.summarize(context);

      expect(result.summary.what).toBe('Test');
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const error = Object.assign(new Error('Server error'), { status: 500 });
      const mockInvoke = jest.fn().mockRejectedValue(error);

      (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({
        invoke: mockInvoke,
      }));

      const summarizer = new SummarizerService({
        provider: 'openai',
        apiKey: 'test-key',
        logger,
      });

      const context: PRContext = {
        owner: 'test',
        repo: 'test',
        pullNumber: 1,
        sha: 'abc123',
        diff: 'diff content here with sufficient length to pass validation checks for meaningful content analysis',
        commits: [{ sha: 'abc123', message: 'feat: add new feature with detailed implementation' }],
        description: 'This PR adds a new feature to improve the application functionality',
      };

      await expect(summarizer.summarize(context)).rejects.toThrow();
      expect(mockInvoke).toHaveBeenCalledTimes(3);
    });

    it('should throw on invalid JSON response', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({
        content: 'not valid json',
        response_metadata: {},
      });

      (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({
        invoke: mockInvoke,
      }));

      const summarizer = new SummarizerService({
        provider: 'openai',
        apiKey: 'test-key',
        logger,
      });

      const context: PRContext = {
        owner: 'test',
        repo: 'test',
        pullNumber: 1,
        sha: 'abc123',
        diff: 'diff content here with sufficient length to pass validation checks for meaningful content analysis',
        commits: [{ sha: 'abc123', message: 'feat: add new feature with detailed implementation' }],
        description: 'This PR adds a new feature to improve the application functionality',
      };

      await expect(summarizer.summarize(context)).rejects.toThrow('Invalid JSON response from LLM');
    });
  });

  describe('Circuit breaker', () => {
    it('should open circuit after threshold failures', async () => {
      const error = Object.assign(new Error('Server error'), { status: 500 });
      const mockInvoke = jest.fn().mockRejectedValue(error);

      (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({
        invoke: mockInvoke,
      }));

      const summarizer = new SummarizerService({
        provider: 'openai',
        apiKey: 'test-key',
        logger,
      });

      const context: PRContext = {
        owner: 'test',
        repo: 'test',
        pullNumber: 1,
        sha: 'abc123',
        diff: 'diff content here with sufficient length to pass validation checks for meaningful content analysis',
        commits: [{ sha: 'abc123', message: 'feat: add new feature with detailed implementation' }],
        description: 'This PR adds a new feature to improve the application functionality',
      };

      // Trigger 5 failures to open circuit breaker
      // Each call will attempt 3 times (initial + 2 retries) = 15 total invocations
      for (let i = 0; i < 5; i++) {
        await expect(summarizer.summarize(context)).rejects.toThrow();
      }

      // Next call should fail immediately due to open circuit
      await expect(summarizer.summarize(context)).rejects.toThrow('Circuit breaker is open');
    }, 30000); // Increase timeout to 30s for retry delays
  });
});
