import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
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
} from '@/types/dome';
import { useAuth } from './AuthContext';
import { globalRateLimiter } from '@/lib/rate-limiter';
import { toast } from '@/hooks/use-toast';

interface MarketsContextType {
  markets: UnifiedMarket[];
  filteredMarkets: UnifiedMarket[];
  syncState: Record<Platform, SyncState>;
  summary: DashboardSummary;
  filters: MarketFilters;
  isDiscovering: boolean;
  isPriceUpdating: boolean;
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

  const discoveryIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDiscoveringRef = useRef(false);
  const isPriceUpdatingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Computed values
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isPriceUpdating, setIsPriceUpdating] = useState(false);

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

  // Calculate summary
  const summary: DashboardSummary = React.useMemo(() => {
    const polymarketCount = markets.filter(m => m.platform === 'POLYMARKET').length;
    const kalshiCount = markets.filter(m => m.platform === 'KALSHI').length;
    const tokenCount = markets.reduce((acc, m) => {
      return acc + (m.sideA.tokenId ? 1 : 0) + (m.sideB.tokenId ? 1 : 0);
    }, 0);

    const lastDiscovery = [
      syncState.POLYMARKET.lastSuccessAt,
      syncState.KALSHI.lastSuccessAt,
    ].filter(Boolean).sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0))[0] || null;

    return {
      totalMarkets: markets.length,
      polymarketCount,
      kalshiCount,
      totalTokensTracked: tokenCount,
      lastDiscoveryTime: lastDiscovery,
      lastPriceUpdateTime: lastPriceUpdate,
      connectionMode: isPriceUpdating ? 'polling' : 'disconnected',
      requestsPerMinute: globalRateLimiter.getRequestsPerMinute(),
    };
  }, [markets, syncState, lastPriceUpdate, isPriceUpdating]);

  const setFilters = useCallback((newFilters: Partial<MarketFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Convert Polymarket market to unified format
  const convertPolymarketMarket = (market: PolymarketMarket): UnifiedMarket => {
    const isYesNoMarket = 
      market.side_a.label.toLowerCase().includes('yes') ||
      market.side_b.label.toLowerCase().includes('no');
    
    return {
      id: `poly_${market.condition_id}`,
      platform: 'POLYMARKET',
      title: market.title,
      marketSlug: market.market_slug,
      conditionId: market.condition_id,
      startTime: new Date(market.start_time * 1000),
      endTime: new Date(market.end_time * 1000),
      status: market.status,
      sideA: {
        tokenId: market.side_a.token_id,
        label: isYesNoMarket ? 'Yes' : market.side_a.label,
        price: 0.5,
        probability: 0.5,
        odds: 2,
      },
      sideB: {
        tokenId: market.side_b.token_id,
        label: isYesNoMarket ? 'No' : market.side_b.label,
        price: 0.5,
        probability: 0.5,
        odds: 2,
      },
      lastUpdated: new Date(),
    };
  };

  // Convert Kalshi market to unified format
  const convertKalshiMarket = (market: KalshiMarket): UnifiedMarket => {
    const yesProb = market.last_price / 100;
    const noProb = 1 - yesProb;

    return {
      id: `kalshi_${market.market_ticker}`,
      platform: 'KALSHI',
      title: market.title,
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
      lastUpdated: new Date(),
    };
  };

  // Make a rate-limited API request with retry logic
  const rateLimitedFetch = async (
    url: string, 
    apiKey: string,
    signal?: AbortSignal,
    retries = 3
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
          // Rate limited - wait with exponential backoff
          const waitTime = Math.pow(2, attempt + 1) * 2000 + Math.random() * 1000;
          console.log(`Rate limited (429), waiting ${Math.round(waitTime)}ms before retry...`);
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
        // Wait before retry
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
    throw new Error('Max retries exceeded');
  };

  // Fetch markets from a single platform with pagination
  const fetchPlatformMarkets = async (
    platform: Platform,
    signal?: AbortSignal
  ): Promise<UnifiedMarket[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    const allMarkets: UnifiedMarket[] = [];
    let offset = 0;
    const limit = 100;
    // Limit total pages for Free tier to avoid long waits
    const maxPages = tier === 'free' ? 5 : 50;
    let pageCount = 0;

    const baseUrl = platform === 'POLYMARKET' 
      ? 'https://api.domeapi.io/v1/polymarket/markets'
      : 'https://api.domeapi.io/v1/kalshi/markets';

    setSyncState(prev => ({
      ...prev,
      [platform]: { ...prev[platform], isRunning: true, lastError: null },
    }));

    try {
      while (pageCount < maxPages) {
        if (signal?.aborted) break;

        const url = `${baseUrl}?status=open&limit=${limit}&offset=${offset}`;
        const response = await rateLimitedFetch(url, apiKey, signal);
        
        if (platform === 'POLYMARKET') {
          const data: PolymarketMarketsResponse = await response.json();
          for (const market of data.markets) {
            allMarkets.push(convertPolymarketMarket(market));
          }
          if (!data.pagination.has_more) break;
        } else {
          const data: KalshiMarketsResponse = await response.json();
          for (const market of data.markets) {
            allMarkets.push(convertKalshiMarket(market));
          }
          if (!data.pagination.has_more) break;
        }

        offset += limit;
        pageCount++;
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

      return allMarkets;
    } catch (error) {
      if ((error as Error).message === 'Aborted') {
        return allMarkets; // Return what we have
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
      return allMarkets; // Return partial results
    }
  };

  // Run discovery for both platforms sequentially
  const runDiscovery = useCallback(async () => {
    if (!isDiscoveringRef.current) return;
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      // Fetch Polymarket first
      const polymarketMarkets = await fetchPlatformMarkets('POLYMARKET', signal);
      
      if (signal.aborted) return;
      
      // Update markets with Polymarket data
      setMarkets(prev => {
        const existing = new Map(prev.filter(m => m.platform !== 'POLYMARKET').map(m => [m.id, m]));
        for (const market of polymarketMarkets) {
          existing.set(market.id, market);
        }
        return Array.from(existing.values());
      });

      if (signal.aborted) return;

      // Then fetch Kalshi
      const kalshiMarkets = await fetchPlatformMarkets('KALSHI', signal);
      
      if (signal.aborted) return;

      // Update markets with Kalshi data
      setMarkets(prev => {
        const existing = new Map(prev.filter(m => m.platform !== 'KALSHI').map(m => [m.id, m]));
        for (const market of kalshiMarkets) {
          existing.set(market.id, market);
        }
        return Array.from(existing.values());
      });

      if (polymarketMarkets.length > 0 || kalshiMarkets.length > 0) {
        toast({
          title: "Markets discovered",
          description: `Found ${polymarketMarkets.length} Polymarket and ${kalshiMarkets.length} Kalshi markets`,
        });
      }
    } catch (error) {
      console.error('Discovery error:', error);
    }
  }, [getApiKey, tier]);

  // Fetch price for a Polymarket token
  const fetchTokenPrice = async (tokenId: string, signal?: AbortSignal): Promise<number | null> => {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    try {
      const response = await rateLimitedFetch(
        `https://api.domeapi.io/v1/polymarket/market-price/${tokenId}`,
        apiKey,
        signal,
        2 // Fewer retries for price updates
      );

      const data: PolymarketPriceResponse = await response.json();
      return data.price;
    } catch {
      return null;
    }
  };

  // Update prices for Polymarket tokens one at a time
  const runPriceUpdate = useCallback(async () => {
    if (!isPriceUpdatingRef.current) return;

    const polymarketMarkets = markets.filter(m => m.platform === 'POLYMARKET' && m.sideA.tokenId);
    if (polymarketMarkets.length === 0) {
      // Schedule next check
      priceUpdateTimeoutRef.current = setTimeout(runPriceUpdate, 5000);
      return;
    }

    // Pick the oldest updated market
    const sortedMarkets = [...polymarketMarkets].sort(
      (a, b) => a.lastUpdated.getTime() - b.lastUpdated.getTime()
    );
    const market = sortedMarkets[0];

    if (market.sideA.tokenId) {
      const priceA = await fetchTokenPrice(market.sideA.tokenId);
      if (priceA !== null && isPriceUpdatingRef.current) {
        setMarkets(prev => prev.map(m => {
          if (m.id === market.id) {
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
                price: 1 - priceA,
                probability: 1 - priceA,
                odds: (1 - priceA) > 0 ? 1 / (1 - priceA) : null,
              },
              lastUpdated: new Date(),
            };
          }
          return m;
        }));
        setLastPriceUpdate(new Date());
      }
    }

    // Schedule next price update
    if (isPriceUpdatingRef.current) {
      priceUpdateTimeoutRef.current = setTimeout(runPriceUpdate, 100);
    }
  }, [markets, getApiKey]);

  const startDiscovery = useCallback(() => {
    if (isDiscoveringRef.current) return;
    isDiscoveringRef.current = true;
    setIsDiscovering(true);

    // Initial discovery
    runDiscovery();

    // Schedule periodic rediscovery (longer interval for Free tier)
    const intervalMs = tier === 'free' ? 120000 : 60000;
    discoveryIntervalRef.current = setInterval(() => {
      if (isDiscoveringRef.current) {
        runDiscovery();
      }
    }, intervalMs);
  }, [runDiscovery, tier]);

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
    if (isPriceUpdatingRef.current) return;
    isPriceUpdatingRef.current = true;
    setIsPriceUpdating(true);
    
    // Start price update loop
    runPriceUpdate();
  }, [runPriceUpdate]);

  const stopPriceUpdates = useCallback(() => {
    isPriceUpdatingRef.current = false;
    setIsPriceUpdating(false);
    
    if (priceUpdateTimeoutRef.current) {
      clearTimeout(priceUpdateTimeoutRef.current);
      priceUpdateTimeoutRef.current = null;
    }
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
      syncState,
      summary,
      filters,
      isDiscovering,
      isPriceUpdating,
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

export function useMarkets() {
  const context = useContext(MarketsContext);
  if (!context) {
    throw new Error('useMarkets must be used within a MarketsProvider');
  }
  return context;
}
