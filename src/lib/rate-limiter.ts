// Sliding-window rate limiter for Dome API
// Uses 10-second window to match API's rate limiting behavior

import { DomeTier, TIER_LIMITS } from '@/types/dome';

export class RateLimiter {
  private tier: DomeTier;
  private requestTimestamps: number[] = [];  // Timestamps within 10s sliding window (for rate limiting)
  private requestTimestamps60s: number[] = [];  // Timestamps within 60s window (for accurate RPM)
  private lastRequestTime: number = 0;
  private rateLimitedUntil: number = 0;  // Pause until this timestamp if 429 received

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

  public getIntervalMs(): number {
    // Use 10-second window limit for pacing
    const limit = TIER_LIMITS[this.tier];
    // Spread requests evenly over 10 seconds
    return Math.ceil(10000 / limit.qp10s);
  }

  // Mark rate limited by API - wait the specified duration
  public markRateLimited(retryAfterSeconds: number): void {
    this.rateLimitedUntil = Date.now() + (retryAfterSeconds * 1000) + 500; // +500ms buffer
    console.log(`[RateLimiter] Rate limited, pausing for ${retryAfterSeconds}s`);
  }

  private cleanupWindow() {
    const now = Date.now();
    const windowStart10s = now - 10000; // 10-second sliding window
    const windowStart60s = now - 60000; // 60-second sliding window for RPM
    this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart10s);
    this.requestTimestamps60s = this.requestTimestamps60s.filter(t => t > windowStart60s);
  }

  private getRequestsInWindow(): number {
    this.cleanupWindow();
    return this.requestTimestamps.length;
  }

  // Wait for next available slot within rate limit
  async waitAndAcquire(): Promise<void> {
    const limit = TIER_LIMITS[this.tier];
    
    // If we're rate limited by API, wait
    let now = Date.now();
    if (now < this.rateLimitedUntil) {
      const waitTime = this.rateLimitedUntil - now;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Check sliding window - if at limit, wait for oldest request to expire
    this.cleanupWindow();
    while (this.requestTimestamps.length >= limit.qp10s) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = (oldestTimestamp + 10000) - Date.now() + 100; // Wait until it expires + buffer
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      this.cleanupWindow();
    }
    
    // Also enforce minimum interval between requests
    now = Date.now();
    const intervalMs = this.getIntervalMs();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < intervalMs && this.lastRequestTime > 0) {
      const waitTime = intervalMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestTimestamps.push(this.lastRequestTime);
    this.requestTimestamps60s.push(this.lastRequestTime);
  }

  // Stream-based acquisition - fires callback as tokens become available
  async acquireStream(count: number, onTokenAvailable: (index: number) => void): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.waitAndAcquire();
      onTokenAvailable(i);
    }
  }

  // Check if a slot is available right now (non-blocking)
  canAcquireNow(): boolean {
    const now = Date.now();
    if (now < this.rateLimitedUntil) return false;
    
    this.cleanupWindow();
    const limit = TIER_LIMITS[this.tier];
    if (this.requestTimestamps.length >= limit.qp10s) return false;
    
    const intervalMs = this.getIntervalMs();
    const timeSinceLastRequest = now - this.lastRequestTime;
    return timeSinceLastRequest >= intervalMs || this.lastRequestTime === 0;
  }

  // Try to acquire without waiting - returns true if acquired
  tryAcquire(): boolean {
    if (!this.canAcquireNow()) return false;
    
    const now = Date.now();
    this.lastRequestTime = now;
    this.requestTimestamps.push(now);
    this.requestTimestamps60s.push(now);
    return true;
  }

  getRequestsPerMinute(): number {
    // Actual count from 60-second window
    this.cleanupWindow();
    return this.requestTimestamps60s.length;
  }

  getAvailableTokens(): number {
    this.cleanupWindow();
    const limit = TIER_LIMITS[this.tier];
    return Math.max(0, limit.qp10s - this.requestTimestamps.length);
  }

  // Track a request (for fire-and-forget calls where we still want to count)
  trackRequest(): void {
    this.lastRequestTime = Date.now();
    this.requestTimestamps.push(this.lastRequestTime);
    this.requestTimestamps60s.push(this.lastRequestTime);
    this.cleanupWindow();
  }
}

// Global rate limiter instance - defaults to 'dev' tier based on typical API keys
export const globalRateLimiter = new RateLimiter('dev');
