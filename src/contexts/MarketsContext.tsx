import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo, useDeferredValue } from 'react';
import { 
  UnifiedMarket, 
  Platform, 
  SyncState, 
  DashboardSummary,
  MarketFilters,
  PolymarketMarket,
  KalshiMarket,
  PolymarketMarketsResponse,
  KalshiMarketsResponse,
  KalshiMarketPriceResponse,
  PolymarketPriceResponse,
  GroupedEvent,
  DiscoveryProgress,
} from '@/types/dome';
import { useAuth } from '@/contexts/AuthContext';
import { polymarketRateLimiter, kalshiRateLimiter, getCombinedStats, allocateQpsBudget } from '@/lib/rate-limiter';
import { toast } from '@/hooks/use-toast';
import { useDomeWebSocket } from '@/hooks/useDomeWebSocket';
import { supabase } from '@/integrations/supabase/client';
import { useMarketsLoading } from './MarketsLoadingContext';

// Kalshi WebSocket status type (simplified - WebSocket is disabled)
type KalshiWSStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error';

interface MarketsContextType {
  markets: UnifiedMarket[];
  filteredMarkets: UnifiedMarket[];
  groupedEvents: GroupedEvent[];
  syncState: Record<Platform, SyncState>;
  summary: DashboardSummary;
  filters: MarketFilters;
  isDiscovering: boolean;
  isPriceUpdating: boolean;
  isLoadingMarkets: boolean;
  loadingProgress: { loaded: number; total: number };
  wsStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  wsSubscriptionCount: number;
  kalshiWsStatus: KalshiWSStatus;
  kalshiWsSubscriptionCount: number;
  isRefreshingKalshi: boolean;
  isRefreshingAllPrices: boolean;
  lastKalshiRefresh: Date | null;
  matchedPolymarketIds: Set<string>;
  fetchingPriceIds: Set<string>;
  setMatchedKalshiTickers: (tickers: Set<string>) => void;
  setFilters: (filters: Partial<MarketFilters>) => void;
  startDiscovery: () => void;
  stopDiscovery: () => void;
  startPriceUpdates: () => void;
  stopPriceUpdates: () => void;
  refreshKalshiPrices: () => void;
  refreshAllMatchedPrices: () => void;
  setMatchedPolymarketIds: (ids: Set<string>) => void;
  triggerImmediatePriceFetch: () => void;
  useCloudScanning: boolean;
  setUseCloudScanning: (value: boolean) => void;
  cloudScanJobId: string | null;
}

const defaultFilters: MarketFilters = {
  search: '',
  platform: 'all',
  status: 'open',
  minVolume: 0,
  sortBy: 'expiration',
  sortOrder: 'asc',
};

const defaultSyncState: SyncState = {
  platform: 'POLYMARKET',
  lastFullDiscoveryAt: null,
  lastOffsetUsed: 0,
  lastError: null,
  lastSuccessAt: null,
  isRunning: false,
};

const MarketsContext = createContext<MarketsContextType | null>(null);

