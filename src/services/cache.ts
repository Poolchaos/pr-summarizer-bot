import Redis from 'ioredis';
import { Logger } from 'probot';
import { PRSummary, AuditLogEntry, RateLimitStatus } from '../types';

export interface CacheConfig {
  redis: Redis;
  logger: Logger;
}

export class CacheService {
  private redis: Redis;
  private logger: Logger;

  // TTL constants
  private readonly SUMMARY_TTL = 60 * 60 * 24; // 24 hours
  private readonly AUDIT_LOG_TTL = 60 * 60 * 24 * 7; // 7 days (GDPR compliance)
  private readonly RATE_LIMIT_WINDOW = 60 * 60; // 1 hour

  // Key prefixes
  private readonly SUMMARY_PREFIX = 'summary:';
  private readonly AUDIT_PREFIX = 'audit:';
  private readonly RATE_LIMIT_PREFIX = 'rate:';

  constructor(config: CacheConfig) {
    this.redis = config.redis;
    this.logger = config.logger;
  }

  /**
   * Cache PR summary by SHA (for PR synchronize events)
   */
  async cacheSummary(owner: string, repo: string, prNumber: number, sha: string, summary: PRSummary): Promise<void> {
    const key = this.getSummaryKey(owner, repo, prNumber, sha);

    try {
      await this.redis.setex(key, this.SUMMARY_TTL, JSON.stringify(summary));
      this.logger.info({ owner, repo, prNumber, sha }, 'Cached PR summary');
    } catch (error) {
      this.logger.error({ error, owner, repo, prNumber, sha }, 'Failed to cache summary');
      // Non-blocking - continue without cache
    }
  }

  /**
   * Retrieve cached PR summary by SHA
   */
  async getSummary(owner: string, repo: string, prNumber: number, sha: string): Promise<PRSummary | null> {
    const key = this.getSummaryKey(owner, repo, prNumber, sha);

    try {
      const cached = await this.redis.get(key);

      if (!cached) {
        this.logger.info({ owner, repo, prNumber, sha }, 'No cached summary found');
        return null;
      }

      this.logger.info({ owner, repo, prNumber, sha }, 'Retrieved cached summary');
      return JSON.parse(cached) as PRSummary;
    } catch (error) {
      this.logger.error({ error, owner, repo, prNumber, sha }, 'Failed to retrieve cached summary');
      return null;
    }
  }

  /**
   * Log audit entry (GDPR compliance - 7 day retention)
   */
  async logAudit(entry: AuditLogEntry): Promise<void> {
    const key = this.getAuditKey(entry.timestamp);

    try {
      await this.redis.setex(key, this.AUDIT_LOG_TTL, JSON.stringify(entry));
      this.logger.info({ correlationId: entry.correlationId, action: entry.action }, 'Audit log entry created');
    } catch (error) {
      this.logger.error({ error, entry }, 'Failed to log audit entry');
      // Critical - but don't fail the operation
    }
  }

  /**
   * Check rate limit for repository (distributed rate limiting)
   */
  async checkRateLimit(owner: string, repo: string, maxRequests: number): Promise<RateLimitStatus> {
    const key = this.getRateLimitKey(owner, repo);

    try {
      const current = await this.redis.incr(key);

      // Set expiry on first increment
      if (current === 1) {
        await this.redis.expire(key, this.RATE_LIMIT_WINDOW);
      }

      const remaining = Math.max(0, maxRequests - current);
      const isLimited = current > maxRequests;

      this.logger.info({ owner, repo, current, remaining, isLimited }, 'Rate limit check');

      return {
        limit: maxRequests,
        remaining,
        reset: Date.now() + this.RATE_LIMIT_WINDOW * 1000,
        isLimited,
      };
    } catch (error) {
      this.logger.error({ error, owner, repo }, 'Failed to check rate limit');

      // Fail open - allow request if Redis unavailable
      return {
        limit: maxRequests,
        remaining: maxRequests,
        reset: Date.now() + this.RATE_LIMIT_WINDOW * 1000,
        isLimited: false,
      };
    }
  }

  /**
   * Reset rate limit for repository (admin override)
   */
  async resetRateLimit(owner: string, repo: string): Promise<void> {
    const key = this.getRateLimitKey(owner, repo);

    try {
      await this.redis.del(key);
      this.logger.info({ owner, repo }, 'Rate limit reset');
    } catch (error) {
      this.logger.error({ error, owner, repo }, 'Failed to reset rate limit');
      throw error;
    }
  }

  /**
   * Get all audit logs for a time range (admin/compliance queries)
   */
  async getAuditLogs(startTime: number, endTime: number): Promise<AuditLogEntry[]> {
    try {
      const pattern = `${this.AUDIT_PREFIX}*`;
      const keys = await this.redis.keys(pattern);

      const logs: AuditLogEntry[] = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const entry = JSON.parse(data) as AuditLogEntry;
          if (entry.timestamp >= startTime && entry.timestamp <= endTime) {
            logs.push(entry);
          }
        }
      }

      this.logger.info({ startTime, endTime, count: logs.length }, 'Retrieved audit logs');

      return logs.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      this.logger.error({ error, startTime, endTime }, 'Failed to retrieve audit logs');
      throw error;
    }
  }

  /**
   * Health check - verify Redis connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      this.logger.error({ error }, 'Redis health check failed');
      return false;
    }
  }

  /**
   * Generate summary cache key
   */
  private getSummaryKey(owner: string, repo: string, prNumber: number, sha: string): string {
    return `${this.SUMMARY_PREFIX}${owner}:${repo}:${prNumber}:${sha}`;
  }

  /**
   * Generate audit log key (timestamped for expiry)
   */
  private getAuditKey(timestamp: number): string {
    return `${this.AUDIT_PREFIX}${timestamp}:${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Generate rate limit key
   */
  private getRateLimitKey(owner: string, repo: string): string {
    return `${this.RATE_LIMIT_PREFIX}${owner}:${repo}`;
  }
}
