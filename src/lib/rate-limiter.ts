// Sliding-window rate limiter for Dome API
// Uses 10-second window to match API's rate limiting behavior

import { DomeTier, TIER_LIMITS } from '@/types/dome';

export interface RateLimiterStats {
  tier: DomeTier;
  requestsPerMinute: number;
  requestsIn10s: number;
  availableTokens: number;
  maxPer10s: number;
  isRateLimited: boolean;
  rateLimitedUntil: number | null;
}

export class RateLimiter {
  private tier: DomeTier;
  private requestTimestamps: number[] = [];  // Timestamps within 10s sliding window (for rate limiting)
  private requestTimestamps60s: number[] = [];  // Timestamps within 60s window (for accurate RPM)
  private lastRequestTime: number = 0;
  private rateLimitedUntil: number = 0;  // Pause until this timestamp if 429 received
  private listeners: Set<() => void> = new Set();
  
  // Custom QPS override (optional)
  private customQp10s: number | null = null;

  constructor(tier: DomeTier = 'free') {
    this.tier = tier;
    this.lastRequestTime = 0;
  }

  setTier(tier: DomeTier) {
    this.tier = tier;
    this.customQp10s = null; // Reset custom limits when tier changes
    this.notifyListeners();
  }

  getTier(): DomeTier {
    return this.tier;
  }

  // Set custom QPS limit (overrides tier-based limit)
  setCustomQps(qps: number) {
    this.customQp10s = Math.round(qps * 10);
    this.notifyListeners();
  }

  // Set QPS dynamically (can be called at runtime) - alias for setCustomQps
  setDynamicQps(qps: number) {
    this.customQp10s = Math.round(qps * 10);
    this.notifyListeners();
  }

  // Get current effective QPS
  getEffectiveQps(): number {
    return this.getQp10s() / 10;
  }

  private getQp10s(): number {
    if (this.customQp10s !== null) {
      return this.customQp10s;
    }
    return TIER_LIMITS[this.tier].qp10s;
  }

  public getIntervalMs(): number {
    const qp10s = this.getQp10s();
    // Spread requests evenly over 10 seconds
    return Math.ceil(10000 / qp10s);
  }

  // Mark rate limited by API - wait the specified duration
  public markRateLimited(retryAfterSeconds: number): void {
    this.rateLimitedUntil = Date.now() + (retryAfterSeconds * 1000) + 500; // +500ms buffer
    console.log(`[RateLimiter] Rate limited, pausing for ${retryAfterSeconds}s`);
    this.notifyListeners();
  }

  // Check if currently rate limited
  public isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
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
    const qp10s = this.getQp10s();
    
    // If we're rate limited by API, wait
    let now = Date.now();
    if (now < this.rateLimitedUntil) {
      const waitTime = this.rateLimitedUntil - now;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Check sliding window - if at limit, wait for oldest request to expire
    this.cleanupWindow();
    while (this.requestTimestamps.length >= qp10s) {
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
    this.notifyListeners();
  }

  // Stream-based acquisition - fires async callbacks as tokens become available
  // Callbacks run concurrently (don't wait for previous to complete), controlled by rate limit
  async acquireStream(count: number, onTokenAvailable: (index: number) => Promise<void> | void): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (let i = 0; i < count; i++) {
      await this.waitAndAcquire();
      // Fire callback immediately, don't await - allows concurrent execution
      const result = onTokenAvailable(i);
      if (result instanceof Promise) {
        promises.push(result);
      }
    }
    
    // Wait for all in-flight requests to complete
    await Promise.allSettled(promises);
  }

  // Check if a slot is available right now (non-blocking)
  canAcquireNow(): boolean {
    const now = Date.now();
    if (now < this.rateLimitedUntil) return false;
    
    this.cleanupWindow();
    const qp10s = this.getQp10s();
    if (this.requestTimestamps.length >= qp10s) return false;
    
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
    this.notifyListeners();
    return true;
  }

  getRequestsPerMinute(): number {
    // Actual count from 60-second window
    this.cleanupWindow();
    return this.requestTimestamps60s.length;
  }

  getRequestsIn10s(): number {
    this.cleanupWindow();
    return this.requestTimestamps.length;
  }

  getAvailableTokens(): number {
    this.cleanupWindow();
    const qp10s = this.getQp10s();
    return Math.max(0, qp10s - this.requestTimestamps.length);
  }

  // Track a request (for fire-and-forget calls where we still want to count)
  trackRequest(): void {
    this.lastRequestTime = Date.now();
    this.requestTimestamps.push(this.lastRequestTime);
    this.requestTimestamps60s.push(this.lastRequestTime);
    this.cleanupWindow();
    this.notifyListeners();
  }

  // Get stats for UI display
  getStats(): RateLimiterStats {
    this.cleanupWindow();
    const qp10s = this.getQp10s();
    return {
      tier: this.tier,
      requestsPerMinute: this.requestTimestamps60s.length,
      requestsIn10s: this.requestTimestamps.length,
      availableTokens: Math.max(0, qp10s - this.requestTimestamps.length),
      maxPer10s: qp10s,
      isRateLimited: Date.now() < this.rateLimitedUntil,
      rateLimitedUntil: this.rateLimitedUntil > Date.now() ? this.rateLimitedUntil : null,
    };
  }

  // Subscribe to changes
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l());
  }
}

// Platform-specific rate limiters - each gets its own pool
// Default to 'dev' tier, then set custom 50 QPS each
export const polymarketRateLimiter = new RateLimiter('dev');
export const kalshiRateLimiter = new RateLimiter('dev');

// Set 50 QPS for each platform (100 total combined)
polymarketRateLimiter.setCustomQps(50);
kalshiRateLimiter.setCustomQps(50);

// Legacy global rate limiter - points to polymarket for backward compatibility
export const globalRateLimiter = polymarketRateLimiter;

// Helper to set tier on all rate limiters
export function setAllTiers(tier: DomeTier) {
  polymarketRateLimiter.setTier(tier);
  kalshiRateLimiter.setTier(tier);
  // Re-apply custom QPS after tier change
  polymarketRateLimiter.setCustomQps(50);
  kalshiRateLimiter.setCustomQps(50);
}

// Get combined stats from both rate limiters
export function getCombinedStats(): { polymarket: RateLimiterStats; kalshi: RateLimiterStats; totalRpm: number } {
  const polyStats = polymarketRateLimiter.getStats();
  const kalshiStats = kalshiRateLimiter.getStats();
  return {
    polymarket: polyStats,
    kalshi: kalshiStats,
    totalRpm: polyStats.requestsPerMinute + kalshiStats.requestsPerMinute,
  };
}

// Allocate total QPS budget between platforms based on their workload
// Platform with more pages gets more QPS so both finish at approximately the same time
export function allocateQpsBudget(
  totalQps: number,
  polymarketPages: number,
  kalshiPages: number
): { polymarketQps: number; kalshiQps: number } {
  const totalPages = polymarketPages + kalshiPages;
  if (totalPages === 0) return { polymarketQps: totalQps / 2, kalshiQps: totalQps / 2 };
  
  // Allocate QPS proportionally to workload
  const polymarketQps = Math.max(10, Math.round((polymarketPages / totalPages) * totalQps));
  const kalshiQps = Math.max(10, totalQps - polymarketQps);
  
  return { polymarketQps, kalshiQps };
}