// Helper for exponential backoff
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function MarketsProvider({ children }: { children: React.ReactNode }) {
  const { getApiKey, isAuthenticated, tier } = useAuth();
  const [markets, setMarkets] = useState<UnifiedMarket[]>([]);
  const [filters, setFiltersState] = useState<MarketFilters>(defaultFilters);
  const [syncState, setSyncState] = useState<Record<Platform, SyncState>>({
    POLYMARKET: { ...defaultSyncState, platform: 'POLYMARKET' },
    KALSHI: { ...defaultSyncState, platform: 'KALSHI' },
  });
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
  const [discoveryProgress, setDiscoveryProgress] = useState<DiscoveryProgress | null>(null);
  const [liveRpm, setLiveRpm] = useState(0);
  const [isRefreshingKalshi, setIsRefreshingKalshi] = useState(false);
  const [isRefreshingAllPrices, setIsRefreshingAllPrices] = useState(false);
  const isRefreshingAllPricesRef = useRef(false);
  const [lastKalshiRefresh, setLastKalshiRefresh] = useState<Date | null>(null);
  const [matchedPolymarketIds, setMatchedPolymarketIds] = useState<Set<string>>(new Set());
  const [matchedKalshiTickerCount, setMatchedKalshiTickerCount] = useState(0);
  const [fetchingPriceIds, setFetchingPriceIds] = useState<Set<string>>(new Set());

  const discoveryIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rpmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const priceUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchFlushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDiscoveringRef = useRef(false);
  const isPriceUpdatingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [wsEnabled, setWsEnabled] = useState(false);
  
  // Ref for matched IDs to avoid stale closure in warmup functions
  const matchedIdsRef = useRef<Set<string>>(new Set());
  matchedIdsRef.current = matchedPolymarketIds;

  // Ref for matched Kalshi tickers - provided by matcher (useArbitrage)
  const matchedKalshiTickersRef = useRef<Set<string>>(new Set());
  const startKalshiPriceLoopRef = useRef<(() => void) | null>(null);

  // Kalshi price loop control
  const isKalshiPricingRef = useRef(false);
  
  const [pendingWarmup, setPendingWarmup] = useState(false);
  const isWarmingUpRef = useRef(false);
  
  // Cloud scanning state - DISABLED: Client-only mode for reliability
  const [useCloudScanning, setUseCloudScanning] = useState(false); // Client-only mode
  const [cloudScanJobId, setCloudScanJobId] = useState<string | null>(null);

  // Batched price updates - accumulate updates and flush every 500ms to reduce re-renders
  const pendingPriceUpdates = useRef<Map<string, { priceA: number; priceB: number; timestamp: Date }>>(new Map());

  // Computed values
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isPriceUpdating, setIsPriceUpdating] = useState(false);

  // Get market slugs for WebSocket subscriptions - ONLY matched markets to prevent UI freeze
  const polymarketSlugs = useMemo(() => {
    // Only subscribe to matched markets (the ones with arbitrage opportunities)
    if (matchedPolymarketIds.size === 0) return [];
    
    return markets
      .filter(m => m.platform === 'POLYMARKET' && m.marketSlug && matchedPolymarketIds.has(m.id))
      .map(m => m.marketSlug!);
  }, [markets, matchedPolymarketIds]); // Re-compute when matched IDs change

  // Build a token-to-market index for O(1) lookup in price updates
  const tokenToMarketIndex = useMemo(() => {
    const map = new Map<string, { marketId: string; side: 'A' | 'B' }>();
    for (const market of markets) {
      if (market.sideA.tokenId) map.set(market.sideA.tokenId, { marketId: market.id, side: 'A' });
      if (market.sideB.tokenId) map.set(market.sideB.tokenId, { marketId: market.id, side: 'B' });
    }
    return map;
  }, [markets]);

  // WebSocket price update handler - optimized with O(1) lookup
  const handleWsPriceUpdate = useCallback((tokenId: string, price: number, timestamp: number) => {
    const indexEntry = tokenToMarketIndex.get(tokenId);
    if (!indexEntry) return; // Token not found, skip entirely

    const { marketId, side } = indexEntry;
    const priceUpdatedAt = new Date(timestamp * 1000);

    setMarkets((prev) =>
      prev.map((market) => {
        if (market.id !== marketId) return market; // Fast skip - O(1) comparison

        return {
          ...market,
          sideA: side === 'A'
            ? {
                ...market.sideA,
                price,
                probability: price,
                odds: price > 0 ? 1 / price : null,
              }
            : market.sideA,
          sideB: side === 'B'
            ? {
                ...market.sideB,
                price,
                probability: price,
                odds: price > 0 ? 1 / price : null,
              }
            : market.sideB,
          lastUpdated: priceUpdatedAt,
          lastPriceUpdatedAt: priceUpdatedAt,
        };
      })
    );

    setLastPriceUpdate(new Date());
  }, [tokenToMarketIndex]);

  // WebSocket connection for Polymarket - only connect when we have matched markets
  const { status: wsStatus, subscriptionCount: wsSubscriptionCount, isConnected: wsConnected } = useDomeWebSocket({
    apiKey: getApiKey(),
    tier,
    marketSlugs: polymarketSlugs,
    onPriceUpdate: handleWsPriceUpdate,
    enabled: wsEnabled && isAuthenticated && polymarketSlugs.length > 0,
  });

  // Kalshi WebSocket DISABLED - Edge function cannot reach Kalshi's servers (DNS resolution failure)
  // Using REST API polling instead via fetchMatchedKalshiPrices
  const kalshiWsStatus: KalshiWSStatus = 'disconnected';
  const kalshiWsSubscriptionCount = 0;

  // Deferred markets for expensive computations - prevents UI blocking
  const deferredMarkets = useDeferredValue(markets);

  // Filter and sort markets - use deferred markets for smoother UI
  const filteredMarkets = React.useMemo(() => {
    let result = [...deferredMarkets];

    // Apply search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(m => m.title.toLowerCase().includes(search));
    }

    // Apply platform filter
    if (filters.platform !== 'all') {
      result = result.filter(m => m.platform === filters.platform);
    }

    // Apply status filter
    if (filters.status !== 'all') {
      result = result.filter(m => m.status === filters.status);
    }

    // Apply volume filter (for Kalshi)
    if (filters.minVolume > 0) {
      result = result.filter(m => (m.volume || 0) >= filters.minVolume);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (filters.sortBy) {
        case 'expiration':
          comparison = a.endTime.getTime() - b.endTime.getTime();
          break;
        case 'volume':
          comparison = (b.volume || 0) - (a.volume || 0);
          break;
        case 'probability':
          comparison = (b.sideA.probability ?? 0) - (a.sideA.probability ?? 0);
          break;
        case 'lastUpdated':
          comparison = b.lastUpdated.getTime() - a.lastUpdated.getTime();
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
      }
      return filters.sortOrder === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [deferredMarkets, filters]);

  // Group filtered markets by event
  const groupedEvents: GroupedEvent[] = React.useMemo(() => {
    const eventMap = new Map<string, UnifiedMarket[]>();
    
    for (const market of filteredMarkets) {
      const key = `${market.platform}_${market.eventSlug || market.id}`;
      if (!eventMap.has(key)) {
        eventMap.set(key, []);
      }
      eventMap.get(key)!.push(market);
    }

    const events: GroupedEvent[] = [];
    for (const [key, eventMarkets] of eventMap) {
      if (eventMarkets.length === 0) continue;
      
      const firstMarket = eventMarkets[0];
      const totalVolume = eventMarkets.reduce((sum, m) => sum + (m.volume || 0), 0);
      const endTimes = eventMarkets.map(m => m.endTime.getTime());
      const validProbs = eventMarkets.filter(m => m.sideA.probability !== null);
      const avgProb = validProbs.length > 0 
        ? validProbs.reduce((sum, m) => sum + (m.sideA.probability ?? 0), 0) / validProbs.length
        : 0;

      events.push({
        eventSlug: firstMarket.eventSlug || firstMarket.id,
        eventTitle: firstMarket.eventTitle || firstMarket.title,
        platform: firstMarket.platform,
        markets: eventMarkets,
        totalVolume,
        earliestEnd: new Date(Math.min(...endTimes)),
        latestEnd: new Date(Math.max(...endTimes)),
        avgProbability: avgProb,
      });
    }

    // Sort events by earliest end time
    events.sort((a, b) => {
      if (filters.sortOrder === 'desc') {
        return b.earliestEnd.getTime() - a.earliestEnd.getTime();
      }
      return a.earliestEnd.getTime() - b.earliestEnd.getTime();
    });

    return events;
  }, [filteredMarkets, filters.sortOrder]);

  // Calculate summary - use deferred markets for smoother UI
  const summary: DashboardSummary = React.useMemo(() => {
    const polymarketMarkets = deferredMarkets.filter(m => m.platform === 'POLYMARKET');
    const kalshiMarketsFiltered = deferredMarkets.filter(m => m.platform === 'KALSHI');
    const polymarketCount = polymarketMarkets.length;
    const kalshiCount = kalshiMarketsFiltered.length;
    
    // Count all contracts (each market has 2 sides: Yes/No)
    const polyContracts = polymarketMarkets.length * 2;
    const kalshiContracts = kalshiMarketsFiltered.length * 2;
    const totalContracts = polyContracts + kalshiContracts;
    
    // Count token IDs (for Polymarket tokens specifically)
    const tokenCount = deferredMarkets.reduce((acc, m) => {
      return acc + (m.sideA.tokenId ? 1 : 0) + (m.sideB.tokenId ? 1 : 0);
    }, 0);

    // Count matched markets and contracts
    const matchedMarketCount = matchedPolymarketIds.size;
    // Matched pairs = matchedMarketCount Polymarket + matchedMarketCount Kalshi
    // Contracts in matched markets = pairs * 2 sides * 2 platforms
    const matchedContractCount = matchedMarketCount * 4;
    
    // Calculate coverage (what % of Polymarket markets are matched)
    const matchCoverage = polymarketCount > 0 
      ? (matchedMarketCount / polymarketCount) * 100 
      : 0;

    // Count markets with updated prices (has lastPriceUpdatedAt)
    const updatedPriceCount = deferredMarkets.filter(m => 
      m.lastPriceUpdatedAt !== null
    ).length;

    const lastDiscovery = [
      syncState.POLYMARKET.lastSuccessAt,
      syncState.KALSHI.lastSuccessAt,
    ].filter(Boolean).sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0))[0] || null;

    // Determine connection mode
    let connectionMode: 'websocket' | 'polling' | 'disconnected' = 'disconnected';
    if (wsConnected) {
      connectionMode = 'websocket';
    } else if (isPriceUpdating) {
      connectionMode = 'polling';
    }

    return {
      totalMarkets: deferredMarkets.length,
      polymarketCount,
      kalshiCount,
      totalTokensTracked: tokenCount,
      lastDiscoveryTime: lastDiscovery,
      lastPriceUpdateTime: lastPriceUpdate,
      connectionMode,
      requestsPerMinute: getCombinedStats().totalRpm,
      marketsWithPrices: updatedPriceCount,
      discoveryProgress,
      liveRpm,
      // Contract tracking
      totalContracts,
      matchedMarkets: matchedMarketCount,
      matchedContracts: matchedContractCount,
      matchCoveragePercent: matchCoverage,
      contractsByPlatform: {
        polymarket: polyContracts,
        kalshi: kalshiContracts,
      },
    };
  }, [deferredMarkets, syncState, lastPriceUpdate, isPriceUpdating, wsConnected, discoveryProgress, liveRpm, matchedPolymarketIds]);

  const setFilters = useCallback((newFilters: Partial<MarketFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Extract event slug from market slug (e.g., "will-btc-hit-100k" from "will-btc-hit-100k-by-2024")
  const extractEventSlug = (marketSlug: string): string => {
    // For Polymarket, the market_slug often contains the event identifier
    // We'll use a simplified approach - group by first 3 words or the whole slug if short
    const parts = marketSlug.split('-');
    if (parts.length <= 4) return marketSlug;
    // Take first 4 parts as the event slug
    return parts.slice(0, 4).join('-');
  };

  // Generate a readable event title from slug
  const slugToTitle = (slug: string): string => {
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Convert Polymarket market to unified format - NO PRICES during discovery
  const convertPolymarketMarket = useCallback((market: PolymarketMarket): UnifiedMarket => {
    const sideATokenId = (market.side_a as any).token_id ?? (market.side_a as any).id;
    const sideBTokenId = (market.side_b as any).token_id ?? (market.side_b as any).id;

    const aLabel = market.side_a.label.toLowerCase();
    const bLabel = market.side_b.label.toLowerCase();

    const aIsYes = aLabel.includes('yes');
    const aIsNo = aLabel.includes('no');
    const bIsYes = bLabel.includes('yes');
    const bIsNo = bLabel.includes('no');

    const isYesNoMarket = (aIsYes && bIsNo) || (aIsNo && bIsYes);

    // Ensure sideA is always YES and sideB is always NO for YES/NO markets.
    const yesTokenId = isYesNoMarket
      ? (aIsYes ? sideATokenId : sideBTokenId)
      : sideATokenId;
    const noTokenId = isYesNoMarket
      ? (aIsNo ? sideATokenId : sideBTokenId)
      : sideBTokenId;

    const eventSlug = extractEventSlug(market.market_slug);

    // CRITICAL: Do NOT set prices during discovery - they must come from explicit price fetch
    return {
      id: `poly_${market.condition_id}`,
      platform: 'POLYMARKET',
      title: market.title,
      eventSlug,
      eventTitle: slugToTitle(eventSlug),
      marketSlug: market.market_slug,
      conditionId: market.condition_id,
      startTime: new Date(market.start_time * 1000),
      endTime: new Date(market.end_time * 1000),
      status: market.status,
      sideA: {
        tokenId: yesTokenId,
        label: isYesNoMarket ? 'Yes' : market.side_a.label,
        price: null,       // null = not yet fetched
        probability: null, // null = not yet fetched
        odds: null,
      },
      sideB: {
        tokenId: noTokenId,
        label: isYesNoMarket ? 'No' : market.side_b.label,
        price: null,       // null = not yet fetched
        probability: null, // null = not yet fetched
        odds: null,
      },
      lastUpdated: new Date(),
      lastPriceUpdatedAt: null, // null = never priced
    };
  }, []);

  // Convert Kalshi market to unified format - NO PRICES during discovery
  // Prices must come from explicit refresh, not discovery last_price
  const convertKalshiMarket = useCallback((market: KalshiMarket): UnifiedMarket => {
    // CRITICAL: Do NOT use last_price as a live price - discovery is identification only
    return {
      id: `kalshi_${market.market_ticker}`,
      platform: 'KALSHI',
      title: market.title,
      eventSlug: market.event_ticker, // Kalshi has explicit event_ticker
      eventTitle: market.event_ticker.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      kalshiMarketTicker: market.market_ticker,
      kalshiEventTicker: market.event_ticker,
      startTime: new Date(market.start_time * 1000),
      endTime: new Date(market.end_time * 1000),
      closeTime: new Date(market.close_time * 1000),
      status: market.status,
      sideA: {
        label: 'Yes',
        price: null,       // null = not yet fetched
        probability: null, // null = not yet fetched
        odds: null,
      },
      sideB: {
        label: 'No',
        price: null,       // null = not yet fetched
        probability: null, // null = not yet fetched
        odds: null,
      },
      volume: market.volume,
      volume24h: market.volume_24h,
      lastUpdated: new Date(),
      lastPriceUpdatedAt: null, // null = never priced
    };
  }, []);

  // Flush pending price updates to state - called on interval
  const flushPendingPriceUpdates = useCallback(() => {
    if (pendingPriceUpdates.current.size === 0) return;
    
    const updates = new Map(pendingPriceUpdates.current);
    pendingPriceUpdates.current.clear();
    
    setMarkets(prev => prev.map(m => {
      const update = updates.get(m.id);
      if (!update) return m;
      return {
        ...m,
        sideA: { ...m.sideA, price: update.priceA, probability: update.priceA, odds: update.priceA > 0 ? 1 / update.priceA : null },
        sideB: { ...m.sideB, price: update.priceB, probability: update.priceB, odds: update.priceB > 0 ? 1 / update.priceB : null },
        lastUpdated: update.timestamp,
        lastPriceUpdatedAt: update.timestamp,
      };
    }));
    setLastPriceUpdate(new Date());
  }, []);

  // Start batch flush interval
  useEffect(() => {
    batchFlushIntervalRef.current = setInterval(flushPendingPriceUpdates, 500);
    return () => {
      if (batchFlushIntervalRef.current) {
        clearInterval(batchFlushIntervalRef.current);
      }
    };
  }, [flushPendingPriceUpdates]);

  // Make a rate-limited API request with retry logic
  const rateLimitedFetch = async (
    url: string,
    apiKey: string,
    platform: Platform,
    signal?: AbortSignal,
    retries = 5
  ): Promise<Response> => {
    const rateLimiter = platform === 'POLYMARKET' ? polymarketRateLimiter : kalshiRateLimiter;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      // Wait for platform-specific rate limiter
      await rateLimiter.waitAndAcquire();

      if (signal?.aborted) {
        throw new Error('Aborted');
      }

      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal,
        });

        if (response.status === 429) {
          // Parse retry_after from API response
          const data = await response.json().catch(() => ({}));
          const retryAfter = data.retry_after || (Math.pow(2, attempt + 1) * 2);
          const waitTime = (retryAfter * 1000) + Math.random() * 500;
          console.log(`Rate limited (429), waiting ${Math.round(waitTime)}ms (retry_after: ${retryAfter}s)...`);
          await sleep(waitTime);
          continue;
        }

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        return response;
      } catch (error) {
        if (signal?.aborted) {
          throw new Error('Aborted');
        }
        if (attempt === retries - 1) {
          throw error;
        }
        // Wait before retry with longer backoff
        await sleep(Math.pow(2, attempt + 1) * 1500);
      }
    }
    throw new Error('Max retries exceeded');
  };

  const priceWarmupChainRef = useRef<Promise<void>>(Promise.resolve());

  // OPTIMIZATION: Only warm prices for markets that have matches
  const warmMatchedPolymarketPrices = useCallback(async (
    discoveredMarkets: UnifiedMarket[],
    apiKey: string,
    signal?: AbortSignal
  ) => {
    // Only warm prices for matched Polymarket markets
    const matchedIds = matchedIdsRef.current;
    const targets = discoveredMarkets.filter(
      (m) =>
        m.platform === 'POLYMARKET' &&
        m.sideA.tokenId &&
        m.sideB.tokenId &&
        matchedIds.has(m.id)
    );

    if (targets.length === 0) {
      console.log('[Price Warmup] No matched markets to warm');
      return;
    }

    console.log(
      `[Price Warmup] Warming ${targets.length} matched markets (skipping ${
        discoveredMarkets.filter((m) => m.platform === 'POLYMARKET').length - targets.length
      } unmatched)`
    );

    // IMPORTANT: Polymarket YES/NO token prices are not guaranteed to sum to 1.
    // We must fetch BOTH token prices and store them independently.
    const pending = new Map<string, { priceA?: number; priceB?: number }>();

    // Batch size here is "requests" (2 requests per market)
    const REQUEST_BATCH_SIZE = tier === 'free' ? 6 : 20;

    const flush = () => {
      if (pending.size === 0) return;
      const snapshot = new Map(pending);
      pending.clear();

      const now = new Date();
      setMarkets((prev) =>
        prev.map((m) => {
          const entry = snapshot.get(m.id);
          if (!entry) return m;
          if (typeof entry.priceA !== 'number' || typeof entry.priceB !== 'number') return m;

          const priceA = entry.priceA;
          const priceB = entry.priceB;

          return {
            ...m,
            sideA: {
              ...m.sideA,
              price: priceA,
              probability: priceA,
              odds: priceA > 0 ? 1 / priceA : null,
            },
            sideB: {
              ...m.sideB,
              price: priceB,
              probability: priceB,
              odds: priceB > 0 ? 1 / priceB : null,
            },
            lastUpdated: now,
            lastPriceUpdatedAt: now,
          };
        })
      );
      setLastPriceUpdate(new Date());
    };

    const jobs = targets.flatMap((market) => [
      { marketId: market.id, side: 'A' as const, tokenId: market.sideA.tokenId! },
      { marketId: market.id, side: 'B' as const, tokenId: market.sideB.tokenId! },
    ]);

    for (let i = 0; i < jobs.length; i += REQUEST_BATCH_SIZE) {
      if (signal?.aborted) break;

      const batch = jobs.slice(i, i + REQUEST_BATCH_SIZE);
      const promises: Promise<void>[] = [];

      await polymarketRateLimiter.acquireStream(batch.length, (index) => {
        const job = batch[index];

        const promise = fetch(`https://api.domeapi.io/v1/polymarket/market-price/${job.tokenId}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal,
        })
          .then(async (resp) => {
            if (!resp.ok) return;
            const data: PolymarketPriceResponse = await resp.json();
            if (typeof data.price !== 'number') return;

            const prev = pending.get(job.marketId) ?? {};
            pending.set(job.marketId, {
              ...prev,
              ...(job.side === 'A' ? { priceA: data.price } : { priceB: data.price }),
            });
          })
          .catch(() => {});

        promises.push(promise);
      });

      await Promise.allSettled(promises);
      flush();
    }
  }, [tier]);

  // Fetch markets from a single platform
  // Polymarket uses parallel offset-based fetching
  // Kalshi uses sequential cursor-based pagination (required by API for >10k records)
  const fetchPlatformMarkets = async (
    platform: Platform,
    signal?: AbortSignal,
    totalMarkets?: number  // Pass from probe response for parallel fetching (Polymarket only)
  ): Promise<UnifiedMarket[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    const limit = 100;
    const rateLimiter = platform === 'POLYMARKET' ? polymarketRateLimiter : kalshiRateLimiter;
    
    const baseUrl = platform === 'POLYMARKET'
      ? 'https://api.domeapi.io/v1/polymarket/markets'
      : 'https://api.domeapi.io/v1/kalshi/markets';

    setSyncState(prev => ({
      ...prev,
      [platform]: { ...prev[platform], isRunning: true, lastError: null },
    }));

    // Initialize discovery progress
    setDiscoveryProgress(prev => {
      const base = {
        polymarket: prev?.polymarket ?? { offset: 0, found: 0, hasMore: true },
        kalshi: prev?.kalshi ?? { offset: 0, found: 0, hasMore: true },
        status: prev?.status ?? 'running' as const,
        startedAt: prev?.startedAt ?? new Date(),
        completedAt: prev?.completedAt ?? null,
      };
      if (platform === 'POLYMARKET') {
        base.polymarket = { offset: 0, found: 0, hasMore: true };
      } else {
        base.kalshi = { offset: 0, found: 0, hasMore: true };
      }
      return base;
    });

    // Collect all markets
    const allMarkets: UnifiedMarket[] = [];

    try {
      if (platform === 'POLYMARKET') {
        // POLYMARKET: Parallel offset-based fetching (works fine)
        const estimatedTotal = totalMarkets ?? 4000;
        const totalPages = Math.ceil(estimatedTotal / limit);
        const offsets = Array.from({ length: totalPages }, (_, i) => i * limit);
        
        let pagesCompleted = 0;
        let hitEmptyPage = false;

        await rateLimiter.acquireStream(offsets.length, async (index) => {
          if (signal?.aborted || hitEmptyPage) return;
          
          const offset = offsets[index];
          const url = `${baseUrl}?status=open&limit=${limit}&offset=${offset}`;
          
          try {
            const response = await rateLimitedFetch(url, apiKey, platform, signal);
            const data: PolymarketMarketsResponse = await response.json();
            const pageMarkets = data.markets.map(convertPolymarketMarket);
            const hasMore = data.pagination.has_more;

            if (pageMarkets.length === 0) {
              hitEmptyPage = true;
              return;
            }

            allMarkets.push(...pageMarkets);
            pagesCompleted++;

            // Update discovery progress
            setDiscoveryProgress(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                polymarket: { 
                  offset: pagesCompleted * limit, 
                  found: allMarkets.length, 
                  hasMore: hasMore && !hitEmptyPage 
                },
              };
            });

            // Batch state updates every 5 pages
            if (pagesCompleted % 5 === 0 || !hasMore || hitEmptyPage) {
              setMarkets(prev => {
                const existing = new Map(prev.map(m => [m.id, m]));
                for (const market of allMarkets) {
                  const prevMarket = existing.get(market.id);
                  if (prevMarket && prevMarket.platform === platform) {
                    existing.set(market.id, {
                      ...market,
                      sideA: { ...market.sideA, price: prevMarket.sideA.price, probability: prevMarket.sideA.probability, odds: prevMarket.sideA.odds },
                      sideB: { ...market.sideB, price: prevMarket.sideB.price, probability: prevMarket.sideB.probability, odds: prevMarket.sideB.odds },
                      lastUpdated: prevMarket.lastUpdated ?? market.lastUpdated,
                    });
                  } else {
                    existing.set(market.id, market);
                  }
                }
                return Array.from(existing.values());
              });
            }

            if (pagesCompleted % 10 === 0) {
              console.log(`[Discovery] ${platform}: page=${index + 1}/${totalPages} found=${allMarkets.length}`);
            }
          } catch (error) {
            if ((error as Error).message !== 'Aborted') {
              console.error(`[Discovery] ${platform} page ${index} error:`, error);
            }
          }
        });
      } else {
        // KALSHI: Sequential cursor-based pagination (required for >10k records)
        let paginationKey: string | undefined;
        let hasMore = true;
        let pageCount = 0;
        const MAX_PAGES = 200; // Safety limit

        while (hasMore && pageCount < MAX_PAGES) {
          if (signal?.aborted) break;
          
          // Wait for rate limiter
          await rateLimiter.waitAndAcquire();
          
          // Build URL with cursor
          let url = `${baseUrl}?status=open&limit=${limit}`;
          if (paginationKey) {
            url += `&pagination_key=${encodeURIComponent(paginationKey)}`;
          }
          
          try {
            const response = await fetch(url, {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              signal,
            });

            if (response.status === 429) {
              const data = await response.json().catch(() => ({}));
              const retryAfter = data.retry_after || 10;
              console.log(`[Discovery] Kalshi rate limited, waiting ${retryAfter}s`);
              rateLimiter.markRateLimited(retryAfter);
              await sleep(retryAfter * 1000 + 500);
              continue; // Retry same page
            }

            if (!response.ok) {
              console.error(`[Discovery] Kalshi API error: ${response.status}`);
              break;
            }

            const data = await response.json();
            const pageMarkets = (data.markets || []).map(convertKalshiMarket);
            
            // Extract next cursor
            paginationKey = data.pagination?.next_key || data.pagination?.pagination_key;
            hasMore = data.pagination?.has_more ?? (pageMarkets.length === limit && !!paginationKey);

            if (pageMarkets.length === 0) {
              hasMore = false;
              break;
            }

            allMarkets.push(...pageMarkets);
            pageCount++;

            // Update discovery progress
            setDiscoveryProgress(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                kalshi: { 
                  offset: pageCount * limit, 
                  found: allMarkets.length, 
                  hasMore 
                },
              };
            });

            // Batch state updates every 5 pages
            if (pageCount % 5 === 0 || !hasMore) {
              setMarkets(prev => {
                const existing = new Map(prev.map(m => [m.id, m]));
                for (const market of allMarkets) {
                  const prevMarket = existing.get(market.id);
                  if (prevMarket && prevMarket.platform === platform) {
                    existing.set(market.id, {
                      ...market,
                      sideA: { ...market.sideA, price: prevMarket.sideA.price, probability: prevMarket.sideA.probability, odds: prevMarket.sideA.odds },
                      sideB: { ...market.sideB, price: prevMarket.sideB.price, probability: prevMarket.sideB.probability, odds: prevMarket.sideB.odds },
                      lastUpdated: prevMarket.lastUpdated ?? market.lastUpdated,
                    });
                  } else {
                    existing.set(market.id, market);
                  }
                }
                return Array.from(existing.values());
              });
            }

            if (pageCount % 10 === 0) {
              console.log(`[Discovery] Kalshi: page=${pageCount} found=${allMarkets.length} hasMore=${hasMore}`);
            }
          } catch (error) {
            if ((error as Error).message === 'Aborted') break;
            console.error(`[Discovery] Kalshi page ${pageCount} error:`, error);
            // Continue to next attempt after brief delay
            await sleep(1000);
          }
        }

        if (pageCount >= MAX_PAGES) {
          console.warn('[Discovery] Kalshi hit max page limit');
        }
      }

      setSyncState(prev => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          lastFullDiscoveryAt: new Date(),
          lastOffsetUsed: allMarkets.length,
          lastError: null,
          lastSuccessAt: new Date(),
          isRunning: false,
        },
      }));

      // Mark platform as done in discovery progress
      setDiscoveryProgress(prev => {
        if (!prev) return prev;
        const updated = { ...prev };
        if (platform === 'POLYMARKET') {
          updated.polymarket = { ...updated.polymarket, hasMore: false };
        } else {
          updated.kalshi = { ...updated.kalshi, hasMore: false };
        }
        return updated;
      });

      return allMarkets;
    } catch (error) {
      if ((error as Error).message === 'Aborted') {
        return allMarkets;
      }
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setSyncState(prev => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          lastError: errorMsg,
          isRunning: false,
        },
      }));
      return allMarkets;
    }
  };

  // Run discovery for both platforms in parallel with dynamic QPS allocation
  const runDiscovery = useCallback(async () => {
    if (!isDiscoveringRef.current) return;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Reset discovery progress with start time
    setDiscoveryProgress({
      polymarket: { offset: 0, found: 0, hasMore: true },
      kalshi: { offset: 0, found: 0, hasMore: true },
      status: 'running',
      startedAt: new Date(),
      completedAt: null,
    });

    try {
      const apiKey = getApiKey();
      if (!apiKey) return;

      // Phase 1: Probe to get total counts (1 request each with limit=1)
      // IMPORTANT: Dome API limit is 50 requests per 10 seconds = 5 QPS total
      const TOTAL_QPS = 5;
      const PAGE_SIZE = 100;
      
      const [polyProbe, kalshiProbe] = await Promise.all([
        fetch('https://api.domeapi.io/v1/polymarket/markets?status=open&limit=1', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal,
        }),
        fetch('https://api.domeapi.io/v1/kalshi/markets?status=open&limit=1', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal,
        }),
      ]);

      if (signal.aborted) return;

      // Get total counts from headers or estimate from known data
      const polyTotalHeader = polyProbe.headers.get('x-total-count');
      const kalshiTotalHeader = kalshiProbe.headers.get('x-total-count');
      
      // Fallback estimates based on typical market counts
      const polyTotal = polyTotalHeader ? parseInt(polyTotalHeader, 10) : 4000;
      const kalshiTotal = kalshiTotalHeader ? parseInt(kalshiTotalHeader, 10) : 14000;
      
      const polyPages = Math.ceil(polyTotal / PAGE_SIZE);
      const kalshiPages = Math.ceil(kalshiTotal / PAGE_SIZE);
      
      // Phase 2: Allocate QPS proportionally so both finish at the same time
      // Note: Kalshi now uses sequential cursor-based pagination, so it can't parallel fetch
      // Give Polymarket slightly more since it can parallelize
      const { polymarketQps, kalshiQps } = allocateQpsBudget(TOTAL_QPS, polyPages, kalshiPages);
      
      polymarketRateLimiter.setDynamicQps(polymarketQps);
      kalshiRateLimiter.setDynamicQps(kalshiQps);
      
      console.log(`[Discovery] Allocated QPS - Polymarket: ${polymarketQps.toFixed(1)} (${polyPages} pages), Kalshi: ${kalshiQps.toFixed(1)} (${kalshiPages} pages, sequential)`);


      // Phase 3: Fetch BOTH platforms in parallel with known totals for parallel page fetching
      const [polymarketMarkets, kalshiMarkets] = await Promise.all([
        fetchPlatformMarkets('POLYMARKET', signal, polyTotal),
        fetchPlatformMarkets('KALSHI', signal, kalshiTotal),
      ]);

      if (signal.aborted) return;

      // Mark discovery as completed with timestamp
      const completedAt = new Date();
      setDiscoveryProgress(prev => prev ? {
        ...prev,
        status: 'completed',
        completedAt,
      } : null);

      // OPTIMIZATION: Set pendingWarmup flag - actual warmup happens via useEffect
      // when matchedPolymarketIds is populated (after matching completes)
      setPendingWarmup(true);

      if (polymarketMarkets.length > 0 || kalshiMarkets.length > 0) {
        // Calculate duration
        const startTime = discoveryProgress?.startedAt;
        const durationSecs = startTime 
          ? Math.round((completedAt.getTime() - startTime.getTime()) / 1000)
          : 0;
        const durationStr = durationSecs > 60 
          ? `${Math.floor(durationSecs / 60)}m ${durationSecs % 60}s`
          : `${durationSecs}s`;
        
        toast({
          title: "Discovery complete",
          description: `Found ${(polymarketMarkets.length + kalshiMarkets.length).toLocaleString()} markets in ${durationStr}`,
        });
      }
      
      // Clear discovery progress after a delay to show completion state
      setTimeout(() => {
        setDiscoveryProgress(null);
      }, 5000);
    } catch (error) {
      console.error('Discovery error:', error);
      setDiscoveryProgress(prev => prev ? {
        ...prev,
        status: 'error',
        completedAt: new Date(),
      } : null);
    }
  }, [getApiKey, fetchPlatformMarkets, tier, warmMatchedPolymarketPrices]);

  // Track failed token IDs to avoid retrying them
  const failedTokenIds = useRef<Set<string>>(new Set());

  // Price update uses the same shared rate limit refs from discovery
  // But we need local refs since they're defined after the discovery functions
  const priceRateLimitedUntil = useRef<number>(0);
  const priceLastRequestTime = useRef<number>(0);

  // Fetch price for a Polymarket token with rate limiting
  const fetchTokenPriceDirect = async (
    tokenId: string, 
    apiKey: string
  ): Promise<{ tokenId: string; price: number | null; rateLimited?: boolean }> => {
    if (failedTokenIds.current.has(tokenId)) {
      return { tokenId, price: null };
    }

    // CRITICAL: Wait for rate limiter BEFORE making request (Polymarket price endpoint)
    await polymarketRateLimiter.waitAndAcquire();

    try {
      const response = await fetch(
        `https://api.domeapi.io/v1/polymarket/market-price/${tokenId}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 404) {
        failedTokenIds.current.add(tokenId);
        return { tokenId, price: null };
      }

      if (response.status === 429) {
        const data = await response.json().catch(() => ({}));
        const retryAfter = data.retry_after || 10;
        polymarketRateLimiter.markRateLimited(retryAfter);
        priceRateLimitedUntil.current = Date.now() + retryAfter * 1000;
        console.log(`[Price] Rate limited, backing off for ${retryAfter}s`);
        return { tokenId, price: null, rateLimited: true };
      }

      if (!response.ok) {
        return { tokenId, price: null };
      }

      const data: PolymarketPriceResponse = await response.json();
      return { tokenId, price: data.price };
    } catch (error) {
      return { tokenId, price: null };
    }
  };

  // Using refs to access current derived values to avoid stale closures
  const marketsRef = useRef(markets);
  marketsRef.current = markets;

  const filteredMarketsRef = useRef(filteredMarkets);
  filteredMarketsRef.current = filteredMarkets;

  // Track cursor for round-robin price fetching of matched markets
  const matchedCursorRef = useRef(0);
  const lastQpsLogAtRef = useRef(0);

  // Sequential price loop - fetches one at a time with proper rate limiting
  const priceLoopRunningRef = useRef(false);
  
  const runPriceLoop = useCallback(async () => {
    if (priceLoopRunningRef.current) return;
    priceLoopRunningRef.current = true;
    
    const apiKey = getApiKey();
    if (!apiKey) {
      priceLoopRunningRef.current = false;
      return;
    }
    
    while (isPriceUpdatingRef.current) {
      const now = Date.now();
      
      // Backoff if rate limited
      if (now < priceRateLimitedUntil.current) {
        await sleep(priceRateLimitedUntil.current - now + 100);
        continue;
      }
      
      const candidateMarkets = filteredMarketsRef.current.length > 0
        ? filteredMarketsRef.current
        : marketsRef.current;

      const tokenMarkets = candidateMarkets.filter(
        (m) =>
          m.platform === 'POLYMARKET' &&
          m.sideA.tokenId &&
          m.sideB.tokenId &&
          !failedTokenIds.current.has(m.sideA.tokenId) &&
          !failedTokenIds.current.has(m.sideB.tokenId)
      );

      if (tokenMarkets.length === 0) {
        await sleep(1000); // Wait and retry
        continue;
      }

      // Prioritize matched markets
      const matchedMarkets = tokenMarkets.filter((m) => matchedIdsRef.current.has(m.id));
      const targetMarkets = matchedMarkets.length > 0 ? matchedMarkets : tokenMarkets;

      // Round-robin through target markets
      const idx = matchedCursorRef.current % targetMarkets.length;
      matchedCursorRef.current = idx + 1;
      const market = targetMarkets[idx];

      const tokenA = market.sideA.tokenId!;
      const tokenB = market.sideB.tokenId!;

      // Fetch BOTH token prices (YES + NO)
      const resA = await fetchTokenPriceDirect(tokenA, apiKey);
      if (resA.rateLimited) {
        // Already handled inside fetchTokenPriceDirect
        continue;
      }

      const resB = await fetchTokenPriceDirect(tokenB, apiKey);
      if (resB.rateLimited) {
        // Already handled inside fetchTokenPriceDirect
        continue;
      }

      if (typeof resA.price === 'number' && typeof resB.price === 'number') {
        pendingPriceUpdates.current.set(market.id, {
          priceA: resA.price,
          priceB: resB.price,
          timestamp: new Date(),
        });
      }

      // Debug: log achieved RPM every ~10s
      const logNow = Date.now();
      if (logNow - lastQpsLogAtRef.current > 10000) {
        lastQpsLogAtRef.current = logNow;
        console.log(`[Price] RPM=${getCombinedStats().totalRpm} matched=${matchedMarkets.length} target=${targetMarkets.length}`);
      }
    }
    
    priceLoopRunningRef.current = false;
  }, [getApiKey]);

  const startSteadyPriceLoop = useCallback(() => {
    runPriceLoop();
  }, [runPriceLoop]);

  const stopSteadyPriceLoop = useCallback(() => {
    // Loop will stop on its own when isPriceUpdatingRef becomes false
  }, []);

  // Backwards-compat: keep runPriceUpdate but it just ensures steady loop is running.
  const runPriceUpdate = useCallback(async () => {
    if (!isPriceUpdatingRef.current) return;
    startSteadyPriceLoop();
  }, [startSteadyPriceLoop]);

  // Cloud-based discovery using edge function
  const runCloudDiscovery = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;
    
    setDiscoveryProgress({
      polymarket: { offset: 0, found: 0, hasMore: true },
      kalshi: { offset: 0, found: 0, hasMore: true },
      status: 'running',
      startedAt: new Date(),
      completedAt: null,
    });
    
    try {
      // Call edge function to start cloud scanning
      const { data, error } = await supabase.functions.invoke('scan-markets', {
        body: { dome_api_key: apiKey },
      });
      
      if (error) {
        console.error('[Cloud Discovery] Edge function error:', error);
        throw error;
      }
      
      setCloudScanJobId(data.jobId);
      console.log('[Cloud Discovery] Started job:', data.jobId);
      
      toast({
        title: "Cloud scan started",
        description: "Markets are being scanned in the cloud. This won't lag your browser.",
      });
    } catch (error) {
      console.error('[Cloud Discovery] Error:', error);
      setDiscoveryProgress(prev => prev ? { ...prev, status: 'error', completedAt: new Date() } : null);
    }
  }, [getApiKey]);
  
  // Use the loading context for throttled progress updates
  const { 
    isLoadingMarkets, 
    loadingProgress, 
    setIsLoadingMarkets, 
    updateLoadingProgress 
  } = useMarketsLoading();
  const hasInitialLoadCompletedRef = useRef(false);
  
  // Convert a database record to UnifiedMarket format
  const convertDbRecord = useCallback((record: any): UnifiedMarket => ({
    id: record.id,
    platform: record.platform as Platform,
    title: record.title,
    eventSlug: record.event_slug,
    eventTitle: record.event_slug?.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    marketSlug: record.market_slug,
    conditionId: record.condition_id,
    kalshiMarketTicker: record.kalshi_ticker,
    kalshiEventTicker: record.kalshi_event_ticker,
    startTime: new Date(record.start_time),
    endTime: new Date(record.end_time),
    closeTime: record.close_time ? new Date(record.close_time) : undefined,
    status: record.status as 'open' | 'closed',
    sideA: {
      tokenId: record.side_a_token_id,
      label: record.side_a_label || 'Yes',
      price: record.side_a_price,
      probability: record.side_a_probability,
      odds: record.side_a_price && record.side_a_price > 0 ? 1 / record.side_a_price : null,
    },
    sideB: {
      tokenId: record.side_b_token_id,
      label: record.side_b_label || 'No',
      price: record.side_b_price,
      probability: record.side_b_probability,
      odds: record.side_b_price && record.side_b_price > 0 ? 1 / record.side_b_price : null,
    },
    volume: record.volume,
    volume24h: record.volume_24h,
    lastUpdated: new Date(record.last_updated),
    lastPriceUpdatedAt: record.last_price_updated_at ? new Date(record.last_price_updated_at) : null,
  }), []);

  // Load markets from database with STABLE CURSOR pagination (prevents stuck loops during active scans)
  const loadMarketsFromDatabase = useCallback(async () => {
    const seenIds = new Set<string>();
    const allMarkets: UnifiedMarket[] = [];
    let totalCount = 0;
    
    try {
      setIsLoadingMarkets(true);
      updateLoadingProgress(0, 0);
      
      const PAGE_SIZE = 1000;
      const MAX_PAGES = 100; // Safety limit
      const MAX_TIME_MS = 90000; // 90 second timeout
      const startTime = Date.now();
      
      // Capture a stable snapshot cutoff (only load rows created before now)
      const cutoff = new Date().toISOString();
      
      // First, get total count for progress (approximate, may change during scan)
      const { count } = await supabase
        .from('markets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')
        .lte('created_at', cutoff);
      
      totalCount = count || 0;
      updateLoadingProgress(0, totalCount);
      console.log(`[Load Markets] Total markets to load (snapshot): ${totalCount}`);
      
      // Cursor-based pagination: order by (created_at, id) for stability
      let lastCreatedAt: string | null = null;
      let lastId: string | null = null;
      let pageCount = 0;
      let hasMore = true;
      
      while (hasMore && pageCount < MAX_PAGES && (Date.now() - startTime) < MAX_TIME_MS) {
        pageCount++;
        
        // Build query with cursor
        let query = supabase
          .from('markets')
          .select('*')
          .eq('status', 'open')
          .lte('created_at', cutoff)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(PAGE_SIZE);
        
        // Apply cursor if we have one
        if (lastCreatedAt && lastId) {
          // Keyset pagination: (created_at, id) > (lastCreatedAt, lastId)
          query = query.or(`created_at.gt.${lastCreatedAt},and(created_at.eq.${lastCreatedAt},id.gt.${lastId})`);
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.error('[Load Markets] Error:', error);
          break;
        }
        
        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }
        
        // Convert and accumulate with deduplication
        let newCount = 0;
        for (const record of data) {
          if (!seenIds.has(record.id)) {
            seenIds.add(record.id);
            allMarkets.push(convertDbRecord(record));
            newCount++;
          }
        }
        
        // Update cursor for next page
        const lastRecord = data[data.length - 1];
        lastCreatedAt = lastRecord.created_at;
        lastId = lastRecord.id;
        
        // Progress: clamp to prevent >100%
        const displayLoaded = Math.min(allMarkets.length, totalCount || allMarkets.length);
        const displayTotal = Math.max(totalCount, allMarkets.length);
        updateLoadingProgress(displayLoaded, displayTotal);
        console.log(`[Load Markets] Page ${pageCount}: +${newCount} new, total=${allMarkets.length}/${displayTotal}`);
        
        // If we got fewer than PAGE_SIZE, we've reached the end
        hasMore = data.length === PAGE_SIZE;
      }
      
      // Safety exit logging
      if (pageCount >= MAX_PAGES) {
        console.warn('[Load Markets] Hit max page limit, finalizing with current results');
      }
      if ((Date.now() - startTime) >= MAX_TIME_MS) {
        console.warn('[Load Markets] Hit timeout, finalizing with current results');
      }
      
      setMarkets(allMarkets);
      console.log(`[Load Markets] Complete: ${allMarkets.length} markets from database in ${pageCount} pages`);
      
      // Trigger price warmup after initial load to fetch prices for matched markets
      setPendingWarmup(true);
      
      // Update sync state
      setSyncState(prev => ({
        POLYMARKET: { ...prev.POLYMARKET, lastSuccessAt: new Date() },
        KALSHI: { ...prev.KALSHI, lastSuccessAt: new Date() },
      }));
    } catch (error) {
      console.error('[Load Markets] Error:', error);
    } finally {
      // Force 100% progress before hiding loader
      const finalCount = Math.max(totalCount, allMarkets.length);
      updateLoadingProgress(finalCount, finalCount);
      setIsLoadingMarkets(false);
    }
  }, [convertDbRecord, setIsLoadingMarkets, updateLoadingProgress]);
  
  // Subscribe to realtime updates from scan_jobs table
  useEffect(() => {
    if (!cloudScanJobId) return;
    
    const channel = supabase
      .channel(`job-${cloudScanJobId}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'scan_jobs',
          filter: `id=eq.${cloudScanJobId}`,
        },
        (payload: any) => {
          const job = payload.new;
          console.log('[Cloud Discovery] Job update:', job);
          
          if (job.status === 'completed') {
            setDiscoveryProgress({
              polymarket: { offset: 0, found: job.polymarket_found || 0, hasMore: false },
              kalshi: { offset: 0, found: job.kalshi_found || 0, hasMore: false },
              status: 'completed',
              startedAt: job.started_at ? new Date(job.started_at) : null,
              completedAt: new Date(),
            });
            
            // Load markets from database
            loadMarketsFromDatabase();
            
            // Trigger warmup
            setPendingWarmup(true);
            
            toast({
              title: "Cloud scan complete",
              description: `Found ${(job.polymarket_found || 0) + (job.kalshi_found || 0)} markets`,
            });
            
            // Clear progress after delay
            setTimeout(() => setDiscoveryProgress(null), 5000);
          } else if (job.status === 'error') {
            setDiscoveryProgress(prev => prev ? { ...prev, status: 'error', completedAt: new Date() } : null);
            toast({
              title: "Cloud scan failed",
              description: job.error_message || "Unknown error",
              variant: "destructive",
            });
          } else if (job.status === 'running') {
            setDiscoveryProgress({
              polymarket: { offset: 0, found: job.polymarket_found || 0, hasMore: true },
              kalshi: { offset: 0, found: job.kalshi_found || 0, hasMore: true },
              status: 'running',
              startedAt: job.started_at ? new Date(job.started_at) : new Date(),
              completedAt: null,
            });
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cloudScanJobId, loadMarketsFromDatabase]);
  
  // Subscribe to realtime market updates
  useEffect(() => {
    if (!useCloudScanning) return;
    
    const channel = supabase
      .channel('markets-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markets' },
        (payload: any) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const record = payload.new;
            const market: UnifiedMarket = {
              id: record.id,
              platform: record.platform as Platform,
              title: record.title,
              eventSlug: record.event_slug,
              eventTitle: record.event_slug?.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
              marketSlug: record.market_slug,
              conditionId: record.condition_id,
              kalshiMarketTicker: record.kalshi_ticker,
              kalshiEventTicker: record.kalshi_event_ticker,
              startTime: new Date(record.start_time),
              endTime: new Date(record.end_time),
              closeTime: record.close_time ? new Date(record.close_time) : undefined,
              status: record.status,
              sideA: {
                tokenId: record.side_a_token_id,
                label: record.side_a_label || 'Yes',
                price: record.side_a_price,
                probability: record.side_a_probability,
                odds: record.side_a_price && record.side_a_price > 0 ? 1 / record.side_a_price : null,
              },
              sideB: {
                tokenId: record.side_b_token_id,
                label: record.side_b_label || 'No',
                price: record.side_b_price,
                probability: record.side_b_probability,
                odds: record.side_b_price && record.side_b_price > 0 ? 1 / record.side_b_price : null,
              },
              volume: record.volume,
              volume24h: record.volume_24h,
              lastUpdated: new Date(record.last_updated),
              lastPriceUpdatedAt: record.last_price_updated_at ? new Date(record.last_price_updated_at) : null,
            };
            
            setMarkets(prev => {
              const existing = prev.findIndex(m => m.id === market.id);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = market;
                return updated;
              }
              return [...prev, market];
            });
          } else if (payload.eventType === 'DELETE') {
            setMarkets(prev => prev.filter(m => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [useCloudScanning]);

  const startDiscovery = useCallback(() => {
    if (isDiscoveringRef.current) return;
    isDiscoveringRef.current = true;
    setIsDiscovering(true);

    if (useCloudScanning) {
      // Use cloud-based scanning
      runCloudDiscovery();
      
      // Schedule periodic cloud rediscovery
      const intervalMs = tier === 'free' ? 180000 : 120000; // 3 min free, 2 min paid
      discoveryIntervalRef.current = setInterval(() => {
        if (isDiscoveringRef.current) {
          runCloudDiscovery();
        }
      }, intervalMs);
    } else {
      // Use browser-based scanning (original)
      runDiscovery();

      // Schedule periodic rediscovery (longer interval for Free tier)
      const intervalMs = tier === 'free' ? 120000 : 60000;
      discoveryIntervalRef.current = setInterval(() => {
        if (isDiscoveringRef.current) {
          runDiscovery();
        }
      }, intervalMs);
    }
  }, [runDiscovery, runCloudDiscovery, tier, useCloudScanning]);

  const stopDiscovery = useCallback(() => {
    isDiscoveringRef.current = false;
    setIsDiscovering(false);
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    if (discoveryIntervalRef.current) {
      clearInterval(discoveryIntervalRef.current);
      discoveryIntervalRef.current = null;
    }
  }, []);

  const startPriceUpdates = useCallback(() => {
    // Only enable WebSocket for paid tiers (free tier has connection limits)
    if (tier !== 'free') {
      setWsEnabled(true);
    }

    if (isPriceUpdatingRef.current) return;
    isPriceUpdatingRef.current = true;
    setIsPriceUpdating(true);

    // Start steady (no-burst) loop (Polymarket)
    startSteadyPriceLoop();

    // Start Kalshi loop as well (will idle until matched tickers exist)
    startKalshiPriceLoopRef.current?.();
  }, [startSteadyPriceLoop, tier]);

  const stopPriceUpdates = useCallback(() => {
    setWsEnabled(false);
    isPriceUpdatingRef.current = false;
    setIsPriceUpdating(false);
    isKalshiPricingRef.current = false; // Stop Kalshi loop directly

    stopSteadyPriceLoop();

    if (priceUpdateTimeoutRef.current) {
      clearTimeout(priceUpdateTimeoutRef.current);
      priceUpdateTimeoutRef.current = null;
    }
  }, [stopSteadyPriceLoop]);

  // Fetch fresh Kalshi prices for matched markets only
  // (Use ticker-filtered endpoint instead of paginating through the entire market universe)
  const fetchMatchedKalshiPrices = useCallback(
    async (apiKey: string): Promise<Map<string, { yes: number; no: number }>> => {
      const matchedTickers = Array.from(matchedKalshiTickersRef.current);
      if (matchedTickers.length === 0) return new Map();

      const toUpdate = new Map<string, { yes: number; no: number }>();
      // Higher concurrency - rate limiter controls actual throughput
      const CONCURRENCY = tier === 'free' ? 10 : 25;

      let cursor = 0;
      const worker = async () => {
        while (cursor < matchedTickers.length) {
          const idx = cursor++;
          const ticker = matchedTickers[idx];
          const safeTicker = encodeURIComponent(ticker);

          try {
            // Use dedicated market-price endpoint for faster, more accurate real-time prices
            const url = `https://api.domeapi.io/v1/kalshi/market-price/${safeTicker}`;
            const response = await rateLimitedFetch(url, apiKey, 'KALSHI');
            
            // Handle 429 rate limiting with backoff
            if (response.status === 429) {
              const data = await response.json().catch(() => ({}));
              const retryAfter = (data as any).retry_after || 5;
              kalshiRateLimiter.markRateLimited(retryAfter);
              await sleep(retryAfter * 1000);
              cursor--; // Retry this ticker
              continue;
            }
            
            if (!response.ok) {
              // 404 = market not found or no price data
              continue;
            }
            
            const data: KalshiMarketPriceResponse = await response.json();
            
            // Response format: { yes: { price: 0.75, at_time: ... }, no: { price: 0.25, at_time: ... } }
            if (data.yes?.price !== undefined && data.no?.price !== undefined) {
              toUpdate.set(`kalshi_${ticker}`, {
                yes: data.yes.price,  // Already in 0-1 range (dollars)
                no: data.no.price,
              });
              console.log(`[Kalshi Price] ${ticker}: yes=${data.yes.price.toFixed(2)}, no=${data.no.price.toFixed(2)}`);
            }
          } catch {
            // ignore individual ticker failures
          }
        }
      };

      await Promise.allSettled(Array.from({ length: Math.min(CONCURRENCY, matchedTickers.length) }, worker));
      return toUpdate;
    },
    [tier]
  );

  // Apply Kalshi price updates to markets state
  const applyKalshiPriceUpdates = useCallback((updates: Map<string, { yes: number; no: number }>) => {
    if (updates.size === 0) return;
    
    const now = new Date();
    setMarkets(prev => prev.map(m => {
      const update = updates.get(m.id);
      if (!update) return m;
      return {
        ...m,
        sideA: {
          ...m.sideA,
          price: update.yes,
          probability: update.yes,
          odds: update.yes > 0 ? 1 / update.yes : null,
        },
        sideB: {
          ...m.sideB,
          price: update.no,
          probability: update.no,
          odds: update.no > 0 ? 1 / update.no : null,
        },
        lastUpdated: now,
        lastPriceUpdatedAt: now,
      };
    }));
    
    setLastKalshiRefresh(now);
  }, []);

  // Kalshi price loop - runs continuously for matched markets
  const runKalshiPriceLoop = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;
    
    while (isKalshiPricingRef.current) {
      const matchedTickers = matchedKalshiTickersRef.current;
      
      if (matchedTickers.size === 0) {
        // No matched markets yet, wait and retry
        await sleep(1000);
        continue;
      }
      
      try {
        const updates = await fetchMatchedKalshiPrices(apiKey);
        if (isKalshiPricingRef.current && updates.size > 0) {
          applyKalshiPriceUpdates(updates);
          console.log(`[Kalshi Price Loop] Updated ${updates.size} matched markets`);
        }
      } catch (error) {
        console.error('[Kalshi Price Loop] Error:', error);
      }
      
      // Wait based on tier before next refresh (reduced from 30s to 10s for better UX)
      const intervalMs = tier === 'free' ? 10000 : 5000;
      await sleep(intervalMs);
    }
  }, [getApiKey, fetchMatchedKalshiPrices, applyKalshiPriceUpdates, tier]);

  const startKalshiPriceLoop = useCallback(() => {
    if (isKalshiPricingRef.current) return;
    isKalshiPricingRef.current = true;
    runKalshiPriceLoop();
  }, [runKalshiPriceLoop]);

  // Allow startPriceUpdates (defined earlier) to kick off Kalshi updates.
  startKalshiPriceLoopRef.current = startKalshiPriceLoop;

  // Force refresh Kalshi prices for matched markets (manual trigger)
  const refreshKalshiPrices = useCallback(async () => {
    if (isRefreshingKalshi) return;
    
    const apiKey = getApiKey();
    if (!apiKey) return;
    
    setIsRefreshingKalshi(true);
    
    try {
      const updates = await fetchMatchedKalshiPrices(apiKey);
      applyKalshiPriceUpdates(updates);
      console.log(`[Kalshi Refresh] Updated ${updates.size} matched markets`);
    } catch (error) {
      console.error('[Kalshi Refresh] Error:', error);
    } finally {
      setIsRefreshingKalshi(false);
    }
  }, [getApiKey, fetchMatchedKalshiPrices, applyKalshiPriceUpdates, isRefreshingKalshi]);

  const setMatchedKalshiTickers = useCallback((tickers: Set<string>) => {
    const next = new Set(tickers);
    matchedKalshiTickersRef.current = next;
    setMatchedKalshiTickerCount(next.size);
  }, []);

  // Force refresh ALL prices for matched markets (both Polymarket and Kalshi)
  const refreshAllMatchedPrices = useCallback(async () => {
    if (isRefreshingAllPricesRef.current) return;

    const apiKey = getApiKey();
    if (!apiKey) return;

    const polyCount = matchedIdsRef.current.size;
    const kalshiCount = matchedKalshiTickersRef.current.size;

    isRefreshingAllPricesRef.current = true;
    setIsRefreshingAllPrices(true);
    console.log(`[Refresh All] Starting refresh (poly=${polyCount}, kalshi=${kalshiCount})`);

    try {
      // Refresh Polymarket prices
      await warmMatchedPolymarketPrices(marketsRef.current, apiKey);
      console.log('[Refresh All] Polymarket prices updated');

      // Refresh Kalshi prices
      const kalshiUpdates = await fetchMatchedKalshiPrices(apiKey);
      applyKalshiPriceUpdates(kalshiUpdates);
      console.log(`[Refresh All] Kalshi prices updated (${kalshiUpdates.size} markets)`);

      toast({
        title: "Prices refreshed",
        description: `Updated prices for ${polyCount} Polymarket and ${kalshiUpdates.size} Kalshi markets`,
      });
    } catch (error) {
      console.error('[Refresh All] Error:', error);
      toast({
        title: "Refresh failed",
        description: "Some prices may not have been updated",
        variant: "destructive",
      });
    } finally {
      isRefreshingAllPricesRef.current = false;
      setIsRefreshingAllPrices(false);
    }
  }, [getApiKey, warmMatchedPolymarketPrices, fetchMatchedKalshiPrices, applyKalshiPriceUpdates]);

  // Immediate price fetch for newly matched markets (called by useArbitrage)
  // OPTIMIZED: Priority burst for first 10 Kalshi tickers (bypass rate limiter for instant first paint)
  const triggerImmediatePriceFetch = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey || isWarmingUpRef.current) return;
    
    // Get matched markets that are MISSING prices
    const matchedIds = matchedIdsRef.current;
    const matchedPoly = marketsRef.current.filter(m => 
      m.platform === 'POLYMARKET' && 
      matchedIds.has(m.id) && 
      m.lastPriceUpdatedAt === null &&
      m.sideA.tokenId &&
      m.sideB.tokenId
    );
    
    const matchedKalshiTickers = Array.from(matchedKalshiTickersRef.current).filter(ticker => {
      const market = marketsRef.current.find(m => m.kalshiMarketTicker === ticker);
      return market && market.lastPriceUpdatedAt === null;
    });
    
    if (matchedPoly.length === 0 && matchedKalshiTickers.length === 0) return;
    
    console.log(`[Immediate Price Fetch] ${matchedPoly.length} Poly, ${matchedKalshiTickers.length} Kalshi`);
    
    // Mark these IDs as fetching
    const polyIdsToFetch = matchedPoly.map(m => m.id);
    const kalshiIdsToFetch = matchedKalshiTickers.map(t => `kalshi_${t}`);
    const allFetchingIds = new Set([...polyIdsToFetch, ...kalshiIdsToFetch]);
    
    setFetchingPriceIds(prev => new Set([...prev, ...allFetchingIds]));
    
    // SAFETY: Clear stuck spinners after 15 seconds
    const timeoutId = setTimeout(() => {
      setFetchingPriceIds(prev => {
        const next = new Set(prev);
        allFetchingIds.forEach(id => next.delete(id));
        return next;
      });
    }, 15000);
    
    try {
      // PRIORITY BURST: Fetch first 10 Kalshi tickers immediately (parallel, no rate limit)
      // This provides fast first paint for visible cards
      const PRIORITY_COUNT = 10;
      const priorityTickers = matchedKalshiTickers.slice(0, PRIORITY_COUNT);
      const remainingKalshiTickers = matchedKalshiTickers.slice(PRIORITY_COUNT);
      
      // Fire priority fetches in parallel without waiting for rate limiter
      const priorityPromises = priorityTickers.map(async (ticker) => {
        try {
          const safeTicker = encodeURIComponent(ticker);
          const url = `https://api.domeapi.io/v1/kalshi/market-price/${safeTicker}`;
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          
          if (response.ok) {
            const data: KalshiMarketPriceResponse = await response.json();
            if (data.yes?.price !== undefined && data.no?.price !== undefined) {
              // Apply update immediately for fast first paint
              const singleUpdate = new Map([[`kalshi_${ticker}`, { yes: data.yes.price, no: data.no.price }]]);
              applyKalshiPriceUpdates(singleUpdate);
              console.log(`[Priority Price] ${ticker}: yes=${data.yes.price.toFixed(2)}, no=${data.no.price.toFixed(2)}`);
              
              // Remove this ticker from fetching state immediately
              setFetchingPriceIds(prev => {
                const next = new Set(prev);
                next.delete(`kalshi_${ticker}`);
                return next;
              });
            }
          }
        } catch {
          // Ignore individual errors, will be retried in background
        }
      });
      
      // Fetch both Polymarket and priority Kalshi in parallel
      await Promise.all([
        // Priority Kalshi burst (first 10)
        Promise.allSettled(priorityPromises),
        
        // Polymarket prices
        warmMatchedPolymarketPrices(matchedPoly, apiKey)
          .then(() => {
            setFetchingPriceIds(prev => {
              const next = new Set(prev);
              polyIdsToFetch.forEach(id => next.delete(id));
              return next;
            });
          })
          .catch((err) => {
            console.error('[Immediate Price Fetch] Polymarket error:', err);
            setFetchingPriceIds(prev => {
              const next = new Set(prev);
              polyIdsToFetch.forEach(id => next.delete(id));
              return next;
            });
          }),
      ]);
      
      // Fetch remaining Kalshi tickers through rate limiter (background)
      if (remainingKalshiTickers.length > 0) {
        // Update the ref to only contain remaining tickers temporarily
        const originalTickers = matchedKalshiTickersRef.current;
        matchedKalshiTickersRef.current = new Set(remainingKalshiTickers);
        
        fetchMatchedKalshiPrices(apiKey)
          .then(updates => {
            applyKalshiPriceUpdates(updates);
            setFetchingPriceIds(prev => {
              const next = new Set(prev);
              remainingKalshiTickers.forEach(t => next.delete(`kalshi_${t}`));
              return next;
            });
          })
          .catch((err) => {
            console.error('[Immediate Price Fetch] Kalshi background error:', err);
            setFetchingPriceIds(prev => {
              const next = new Set(prev);
              remainingKalshiTickers.forEach(t => next.delete(`kalshi_${t}`));
              return next;
            });
          })
          .finally(() => {
            // Restore original tickers
            matchedKalshiTickersRef.current = originalTickers;
          });
      }
      
      // Clear timeout since we completed successfully
      clearTimeout(timeoutId);
    } catch (error) {
      console.error('[Immediate Price Fetch] Unexpected error:', error);
      clearTimeout(timeoutId);
      // Clear all fetching state as a fallback
      setFetchingPriceIds(prev => {
        const next = new Set(prev);
        allFetchingIds.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [getApiKey, warmMatchedPolymarketPrices, fetchMatchedKalshiPrices, applyKalshiPriceUpdates]);

  // Matched Kalshi tickers are provided by the matcher (useArbitrage) via setMatchedKalshiTickers.
  // (The previous implementation accidentally treated all Kalshi markets as matched, which made refresh extremely slow.)

  // Coordinate warmup: trigger ONLY after matching completes
  useEffect(() => {
    // Only trigger warmup when:
    // 1. Warmup is pending (discovery just finished)
    // 2. We have matched markets
    // 3. We're not already warming up
    if (pendingWarmup && matchedPolymarketIds.size > 0 && matchedKalshiTickerCount > 0 && !isWarmingUpRef.current) {
      isWarmingUpRef.current = true;
      setPendingWarmup(false);
      
      const apiKey = getApiKey();
      if (!apiKey) {
        isWarmingUpRef.current = false;
        return;
      }
      
      console.log(`[Warmup] Starting warmup for ${matchedPolymarketIds.size} matched Polymarket markets`);
      
      // Warm Polymarket prices first
      warmMatchedPolymarketPrices(markets, apiKey).then(async () => {
        console.log('[Warmup] Polymarket warmup complete, starting Kalshi warmup');
        
        // Then warm Kalshi prices
        try {
          const kalshiUpdates = await fetchMatchedKalshiPrices(apiKey);
          applyKalshiPriceUpdates(kalshiUpdates);
          console.log(`[Warmup] Kalshi warmup complete, updated ${kalshiUpdates.size} markets`);
        } catch (error) {
          console.error('[Warmup] Kalshi warmup error:', error);
        }
        
        isWarmingUpRef.current = false;
        
        // Now start continuous price loops
        if (!isPriceUpdatingRef.current && isDiscoveringRef.current) {
          isPriceUpdatingRef.current = true;
          setIsPriceUpdating(true);
          startSteadyPriceLoop();
          startKalshiPriceLoop();
        }
      });
    }
  }, [pendingWarmup, matchedPolymarketIds.size, matchedKalshiTickerCount, getApiKey, markets, warmMatchedPolymarketPrices, fetchMatchedKalshiPrices, applyKalshiPriceUpdates, startKalshiPriceLoop]);

  // Live RPM counter - update every second, only when value changes
  useEffect(() => {
    rpmIntervalRef.current = setInterval(() => {
      setLiveRpm(prev => {
        const newRpm = getCombinedStats().totalRpm;
        return prev === newRpm ? prev : newRpm;
      });
    }, 1000);
    return () => {
      if (rpmIntervalRef.current) {
        clearInterval(rpmIntervalRef.current);
      }
    };
  }, []);

  // Load markets from database on mount when using cloud scanning
  useEffect(() => {
    // Only trigger initial load once, regardless of realtime updates
    if (useCloudScanning && isAuthenticated && !hasInitialLoadCompletedRef.current && !isLoadingMarkets) {
      console.log('[MarketsContext] Auto-loading markets from database on mount');
      hasInitialLoadCompletedRef.current = true; // Set immediately to prevent double-load
      loadMarketsFromDatabase();
    }
  }, [useCloudScanning, isAuthenticated, isLoadingMarkets, loadMarketsFromDatabase]);

  // Clean up when user logs out (no auto-start to avoid rate limiting)
  useEffect(() => {
    if (!isAuthenticated) {
      stopDiscovery();
      stopPriceUpdates();
      setWsEnabled(false);
      setMarkets([]);
      hasInitialLoadCompletedRef.current = false; // Reset so next login triggers load
    }
  }, [isAuthenticated]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDiscovery();
      stopPriceUpdates();
    };
  }, []);

  return (
    <MarketsContext.Provider value={{
      markets,
      filteredMarkets,
      groupedEvents,
      syncState,
      summary,
      filters,
      isDiscovering,
      isPriceUpdating,
      isLoadingMarkets,
      loadingProgress,
      wsStatus,
      wsSubscriptionCount,
      kalshiWsStatus,
      kalshiWsSubscriptionCount,
      isRefreshingKalshi,
      isRefreshingAllPrices,
      lastKalshiRefresh,
      matchedPolymarketIds,
      fetchingPriceIds,
      setMatchedKalshiTickers,
      setFilters,
      startDiscovery,
      stopDiscovery,
      startPriceUpdates,
      stopPriceUpdates,
      refreshKalshiPrices,
      refreshAllMatchedPrices,
      setMatchedPolymarketIds,
      triggerImmediatePriceFetch,
      useCloudScanning,
      setUseCloudScanning,
      cloudScanJobId,
    }}>
      {children}
    </MarketsContext.Provider>
  );
}

