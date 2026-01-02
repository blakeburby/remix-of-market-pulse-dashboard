// Dome API Types

export type Platform = 'POLYMARKET' | 'KALSHI';
export type MarketStatus = 'open' | 'closed';
export type DomeTier = 'free' | 'dev' | 'enterprise';

// Rate limits per tier - using 80% of actual limits for safety buffer
// API uses 10-second sliding window
export const TIER_LIMITS: Record<DomeTier, { qps: number; qp10s: number; subscriptions: number; walletsPerSub: number }> = {
  free: { qps: 4, qp10s: 40, subscriptions: 2, walletsPerSub: 5 },      // 5 actual, using 80%
  dev: { qps: 80, qp10s: 800, subscriptions: 500, walletsPerSub: 500 }, // 100/s actual, using 80%
  enterprise: { qps: 160, qp10s: 1600, subscriptions: 10000, walletsPerSub: 10000 },
};

// Polymarket Market Types
export interface PolymarketSide {
  // Dome response uses `id` for the token id in markets payload
  id?: string;
  // Some docs/versions use `token_id`
  token_id?: string;
  label: string;
}

export interface PolymarketMarket {
  market_slug: string;
  condition_id: string;
  title: string;
  start_time: number;
  end_time: number;
  status: MarketStatus;
  side_a: PolymarketSide;
  side_b: PolymarketSide;
  description?: string;
  tags?: string[];
}

export interface PolymarketMarketsResponse {
  markets: PolymarketMarket[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    has_more: boolean;
  };
}

export interface PolymarketPriceResponse {
  price: number;
  at_time: number;
}

// Kalshi Market Types
export interface KalshiMarket {
  event_ticker: string;
  market_ticker: string;
  title: string;
  start_time: number;
  end_time: number;
  close_time: number;
  status: MarketStatus;
  last_price: number; // in cents (0-100)
  volume: number;
  volume_24h: number;
}

export interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    has_more: boolean;
  };
}

// Unified Market Type for UI
export interface UnifiedMarket {
  id: string;
  platform: Platform;
  title: string;
  eventSlug?: string; // For grouping markets by event
  eventTitle?: string; // Display title for the event
  marketSlug?: string;
  conditionId?: string;
  kalshiMarketTicker?: string;
  kalshiEventTicker?: string;
  startTime: Date;
  endTime: Date;
  closeTime?: Date;
  status: MarketStatus;
  sideA: {
    tokenId?: string;
    label: string;
    price: number;
    probability: number;
    odds: number | null;
  };
  sideB: {
    tokenId?: string;
    label: string;
    price: number;
    probability: number;
    odds: number | null;
  };
  volume?: number;
  volume24h?: number;
  lastUpdated: Date;
  lastPriceUpdatedAt?: Date; // Timestamp when price was last fetched from API
}

// Grouped Event Type for UI
export interface GroupedEvent {
  eventSlug: string;
  eventTitle: string;
  platform: Platform;
  markets: UnifiedMarket[];
  totalVolume: number;
  earliestEnd: Date;
  latestEnd: Date;
  avgProbability: number;
}

// WebSocket Types
export interface DomeWSSubscription {
  action: 'subscribe';
  platform: 'polymarket';
  version: 1;
  type: 'orders';
  filters: {
    users?: string[];
    condition_ids?: string[];
    market_slugs?: string[];
  };
}

export interface DomeWSAck {
  type: 'ack';
  subscription_id: string;
}

export interface DomeWSEvent {
  type: 'event';
  subscription_id: string;
  data: {
    token_id: string;
    token_label: string;
    side: 'BUY' | 'SELL';
    market_slug: string;
    condition_id: string;
    shares: number;
    shares_normalized: number;
    price: number;
    tx_hash: string;
    timestamp: number;
    order_hash: string;
    user: string;
    taker: string;
  };
}

// Sync State
export interface SyncState {
  platform: Platform;
  lastFullDiscoveryAt: Date | null;
  lastOffsetUsed: number;
  lastError: string | null;
  lastSuccessAt: Date | null;
  isRunning: boolean;
}

// Discovery Progress
export interface DiscoveryProgress {
  polymarket: { offset: number; found: number; hasMore: boolean };
  kalshi: { offset: number; found: number; hasMore: boolean };
}

// Dashboard Summary
export interface DashboardSummary {
  totalMarkets: number;
  polymarketCount: number;
  kalshiCount: number;
  totalTokensTracked: number;
  lastDiscoveryTime: Date | null;
  lastPriceUpdateTime: Date | null;
  connectionMode: 'websocket' | 'polling' | 'disconnected';
  requestsPerMinute: number;
  marketsWithPrices: number;
  discoveryProgress: DiscoveryProgress | null;
  liveRpm: number;
  // Contract tracking
  totalContracts: number;
  matchedMarkets: number;
  matchedContracts: number;
  matchCoveragePercent: number;
  contractsByPlatform: {
    polymarket: number;
    kalshi: number;
  };
}

// Filter Options
export interface MarketFilters {
  search: string;
  platform: Platform | 'all';
  status: MarketStatus | 'all';
  minVolume: number;
  sortBy: 'expiration' | 'volume' | 'probability' | 'lastUpdated' | 'title';
  sortOrder: 'asc' | 'desc';
}

// Cross-Platform Arbitrage Types

// Matched market pair across platforms
export interface CrossPlatformMatch {
  polymarket: UnifiedMarket;
  kalshi: UnifiedMarket;
  matchScore: number; // 0-1 confidence of match
  matchReason: string; // Why we think they're the same
}

// Arbitrage opportunity
export interface ArbitrageOpportunity {
  id: string;
  match: CrossPlatformMatch;
  type: 'locked' | 'spread'; // locked = guaranteed profit
  
  // The trade to execute
  buyYesOn: Platform;
  buyNoOn: Platform;
  yesPlatformPrice: number; // 0-1
  noPlatformPrice: number; // 0-1
  
  // Profit calculation
  combinedCost: number; // e.g., 0.93
  guaranteedPayout: number; // always 1.0
  profitPercent: number; // e.g., 7.53%
  profitPerDollar: number; // e.g., $0.0753
  
  // Timing
  expirationDate: Date;
  lastUpdated: Date;
}
