// Token bucket rate limiter for Dome API

import { DomeTier, TIER_LIMITS } from '@/types/dome';

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private tier: DomeTier;
  private requestsInLastMinute: number[] = [];
  private lastRequestTime: number = 0;

  constructor(tier: DomeTier = 'free') {
    this.tier = tier;
    this.tokens = TIER_LIMITS[tier].qp10s;
    this.lastRefill = Date.now();
  }

  setTier(tier: DomeTier) {
    this.tier = tier;
    this.tokens = Math.min(this.tokens, TIER_LIMITS[tier].qp10s);
  }

  getTier(): DomeTier {
    return this.tier;
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

  private getMinDelayMs(): number {
    // Calculate minimum delay between requests based on QPS
    const limit = TIER_LIMITS[this.tier];
    return Math.ceil(1000 / limit.qps);
  }

  async acquire(): Promise<boolean> {
    this.refill();
    
    const now = Date.now();
    const minDelay = this.getMinDelayMs();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Must respect QPS limit - can't make requests faster than 1/qps seconds apart
    if (timeSinceLastRequest < minDelay) {
      return false;
    }
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.lastRequestTime = now;
      this.requestsInLastMinute.push(now);
      return true;
    }
    
    return false;
  }

  async waitAndAcquire(): Promise<void> {
    const limit = TIER_LIMITS[this.tier];
    const minDelay = this.getMinDelayMs();
    
    while (true) {
      this.refill();
      
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      // If we need to wait for QPS limit, calculate exact wait time
      if (timeSinceLastRequest < minDelay) {
        const waitTime = minDelay - timeSinceLastRequest + 50; // Add 50ms buffer
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Check if we have tokens available
      if (this.tokens >= 1) {
        this.tokens -= 1;
        this.lastRequestTime = Date.now();
        this.requestsInLastMinute.push(this.lastRequestTime);
        return;
      }
      
      // Wait for token refill
      const waitForToken = Math.ceil(1000 / limit.qps) + 50;
      await new Promise(resolve => setTimeout(resolve, waitForToken));
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
