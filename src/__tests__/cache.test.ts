/**
 * Integration tests for Cache service
 * Uses ioredis-mock to simulate Redis
 */

import RedisMock from 'ioredis-mock';
import pino from 'pino';
import { CacheService } from '../services/cache';
import { PRSummary, AuditLogEntry } from '../types';

describe('CacheService', () => {
  let cacheService: CacheService;
  let redis: InstanceType<typeof RedisMock>;
  let logger: pino.Logger;

  beforeEach(() => {
    redis = new RedisMock();
    logger = pino({ level: 'silent' });
    cacheService = new CacheService({ redis: redis as never, logger });
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  describe('cacheSummary and getSummary', () => {
    it('should cache and retrieve summary successfully', async () => {
      const summary: PRSummary = {
        what: 'Test change',
        why: 'Test reason',
        impact: 'Test impact',
      };

      await cacheService.cacheSummary('owner', 'repo', 123, 'abc123', summary);
      const retrieved = await cacheService.getSummary('owner', 'repo', 123, 'abc123');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.what).toBe('Test change');
      expect(retrieved?.why).toBe('Test reason');
    });

    it('should return null for non-existent cache', async () => {
      const retrieved = await cacheService.getSummary('owner', 'repo', 999, 'nonexistent');

      expect(retrieved).toBeNull();
    });
  });

  describe('logAudit', () => {
    it('should log audit entry successfully', async () => {
      const entry: AuditLogEntry = {
        timestamp: Date.now(),
        correlationId: 'corr-123',
        actor: 'test-bot',
        action: 'summary_generated',
        resource: 'owner/repo/123',
        details: { success: true },
      };

      await expect(cacheService.logAudit(entry)).resolves.not.toThrow();
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', async () => {
      const result = await cacheService.checkRateLimit('owner', 'repo', 10);

      expect(result.isLimited).toBe(false);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should enforce rate limit after threshold', async () => {
      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        await cacheService.checkRateLimit('owner', 'repo', 10);
      }

      const result = await cacheService.checkRateLimit('owner', 'repo', 10);

      expect(result.isLimited).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('should track rate limits per repository', async () => {
      // Exhaust limit for repo1
      for (let i = 0; i < 10; i++) {
        await cacheService.checkRateLimit('owner', 'repo1', 10);
      }

      // repo2 should still have capacity
      const result = await cacheService.checkRateLimit('owner', 'repo2', 10);

      expect(result.isLimited).toBe(false);
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for repository', async () => {
      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        await cacheService.checkRateLimit('owner', 'repo', 10);
      }

      await cacheService.resetRateLimit('owner', 'repo');

      const result = await cacheService.checkRateLimit('owner', 'repo', 10);
      expect(result.isLimited).toBe(false);
    });
  });

  describe('getAuditLogs', () => {
    it('should retrieve audit logs within time range', async () => {
      const now = Date.now();

      const entry1: AuditLogEntry = {
        timestamp: now - 1000,
        correlationId: 'corr-1',
        actor: 'test-bot',
        action: 'action1',
        resource: 'owner/repo/1',
      };

      const entry2: AuditLogEntry = {
        timestamp: now,
        correlationId: 'corr-2',
        actor: 'test-bot',
        action: 'action2',
        resource: 'owner/repo/2',
      };

      await cacheService.logAudit(entry1);
      await cacheService.logAudit(entry2);

      const logs = await cacheService.getAuditLogs(now - 2000, now + 1000);

      expect(logs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('healthCheck', () => {
    it('should return true for healthy Redis connection', async () => {
      const isHealthy = await cacheService.healthCheck();

      expect(isHealthy).toBe(true);
    });
  });
});
