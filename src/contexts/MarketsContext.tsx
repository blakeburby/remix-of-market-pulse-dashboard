import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  setFilters: (filters: Partial<MarketFilters>) => void;
  startDiscovery: () => void;
  stopDiscovery: () => void;
  startPriceUpdates: () => void;
  stopPriceUpdates: () => void;
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

  const discoveryIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rpmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const priceUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceDispatchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDiscoveringRef = useRef(false);
  const isPriceUpdatingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [wsEnabled, setWsEnabled] = useState(false);

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

  // Filter and sort markets
  const filteredMarkets = React.useMemo(() => {
    let result = [...markets];

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
  }, [markets, filters]);

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

  // Calculate summary
  const summary: DashboardSummary = React.useMemo(() => {
    const polymarketCount = markets.filter(m => m.platform === 'POLYMARKET').length;
    const kalshiCount = markets.filter(m => m.platform === 'KALSHI').length;
    const tokenCount = markets.reduce((acc, m) => {
      return acc + (m.sideA.tokenId ? 1 : 0) + (m.sideB.tokenId ? 1 : 0);
    }, 0);

    // Count markets with updated prices (not default 50/50)
    const updatedPriceCount = markets.filter(m => 
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
      totalMarkets: markets.length,
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
    };
  }, [markets, syncState, lastPriceUpdate, isPriceUpdating, wsConnected, discoveryProgress, liveRpm]);

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

  // Convert Polymarket market to unified format
  const convertPolymarketMarket = (market: PolymarketMarket): UnifiedMarket => {
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
  };

  // Convert Kalshi market to unified format
  // Kalshi prices come directly from the API discovery, so they're fresh
  const convertKalshiMarket = (market: KalshiMarket): UnifiedMarket => {
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
  };

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

  const warmPolymarketPrices = async (
    discoveredMarkets: UnifiedMarket[],
    apiKey: string,
    signal?: AbortSignal,
    maxCount?: number
  ) => {
    // Warm ALL markets - no limits, rate limiter handles pacing
    const targets = discoveredMarkets
      .filter(m => m.platform === 'POLYMARKET' && m.sideA.tokenId);

    if (targets.length === 0) return;

    const pending = new Map<string, number>();
    // Conservative batch size - let rate limiter handle pacing
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

    // Process using streaming for true 100 QPS
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      if (signal?.aborted) break;

      const batch = targets.slice(i, i + BATCH_SIZE);
      const promises: Promise<void>[] = [];
      
      // Use streaming acquisition - fires each request as token becomes available
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
      
      // Wait for batch to complete
      await Promise.allSettled(promises);

      // Flush after each batch for responsive UI updates
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
    setDiscoveryProgress(prev => ({
      polymarket: prev?.polymarket ?? { offset: 0, found: 0, hasMore: true },
      kalshi: prev?.kalshi ?? { offset: 0, found: 0, hasMore: true },
      [platform.toLowerCase()]: { offset: 0, found: 0, hasMore: true },
    } as DiscoveryProgress));

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

          // Warm prices immediately for discovered markets
          priceWarmupChainRef.current = priceWarmupChainRef.current
            .then(() => warmPolymarketPrices(pageMarkets, apiKey, signal, pageMarkets.length))
            .catch(() => undefined);
        } else {
          const data: KalshiMarketsResponse = await response.json();
          pageMarkets = data.markets.map(convertKalshiMarket);
          hasMore = data.pagination.has_more;
        }

        allMarkets.push(...pageMarkets);

        // Update discovery progress
        setDiscoveryProgress(prev => ({
          ...prev!,
          [platform.toLowerCase()]: { 
            offset: offset + limit, 
            found: allMarkets.length, 
            hasMore 
          },
        } as DiscoveryProgress));

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

      // Clear discovery progress for this platform when done
      setDiscoveryProgress(prev => prev ? {
        ...prev,
        [platform.toLowerCase()]: { ...prev[platform.toLowerCase() as keyof DiscoveryProgress], hasMore: false },
      } as DiscoveryProgress : null);

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

    // Reset discovery progress
    setDiscoveryProgress({
      polymarket: { offset: 0, found: 0, hasMore: true },
      kalshi: { offset: 0, found: 0, hasMore: true },
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

      // Clear discovery progress when done
      setDiscoveryProgress(null);

      if (polymarketMarkets.length > 0 || kalshiMarkets.length > 0) {
        toast({
          title: "Discovery complete",
          description: `Found ${polymarketMarkets.length} Polymarket and ${kalshiMarkets.length} Kalshi markets`,
        });
      }
    } catch (error) {
      console.error('Discovery error:', error);
      setDiscoveryProgress(null);
    }
  }, [getApiKey, fetchPlatformMarkets, warmPolymarketPrices, tier]);

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

    // Allow price updates to run alongside discovery

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
        const retryAfter = data.retry_after || 5;
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

  // Fire a single price fetch - non-blocking, caller is responsible for pacing
  const firePriceFetch = useCallback((market: UnifiedMarket, apiKey: string) => {
    const tokenId = market.sideA.tokenId!;
    
    // Fire and forget - don't await
    fetchTokenPriceDirect(tokenId, apiKey).then(result => {
      if (!isPriceUpdatingRef.current) return;
      
      if (result.rateLimited) return;
      
      if (typeof result.price === 'number') {
        const priceA = result.price;
        const priceB = 1 - priceA;
        const now = new Date();
        setMarkets(prev => prev.map(m => {
          if (m.id !== market.id) return m;
          return {
            ...m,
            sideA: { ...m.sideA, price: priceA, probability: priceA, odds: priceA > 0 ? 1 / priceA : null },
            sideB: { ...m.sideB, price: priceB, probability: priceB, odds: priceB > 0 ? 1 / priceB : null },
            lastUpdated: now,
            lastPriceUpdatedAt: now,
          };
        }));
        setLastPriceUpdate(new Date());
      }
    });
  }, []);

  const dispatchOnePriceFetch = useCallback(() => {
    if (!isPriceUpdatingRef.current) return;

    const apiKey = getApiKey();
    if (!apiKey) return;

    // Backoff if API told us to or rate limiter says wait
    const now = Date.now();
    if (now < priceRateLimitedUntil.current) return;
    if (!globalRateLimiter.canAcquireNow()) return;

    const candidateMarkets = filteredMarketsRef.current.length > 0
      ? filteredMarketsRef.current
      : marketsRef.current;

    const tokenMarkets = candidateMarkets.filter(m =>
      m.platform === 'POLYMARKET' &&
      m.sideA.tokenId &&
      !failedTokenIds.current.has(m.sideA.tokenId)
    );

    if (tokenMarkets.length === 0) return;

    // Round-robin through all tokens
    const idx = priceCursorRef.current % tokenMarkets.length;
    priceCursorRef.current = idx + 1;
    const market = tokenMarkets[idx];

    // Track request in rate limiter
    globalRateLimiter.trackRequest();

    // Fire non-blocking fetch
    firePriceFetch(market, apiKey);

    // Debug: log achieved RPM every ~10s
    const logNow = Date.now();
    if (logNow - lastQpsLogAtRef.current > 10000) {
      lastQpsLogAtRef.current = logNow;
      console.log(`[Price] RPM=${globalRateLimiter.getRequestsPerMinute()} intervalMs=${globalRateLimiter.getIntervalMs()} tokens=${tokenMarkets.length} available=${globalRateLimiter.getAvailableTokens()}`);
    }
  }, [getApiKey, firePriceFetch]);

  const startSteadyPriceLoop = useCallback(() => {
    if (priceDispatchIntervalRef.current) return;

    const intervalMs = globalRateLimiter.getIntervalMs();

    // Fire immediately once, then steady interval.
    void dispatchOnePriceFetch();

    priceDispatchIntervalRef.current = setInterval(() => {
      // Do not await inside interval callback; keep steady cadence.
      void dispatchOnePriceFetch();
    }, intervalMs);
  }, [dispatchOnePriceFetch]);

  const stopSteadyPriceLoop = useCallback(() => {
    if (priceDispatchIntervalRef.current) {
      clearInterval(priceDispatchIntervalRef.current);
      priceDispatchIntervalRef.current = null;
    }
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

  // Live RPM counter - update every second
  useEffect(() => {
    rpmIntervalRef.current = setInterval(() => {
      setLiveRpm(globalRateLimiter.getRequestsPerMinute());
    }, 1000);
    return () => {
      if (rpmIntervalRef.current) {
        clearInterval(rpmIntervalRef.current);
      }
    };
  }, []);

  // Auto-start discovery when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      startDiscovery();
      // Delay price updates to let discovery finish first
      const timeout = setTimeout(() => {
        if (isAuthenticated) {
          startPriceUpdates();
        }
      }, 5000);
      return () => clearTimeout(timeout);
    } else {
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
      setFilters,
      startDiscovery,
      stopDiscovery,
      startPriceUpdates,
      stopPriceUpdates,
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
    setFilters: () => undefined,
    startDiscovery: () => undefined,
    stopDiscovery: () => undefined,
    startPriceUpdates: () => undefined,
    stopPriceUpdates: () => undefined,
  };
}