export function useMarkets(): MarketsContextType {
  const context = useContext(MarketsContext);
  if (context) return context;

  // Defensive fallback to avoid a blank screen if provider wiring breaks
  console.error('useMarkets called outside MarketsProvider');

  const fallbackSyncState: Record<Platform, SyncState> = {
    POLYMARKET: { ...defaultSyncState, platform: 'POLYMARKET' },
    KALSHI: { ...defaultSyncState, platform: 'KALSHI' },
  };

  const fallbackSummary: DashboardSummary = {
    totalMarkets: 0,
    polymarketCount: 0,
    kalshiCount: 0,
    totalTokensTracked: 0,
    lastDiscoveryTime: null,
    lastPriceUpdateTime: null,
    connectionMode: 'disconnected',
    requestsPerMinute: 0,
    marketsWithPrices: 0,
    discoveryProgress: null,
    liveRpm: 0,
    totalContracts: 0,
    matchedMarkets: 0,
    matchedContracts: 0,
    matchCoveragePercent: 0,
    contractsByPlatform: { polymarket: 0, kalshi: 0 },
  };

  return {
    markets: [],
    filteredMarkets: [],
    groupedEvents: [],
    syncState: fallbackSyncState,
    summary: fallbackSummary,
    filters: defaultFilters,
    isDiscovering: false,
    isPriceUpdating: false,
    isLoadingMarkets: false,
    loadingProgress: { loaded: 0, total: 0 },
    wsStatus: 'disconnected',
    wsSubscriptionCount: 0,
    kalshiWsStatus: 'disconnected',
    kalshiWsSubscriptionCount: 0,
    isRefreshingKalshi: false,
    isRefreshingAllPrices: false,
    lastKalshiRefresh: null,
    matchedPolymarketIds: new Set(),
    fetchingPriceIds: new Set(),
    setMatchedKalshiTickers: () => undefined,
    setFilters: () => undefined,
    startDiscovery: () => undefined,
    stopDiscovery: () => undefined,
    startPriceUpdates: () => undefined,
    stopPriceUpdates: () => undefined,
    setMatchedPolymarketIds: () => undefined,
    triggerImmediatePriceFetch: () => undefined,
    refreshKalshiPrices: () => undefined,
    refreshAllMatchedPrices: () => undefined,
    useCloudScanning: true,
    setUseCloudScanning: () => undefined,
    cloudScanJobId: null,
  };
}
