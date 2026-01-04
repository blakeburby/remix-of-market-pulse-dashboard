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
  PolymarketPriceResponse,
  GroupedEvent,
  DiscoveryProgress,
  DiscoveryStatus,
} from '@/types/dome';
import { useAuth } from '@/contexts/AuthContext';
import { globalRateLimiter } from '@/lib/rate-limiter';
import { toast } from '@/hooks/use-toast';
import { useDomeWebSocket } from '@/hooks/useDomeWebSocket';

interface MarketsContextType {
  markets: UnifiedMarket[];
  filteredMarkets: UnifiedMarket[];
  groupedEvents: GroupedEvent[];
  syncState: Record<Platform, SyncState>;
  summary: DashboardSummary;
  filters: MarketFilters;
  isDiscovering: boolean;
  isPriceUpdating: boolean;
  wsStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  wsSubscriptionCount: number;
  isRefreshingKalshi: boolean;
  lastKalshiRefresh: Date | null;
  matchedPolymarketIds: Set<string>;
  setFilters: (filters: Partial<MarketFilters>) => void;
  startDiscovery: () => void;
  stopDiscovery: () => void;
  startPriceUpdates: () => void;
  stopPriceUpdates: () => void;
  refreshKalshiPrices: () => void;
  setMatchedPolymarketIds: (ids: Set<string>) => void;
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
  const [lastKalshiRefresh, setLastKalshiRefresh] = useState<Date | null>(null);
  const [matchedPolymarketIds, setMatchedPolymarketIds] = useState<Set<string>>(new Set());

  const discoveryIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rpmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const priceUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceDispatchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchFlushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDiscoveringRef = useRef(false);
  const isPriceUpdatingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [wsEnabled, setWsEnabled] = useState(false);
  
  // Ref for matched IDs to avoid stale closure in warmup functions
  const matchedIdsRef = useRef<Set<string>>(new Set());
  matchedIdsRef.current = matchedPolymarketIds;

  // Batched price updates - accumulate updates and flush every 500ms to reduce re-renders
  const pendingPriceUpdates = useRef<Map<string, { priceA: number; priceB: number; timestamp: Date }>>(new Map());

