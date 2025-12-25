// Steady-rate limiter for Dome API - exactly 100 QPS, no bursting

import { DomeTier, TIER_LIMITS } from '@/types/dome';

export class RateLimiter {
  private tier: DomeTier;
  private requestsInLastMinute: number[] = [];
  private lastRequestTime: number = 0;
  private requestQueue: Array<() => void> = [];
  private isProcessingQueue: boolean = false;

  constructor(tier: DomeTier = 'free') {
    this.tier = tier;
    this.lastRequestTime = 0;
  }

  setTier(tier: DomeTier) {
    this.tier = tier;
  }

  getTier(): DomeTier {
    return this.tier;
  }

  private getIntervalMs(): number {
    // Exact interval between requests: 1000ms / QPS
    // For dev tier (100 QPS): 10ms between requests
    const limit = TIER_LIMITS[this.tier];
    return Math.ceil(1000 / limit.qps);
  }

  private cleanupOldRequests() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.requestsInLastMinute = this.requestsInLastMinute.filter(t => t > oneMinuteAgo);
  }

  // Wait for next available slot - enforces exactly QPS rate with no bursting
  async waitAndAcquire(): Promise<void> {
    const intervalMs = this.getIntervalMs();
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // If we need to wait, wait exactly the right amount
    if (timeSinceLastRequest < intervalMs) {
      const waitTime = intervalMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestsInLastMinute.push(this.lastRequestTime);
    this.cleanupOldRequests();
  }

  // Stream-based acquisition for steady 100 QPS
  // Fires callback at exactly QPS rate - no bursting
  async acquireStream(count: number, onTokenAvailable: (index: number) => void): Promise<void> {
    const intervalMs = this.getIntervalMs();
    
    for (let i = 0; i < count; i++) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      // Wait for exact interval if needed
      if (timeSinceLastRequest < intervalMs && this.lastRequestTime > 0) {
        const waitTime = intervalMs - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      this.lastRequestTime = Date.now();
      this.requestsInLastMinute.push(this.lastRequestTime);
      
      // Fire callback immediately after acquiring slot
      onTokenAvailable(i);
    }
    
    this.cleanupOldRequests();
  }

  // Acquire multiple slots at steady rate (no bursting)
  // Waits for all slots to be acquired at QPS rate
  async acquireMultiple(count: number): Promise<void> {
    const intervalMs = this.getIntervalMs();
    
    for (let i = 0; i < count; i++) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < intervalMs && this.lastRequestTime > 0) {
        const waitTime = intervalMs - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      this.lastRequestTime = Date.now();
      this.requestsInLastMinute.push(this.lastRequestTime);
    }
    
    this.cleanupOldRequests();
  }

  // Simple acquire - returns true if slot available now
  async acquire(): Promise<boolean> {
    const intervalMs = this.getIntervalMs();
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest >= intervalMs || this.lastRequestTime === 0) {
      this.lastRequestTime = now;
      this.requestsInLastMinute.push(now);
      this.cleanupOldRequests();
      return true;
    }
    
    return false;
  }

  getRequestsPerMinute(): number {
    this.cleanupOldRequests();
    return this.requestsInLastMinute.length;
  }

  getAvailableTokens(): number {
    // With no bursting, either 1 or 0 available
    const intervalMs = this.getIntervalMs();
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    return timeSinceLastRequest >= intervalMs ? 1 : 0;
  }
}

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter('free');
