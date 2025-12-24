// Token bucket rate limiter for Dome API

import { DomeTier, TIER_LIMITS } from '@/types/dome';

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private tier: DomeTier;
  private requestsInLastMinute: number[] = [];

  constructor(tier: DomeTier = 'free') {
    this.tier = tier;
    this.tokens = TIER_LIMITS[tier].qp10s;
    this.lastRefill = Date.now();
  }

  setTier(tier: DomeTier) {
    this.tier = tier;
    this.tokens = Math.min(this.tokens, TIER_LIMITS[tier].qp10s);
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const limit = TIER_LIMITS[this.tier];
    
    // Refill tokens based on QPS rate
    const tokensToAdd = elapsed * limit.qps;
    this.tokens = Math.min(this.tokens + tokensToAdd, limit.qp10s);
    this.lastRefill = now;
    
    // Clean up old request timestamps
    const oneMinuteAgo = now - 60000;
    this.requestsInLastMinute = this.requestsInLastMinute.filter(t => t > oneMinuteAgo);
  }

  async acquire(): Promise<boolean> {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.requestsInLastMinute.push(Date.now());
      return true;
    }
    
    return false;
  }

  async waitAndAcquire(): Promise<void> {
    while (!(await this.acquire())) {
      // Wait 100ms before trying again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  getRequestsPerMinute(): number {
    this.refill(); // This also cleans up old timestamps
    return this.requestsInLastMinute.length;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter('free');
