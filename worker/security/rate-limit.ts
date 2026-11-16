/**
 * In-memory sliding-window rate limiter for Cloudflare Worker gateway
 * Protects against open-proxy abuse on the Free tier without external database dependencies.
 */

interface RateLimitRecord {
  timestamps: number[];
}

export class MemoryRateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private lastCleanup: number = Date.now();

  /**
   * @param maxRequests - Maximum requests permitted within windowMs (default: 60)
   * @param windowMs - Window duration in milliseconds (default: 60,000 = 1 minute)
   */
  constructor(maxRequests = 60, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Evaluates if a request from the given IP is permitted
   */
  isAllowed(clientIp: string): { allowed: boolean; remaining: number; retryAfterSec?: number } {
    const now = Date.now();
    this.maybeCleanup(now);

    let record = this.records.get(clientIp);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(clientIp, record);
    }

    // Filter out timestamps outside the active sliding window
    const windowStart = now - this.windowMs;
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= this.maxRequests) {
      const oldestInWindow = record.timestamps[0];
      const retryAfterSec = Math.ceil((oldestInWindow + this.windowMs - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, retryAfterSec),
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      remaining: this.maxRequests - record.timestamps.length,
    };
  }

  private maybeCleanup(now: number) {
    // Run cleanup every 2 minutes
    if (now - this.lastCleanup > 120000) {
      this.lastCleanup = now;
      const windowStart = now - this.windowMs;
      for (const [ip, rec] of this.records.entries()) {
        rec.timestamps = rec.timestamps.filter((ts) => ts > windowStart);
        if (rec.timestamps.length === 0) {
          this.records.delete(ip);
        }
      }
    }
  }
}

export const globalRateLimiter = new MemoryRateLimiter(60, 60000); // 60 requests per minute per IP
