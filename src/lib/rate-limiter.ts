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

  // Acquire multiple tokens at once for parallel requests
  // Uses burst capacity first, then waits for refill as needed
  async acquireMultiple(count: number): Promise<void> {
    const limit = TIER_LIMITS[this.tier];
    this.refill();
    
    // Use available tokens immediately (burst capacity)
    if (this.tokens >= count) {
      this.tokens -= count;
      const now = Date.now();
      this.lastRequestTime = now;
      for (let i = 0; i < count; i++) {
        this.requestsInLastMinute.push(now);
      }
      return;
    }
    
    // Use what we have, then wait for the rest
    const availableNow = Math.floor(this.tokens);
    const tokensNeeded = count - availableNow;
    
    if (availableNow > 0) {
      this.tokens -= availableNow;
    }
    
    // Wait for remaining tokens to refill at QPS rate
    if (tokensNeeded > 0) {
      const waitTime = Math.ceil((tokensNeeded / limit.qps) * 1000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.refill();
      this.tokens -= tokensNeeded;
    }
    
    const now = Date.now();
    this.lastRequestTime = now;
    for (let i = 0; i < count; i++) {
      this.requestsInLastMinute.push(now);
    }
  }

  // Stream-based token acquisition for maximum throughput
  // Fires callback as soon as each token is available
  async acquireStream(count: number, onTokenAvailable: (index: number) => void): Promise<void> {
    const limit = TIER_LIMITS[this.tier];
    
    for (let i = 0; i < count; i++) {
      this.refill();
      
      // If token available, fire immediately
      if (this.tokens >= 1) {
        this.tokens -= 1;
        const now = Date.now();
        this.lastRequestTime = now;
        this.requestsInLastMinute.push(now);
        onTokenAvailable(i);
        continue;
      }
      
      // Wait for next token to refill (1/qps seconds)
      const waitTime = Math.ceil(1000 / limit.qps);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.refill();
      this.tokens -= 1;
      const now = Date.now();
      this.lastRequestTime = now;
      this.requestsInLastMinute.push(now);
      onTokenAvailable(i);
    }
  }

  // Optimized batch acquire that starts requests immediately with available tokens
  // Returns number of tokens available now, and schedules callback for the rest
  acquireImmediate(count: number): { immediate: number; waitMs: number } {
    const limit = TIER_LIMITS[this.tier];
    this.refill();
    
    const immediate = Math.min(Math.floor(this.tokens), count);
    const remaining = count - immediate;
    
    if (immediate > 0) {
      this.tokens -= immediate;
      const now = Date.now();
      this.lastRequestTime = now;
      for (let i = 0; i < immediate; i++) {
        this.requestsInLastMinute.push(now);
      }
    }
    
    const waitMs = remaining > 0 ? Math.ceil((remaining / limit.qps) * 1000) : 0;
    return { immediate, waitMs };
  }

  // Consume tokens after waiting (called after waitMs from acquireImmediate)
  consumeAfterWait(count: number): void {
    this.refill();
    this.tokens -= count;
    const now = Date.now();
    this.lastRequestTime = now;
    for (let i = 0; i < count; i++) {
      this.requestsInLastMinute.push(now);
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
