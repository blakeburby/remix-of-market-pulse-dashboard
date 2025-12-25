// Dome API Types

export type Platform = 'POLYMARKET' | 'KALSHI';
export type MarketStatus = 'open' | 'closed';
export type DomeTier = 'free' | 'dev' | 'enterprise';

// Rate limits per tier
export const TIER_LIMITS: Record<DomeTier, { qps: number; qp10s: number; subscriptions: number; walletsPerSub: number }> = {
  free: { qps: 10, qp10s: 10, subscriptions: 2, walletsPerSub: 5 },
  dev: { qps: 100, qp10s: 500, subscriptions: 500, walletsPerSub: 500 },
  enterprise: { qps: 1000, qp10s: 5000, subscriptions: 10000, walletsPerSub: 10000 },
};

// Polymarket Market Types
export interface PolymarketSide {
  token_id: string;
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