  // Computed values
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isPriceUpdating, setIsPriceUpdating] = useState(false);

  // Get market slugs for WebSocket subscriptions - no limit
  const polymarketSlugs = useMemo(() => 
    markets
      .filter(m => m.platform === 'POLYMARKET' && m.marketSlug)
      .map(m => m.marketSlug!),
    [markets]
  );

  // WebSocket price update handler
  const handleWsPriceUpdate = useCallback((tokenId: string, price: number, timestamp: number) => {
    const priceUpdatedAt = new Date(timestamp * 1000);
    setMarkets(prev => prev.map(market => {
      if (market.sideA.tokenId === tokenId) {
        return {
          ...market,
          sideA: {
            ...market.sideA,
            price,
            probability: price,
            odds: price > 0 ? 1 / price : null,
          },
          sideB: {
            ...market.sideB,
            price: 1 - price,
            probability: 1 - price,
            odds: (1 - price) > 0 ? 1 / (1 - price) : null,
          },
          lastUpdated: priceUpdatedAt,
          lastPriceUpdatedAt: priceUpdatedAt,
        };
      }
      if (market.sideB.tokenId === tokenId) {
        return {
          ...market,
          sideA: {
            ...market.sideA,
            price: 1 - price,
            probability: 1 - price,
            odds: (1 - price) > 0 ? 1 / (1 - price) : null,
          },
          sideB: {
            ...market.sideB,
            price,
            probability: price,
            odds: price > 0 ? 1 / price : null,
          },
          lastUpdated: priceUpdatedAt,
          lastPriceUpdatedAt: priceUpdatedAt,
        };
      }
      return market;
    }));
    setLastPriceUpdate(new Date());
  }, []);

  // WebSocket connection
  const { status: wsStatus, subscriptionCount: wsSubscriptionCount, isConnected: wsConnected } = useDomeWebSocket({
    apiKey: getApiKey(),
    tier,
    marketSlugs: polymarketSlugs,
    onPriceUpdate: handleWsPriceUpdate,
    enabled: wsEnabled && isAuthenticated,
  });

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
          comparison = b.sideA.probability - a.sideA.probability;
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
      const avgProb = eventMarkets.reduce((sum, m) => sum + m.sideA.probability, 0) / eventMarkets.length;

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

    // Count markets with updated prices (not default 50/50)
    const updatedPriceCount = deferredMarkets.filter(m => 
      Math.abs(m.sideA.probability - 0.5) > 0.001 || m.platform === 'KALSHI'
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
      requestsPerMinute: globalRateLimiter.getRequestsPerMinute(),
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

  // Convert Polymarket market to unified format - memoized to prevent recreation
  const convertPolymarketMarket = useCallback((market: PolymarketMarket): UnifiedMarket => {
    const isYesNoMarket =
      market.side_a.label.toLowerCase().includes('yes') ||
      market.side_b.label.toLowerCase().includes('no');

    const sideATokenId = (market.side_a as any).token_id ?? (market.side_a as any).id;
    const sideBTokenId = (market.side_b as any).token_id ?? (market.side_b as any).id;

    const eventSlug = extractEventSlug(market.market_slug);

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
        tokenId: sideATokenId,
        label: isYesNoMarket ? 'Yes' : market.side_a.label,
        price: 0.5,
        probability: 0.5,
        odds: 2,
      },
      sideB: {
        tokenId: sideBTokenId,
        label: isYesNoMarket ? 'No' : market.side_b.label,
        price: 0.5,
        probability: 0.5,
        odds: 2,
      },
      lastUpdated: new Date(),
    };
  }, []);

  // Convert Kalshi market to unified format - memoized to prevent recreation
  // Kalshi prices come directly from the API discovery, so they're fresh
  const convertKalshiMarket = useCallback((market: KalshiMarket): UnifiedMarket => {
    const yesProb = market.last_price / 100;
    const noProb = 1 - yesProb;
    const now = new Date();

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
        price: yesProb,
        probability: yesProb,
        odds: yesProb > 0 ? 1 / yesProb : null,
      },
      sideB: {
        label: 'No',
        price: noProb,
        probability: noProb,
        odds: noProb > 0 ? 1 / noProb : null,
      },
      volume: market.volume,
      volume24h: market.volume_24h,
      lastUpdated: now,
      lastPriceUpdatedAt: now, // Kalshi prices come from discovery, mark as fresh
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
    signal?: AbortSignal,
    retries = 5
  ): Promise<Response> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      // Wait for rate limiter
      await globalRateLimiter.waitAndAcquire();

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
  const warmMatchedPolymarketPrices = async (
    discoveredMarkets: UnifiedMarket[],
    apiKey: string,
    signal?: AbortSignal
  ) => {
    // Only warm prices for matched Polymarket markets
    const matchedIds = matchedIdsRef.current;
    const targets = discoveredMarkets
      .filter(m => 
        m.platform === 'POLYMARKET' && 
        m.sideA.tokenId &&
        matchedIds.has(m.id)
      );

    if (targets.length === 0) {
      console.log('[Price Warmup] No matched markets to warm');
      return;
    }
    
    console.log(`[Price Warmup] Warming ${targets.length} matched markets (skipping ${discoveredMarkets.filter(m => m.platform === 'POLYMARKET').length - targets.length} unmatched)`);

    const pending = new Map<string, number>();
    const BATCH_SIZE = tier === 'free' ? 3 : 10;

    const flush = () => {
      if (pending.size === 0) return;
      const snapshot = new Map(pending);
      pending.clear();

      setMarkets(prev => prev.map(m => {
        const priceA = snapshot.get(m.id);
        if (priceA === undefined) return m;
        const priceB = 1 - priceA;
        const now = new Date();
        return {
          ...m,
          sideA: { ...m.sideA, price: priceA, probability: priceA, odds: priceA > 0 ? 1 / priceA : null },
          sideB: { ...m.sideB, price: priceB, probability: priceB, odds: priceB > 0 ? 1 / priceB : null },
          lastUpdated: now,
          lastPriceUpdatedAt: now,
        };
      }));
      setLastPriceUpdate(new Date());
    };

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      if (signal?.aborted) break;

      const batch = targets.slice(i, i + BATCH_SIZE);
      const promises: Promise<void>[] = [];
      
      await globalRateLimiter.acquireStream(batch.length, (index) => {
        const market = batch[index];
        const tokenId = market.sideA.tokenId!;
        
        const promise = fetch(
          `https://api.domeapi.io/v1/polymarket/market-price/${tokenId}`,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            signal,
          }
        ).then(async (resp) => {
          if (!resp.ok) return;
          const data: PolymarketPriceResponse = await resp.json();
          if (typeof data.price === 'number') {
            pending.set(market.id, data.price);
          }
        }).catch(() => {});
        
        promises.push(promise);
      });
      
      await Promise.allSettled(promises);
      flush();
    }
  };

  // Fetch markets from a single platform with pagination - continuously updates markets
  const fetchPlatformMarkets = async (
    platform: Platform,
    signal?: AbortSignal
  ): Promise<UnifiedMarket[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    const allMarkets: UnifiedMarket[] = [];
    let offset = 0;
    const limit = 100;

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

    try {
      while (true) {
        if (signal?.aborted) break;

        const url = `${baseUrl}?status=open&limit=${limit}&offset=${offset}`;
        const response = await rateLimitedFetch(url, apiKey, signal);

        let pageMarkets: UnifiedMarket[] = [];
        let hasMore = false;

        if (platform === 'POLYMARKET') {
          const data: PolymarketMarketsResponse = await response.json();
          pageMarkets = data.markets.map(convertPolymarketMarket);
          hasMore = data.pagination.has_more;

          // DON'T warm prices during discovery - wait until matching is done
          // This saves thousands of API calls for unmatched markets
        } else {
          const data = await response.json();
          pageMarkets = (data.markets || []).map(convertKalshiMarket);
          // Kalshi API may not include pagination object - infer hasMore from result count
          hasMore = data.pagination?.has_more ?? (pageMarkets.length === limit);
        }

        allMarkets.push(...pageMarkets);

        // Update discovery progress
        setDiscoveryProgress(prev => {
          if (!prev) return prev;
          const updated = { ...prev };
          if (platform === 'POLYMARKET') {
            updated.polymarket = { offset: offset + limit, found: allMarkets.length, hasMore };
          } else {
            updated.kalshi = { offset: offset + limit, found: allMarkets.length, hasMore };
          }
          return updated;
        });

        // Continuously update markets after each page
        setMarkets(prev => {
          const existing = new Map(prev.map(m => [m.id, m]));
          for (const market of pageMarkets) {
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

        console.log(`[Discovery] ${platform}: offset=${offset} found=${allMarkets.length} hasMore=${hasMore}`);

        if (!hasMore) break;
        offset += limit;
      }

      setSyncState(prev => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          lastFullDiscoveryAt: new Date(),
          lastOffsetUsed: offset,
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

  // Run discovery for both platforms in parallel
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

      // Fetch BOTH platforms in parallel - they update markets continuously now
      const [polymarketMarkets, kalshiMarkets] = await Promise.all([
        fetchPlatformMarkets('POLYMARKET', signal),
        fetchPlatformMarkets('KALSHI', signal),
      ]);

      if (signal.aborted) return;

      // Mark discovery as completed with timestamp
      const completedAt = new Date();
      setDiscoveryProgress(prev => prev ? {
        ...prev,
        status: 'completed',
        completedAt,
      } : null);

      // OPTIMIZATION: Now that we have all markets, run matching and THEN warm prices
      // This happens automatically via useArbitrage hook which sets matchedPolymarketIds
      // The warmMatchedPolymarketPrices will be called after matches are computed
      
      // Trigger price warmup for matched markets only
      setTimeout(() => {
        if (matchedIdsRef.current.size > 0) {
          console.log(`[Discovery] Warming prices for ${matchedIdsRef.current.size} matched markets`);
          priceWarmupChainRef.current = warmMatchedPolymarketPrices(
            polymarketMarkets,
            apiKey,
            signal
          );
        }
      }, 500); // Small delay to let matching complete

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

    // CRITICAL: Wait for rate limiter BEFORE making request
    await globalRateLimiter.waitAndAcquire();

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
        globalRateLimiter.markRateLimited(retryAfter);
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

  // Steady 100 QPS dispatcher (no burst): one request every 10ms (dev tier)
  const priceCursorRef = useRef(0);
  const lastQpsLogAtRef = useRef(0);

  // Fire a single price fetch - uses rate limiter internally
  const firePriceFetch = useCallback((market: UnifiedMarket, apiKey: string) => {
    const tokenId = market.sideA.tokenId!;
    
    // Fire and forget - don't await. Rate limiting happens inside fetchTokenPriceDirect
    fetchTokenPriceDirect(tokenId, apiKey).then(result => {
      if (!isPriceUpdatingRef.current) return;
      
      if (result.rateLimited) return;
      
      if (typeof result.price === 'number') {
        const priceA = result.price;
        const priceB = 1 - priceA;
        // Queue update instead of immediate state change
        pendingPriceUpdates.current.set(market.id, {
          priceA,
          priceB,
          timestamp: new Date(),
        });
      }
    });
  }, []);

  // Track cursor for round-robin price fetching of matched markets
  const matchedCursorRef = useRef(0);

  const dispatchOnePriceFetch = useCallback(() => {
    if (!isPriceUpdatingRef.current) return;

    const apiKey = getApiKey();
    if (!apiKey) return;

    // Backoff if API told us to
    const now = Date.now();
    if (now < priceRateLimitedUntil.current) return;

    const candidateMarkets = filteredMarketsRef.current.length > 0
      ? filteredMarketsRef.current
      : marketsRef.current;

    const tokenMarkets = candidateMarkets.filter(m =>
      m.platform === 'POLYMARKET' &&
      m.sideA.tokenId &&
      !failedTokenIds.current.has(m.sideA.tokenId)
    );

    if (tokenMarkets.length === 0) return;

    // OPTIMIZATION: Prioritize matched markets, but still fetch others if no matches yet
    const matchedMarkets = tokenMarkets.filter(m => matchedIdsRef.current.has(m.id));

    // Use matched markets if available, otherwise fall back to all token markets
    const targetMarkets = matchedMarkets.length > 0 ? matchedMarkets : tokenMarkets;

    // Round-robin through target markets
    const idx = matchedCursorRef.current % targetMarkets.length;
    matchedCursorRef.current = idx + 1;
    const market = targetMarkets[idx];

    // Fire non-blocking fetch (rate limiting happens inside fetchTokenPriceDirect)
    firePriceFetch(market, apiKey);

    // Debug: log achieved RPM every ~10s
    const logNow = Date.now();
    if (logNow - lastQpsLogAtRef.current > 10000) {
      lastQpsLogAtRef.current = logNow;
      console.log(`[Price] RPM=${globalRateLimiter.getRequestsPerMinute()} matched=${matchedMarkets.length} available=${globalRateLimiter.getAvailableTokens()}`);
    }
  }, [getApiKey, firePriceFetch]);

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

      const tokenMarkets = candidateMarkets.filter(m =>
        m.platform === 'POLYMARKET' &&
        m.sideA.tokenId &&
        !failedTokenIds.current.has(m.sideA.tokenId)
      );

      if (tokenMarkets.length === 0) {
        await sleep(1000); // Wait and retry
        continue;
      }

      // Prioritize matched markets
      const matchedMarkets = tokenMarkets.filter(m => matchedIdsRef.current.has(m.id));
      const targetMarkets = matchedMarkets.length > 0 ? matchedMarkets : tokenMarkets;

      // Round-robin through target markets
      const idx = matchedCursorRef.current % targetMarkets.length;
      matchedCursorRef.current = idx + 1;
      const market = targetMarkets[idx];
      const tokenId = market.sideA.tokenId!;

      // Fetch with rate limiting (waitAndAcquire inside)
      const result = await fetchTokenPriceDirect(tokenId, apiKey);
      
      if (result.rateLimited) {
        // Already handled inside fetchTokenPriceDirect
        continue;
      }
      
      if (typeof result.price === 'number') {
        const priceA = result.price;
        const priceB = 1 - priceA;
        pendingPriceUpdates.current.set(market.id, {
          priceA,
          priceB,
          timestamp: new Date(),
        });
      }

      // Debug: log achieved RPM every ~10s
      const logNow = Date.now();
      if (logNow - lastQpsLogAtRef.current > 10000) {
        lastQpsLogAtRef.current = logNow;
        console.log(`[Price] RPM=${globalRateLimiter.getRequestsPerMinute()} matched=${matchedMarkets.length} target=${targetMarkets.length}`);
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

  const startDiscovery = useCallback(() => {
    if (isDiscoveringRef.current) return;
    isDiscoveringRef.current = true;
    setIsDiscovering(true);

    // Initial discovery - warmup happens inside runDiscovery via priceWarmupChainRef
    runDiscovery().then(() => {
      // Wait for warmup chain to complete before starting price update loop
      priceWarmupChainRef.current.then(() => {
        if (!isPriceUpdatingRef.current && isDiscoveringRef.current) {
          isPriceUpdatingRef.current = true;
          setIsPriceUpdating(true);
          runPriceUpdate();
        }
      });
    });

    // Schedule periodic rediscovery (longer interval for Free tier)
    const intervalMs = tier === 'free' ? 120000 : 60000;
    discoveryIntervalRef.current = setInterval(() => {
      if (isDiscoveringRef.current) {
        runDiscovery();
      }
    }, intervalMs);
  }, [runDiscovery, runPriceUpdate, tier]);

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

    // Start steady (no-burst) loop
    startSteadyPriceLoop();
  }, [startSteadyPriceLoop, tier]);

  const stopPriceUpdates = useCallback(() => {
    setWsEnabled(false);
    isPriceUpdatingRef.current = false;
    setIsPriceUpdating(false);

    stopSteadyPriceLoop();

    if (priceUpdateTimeoutRef.current) {
      clearTimeout(priceUpdateTimeoutRef.current);
      priceUpdateTimeoutRef.current = null;
    }
  }, [stopSteadyPriceLoop]);

  // Force refresh Kalshi prices for matched markets
  const refreshKalshiPrices = useCallback(async () => {
    if (isRefreshingKalshi) return;
    
    const apiKey = getApiKey();
    if (!apiKey) return;
    
    setIsRefreshingKalshi(true);
    
    try {
      // Get all Kalshi markets
      const kalshiMarkets = marketsRef.current.filter(m => m.platform === 'KALSHI');
      if (kalshiMarkets.length === 0) {
        setIsRefreshingKalshi(false);
        return;
      }
      
      // Fetch fresh prices for Kalshi markets (re-fetch from discovery endpoint)
      const url = 'https://api.domeapi.io/v1/kalshi/markets?status=open&limit=100';
      const response = await rateLimitedFetch(url, apiKey);
      const data: KalshiMarketsResponse = await response.json();
      
      const now = new Date();
      const freshKalshiMarkets = data.markets.map(convertKalshiMarket);
      
      // Update existing Kalshi markets with fresh prices
      setMarkets(prev => prev.map(m => {
        if (m.platform !== 'KALSHI') return m;
        const fresh = freshKalshiMarkets.find(f => f.id === m.id);
        if (!fresh) return m;
        return {
          ...m,
          sideA: fresh.sideA,
          sideB: fresh.sideB,
          lastUpdated: now,
          lastPriceUpdatedAt: now,
        };
      }));
      
      setLastKalshiRefresh(now);
      console.log(`[Kalshi Refresh] Updated ${freshKalshiMarkets.length} markets`);
    } catch (error) {
      console.error('[Kalshi Refresh] Error:', error);
    } finally {
      setIsRefreshingKalshi(false);
    }
  }, [getApiKey, convertKalshiMarket]);

  // Live RPM counter - update every second, only when value changes
  useEffect(() => {
    rpmIntervalRef.current = setInterval(() => {
      setLiveRpm(prev => {
        const newRpm = globalRateLimiter.getRequestsPerMinute();
        return prev === newRpm ? prev : newRpm;
      });
    }, 1000);
    return () => {
      if (rpmIntervalRef.current) {
        clearInterval(rpmIntervalRef.current);
      }
    };
  }, []);

  // Clean up when user logs out (no auto-start to avoid rate limiting)
  useEffect(() => {
    if (!isAuthenticated) {
      stopDiscovery();
      stopPriceUpdates();
      setWsEnabled(false);
      setMarkets([]);
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
      wsStatus,
      wsSubscriptionCount,
      isRefreshingKalshi,
      lastKalshiRefresh,
      matchedPolymarketIds,
      setFilters,
      startDiscovery,
      stopDiscovery,
      startPriceUpdates,
      stopPriceUpdates,
      refreshKalshiPrices,
      setMatchedPolymarketIds,
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
    wsStatus: 'disconnected',
    wsSubscriptionCount: 0,
    isRefreshingKalshi: false,
    lastKalshiRefresh: null,
    matchedPolymarketIds: new Set(),
    setFilters: () => undefined,
    startDiscovery: () => undefined,
    stopDiscovery: () => undefined,
    startPriceUpdates: () => undefined,
    stopPriceUpdates: () => undefined,
    setMatchedPolymarketIds: () => undefined,
    refreshKalshiPrices: () => undefined,
  };
}
