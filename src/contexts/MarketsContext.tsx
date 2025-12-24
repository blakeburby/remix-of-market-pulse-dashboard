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

export function MarketsProvider({ children }: { children: React.ReactNode }) {
  const { getApiKey, isAuthenticated } = useAuth();
  const [markets, setMarkets] = useState<UnifiedMarket[]>([]);
  const [filters, setFiltersState] = useState<MarketFilters>(defaultFilters);
  const [syncState, setSyncState] = useState<Record<Platform, SyncState>>({
    POLYMARKET: { ...defaultSyncState, platform: 'POLYMARKET' },
    KALSHI: { ...defaultSyncState, platform: 'KALSHI' },
  });
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);

  const discoveryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const priceUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isDiscoveringRef = useRef(false);
  const isPriceUpdatingRef = useRef(false);

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

  // Fetch Polymarket markets with pagination
  const fetchPolymarketMarkets = async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;

    let offset = 0;
    const limit = 100;
    const allMarkets: UnifiedMarket[] = [];

    setSyncState(prev => ({
      ...prev,
      POLYMARKET: { ...prev.POLYMARKET, isRunning: true },
    }));

    try {
      while (true) {
        await globalRateLimiter.waitAndAcquire();

        const response = await fetch(
          `https://api.domeapi.io/v1/polymarket/markets?status=open&limit=${limit}&offset=${offset}`,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data: PolymarketMarketsResponse = await response.json();
        
        for (const market of data.markets) {
          allMarkets.push(convertPolymarketMarket(market));
        }

        if (!data.pagination.has_more) {
          break;
        }

        offset += limit;
      }

      // Merge with existing markets (upsert)
      setMarkets(prev => {
        const existing = new Map(prev.filter(m => m.platform !== 'POLYMARKET').map(m => [m.id, m]));
        for (const market of allMarkets) {
          existing.set(market.id, market);
        }
        return Array.from(existing.values());
      });

      setSyncState(prev => ({
        ...prev,
        POLYMARKET: {
          ...prev.POLYMARKET,
          lastFullDiscoveryAt: new Date(),
          lastOffsetUsed: offset,
          lastError: null,
          lastSuccessAt: new Date(),
          isRunning: false,
        },
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setSyncState(prev => ({
        ...prev,
        POLYMARKET: {
          ...prev.POLYMARKET,
          lastError: errorMsg,
          isRunning: false,
        },
      }));
    }
  };

  // Fetch Kalshi markets with pagination
  const fetchKalshiMarkets = async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;

    let offset = 0;
    const limit = 100;
    const allMarkets: UnifiedMarket[] = [];

    setSyncState(prev => ({
      ...prev,
      KALSHI: { ...prev.KALSHI, isRunning: true },
    }));

    try {
      while (true) {
        await globalRateLimiter.waitAndAcquire();

        const response = await fetch(
          `https://api.domeapi.io/v1/kalshi/markets?status=open&limit=${limit}&offset=${offset}`,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data: KalshiMarketsResponse = await response.json();
        
        for (const market of data.markets) {
          allMarkets.push(convertKalshiMarket(market));
        }

        if (!data.pagination.has_more) {
          break;
        }

        offset += limit;
      }

      // Merge with existing markets (upsert)
      setMarkets(prev => {
        const existing = new Map(prev.filter(m => m.platform !== 'KALSHI').map(m => [m.id, m]));
        for (const market of allMarkets) {
          existing.set(market.id, market);
        }
        return Array.from(existing.values());
      });

      setSyncState(prev => ({
        ...prev,
        KALSHI: {
          ...prev.KALSHI,
          lastFullDiscoveryAt: new Date(),
          lastOffsetUsed: offset,
          lastError: null,
          lastSuccessAt: new Date(),
          isRunning: false,
        },
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setSyncState(prev => ({
        ...prev,
        KALSHI: {
          ...prev.KALSHI,
          lastError: errorMsg,
          isRunning: false,
        },
      }));
    }
  };

  // Fetch price for a Polymarket token
  const fetchTokenPrice = async (tokenId: string): Promise<number | null> => {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    try {
      await globalRateLimiter.waitAndAcquire();

      const response = await fetch(
        `https://api.domeapi.io/v1/polymarket/market-price/${tokenId}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data: PolymarketPriceResponse = await response.json();
      return data.price;
    } catch {
      return null;
    }
  };

  // Update prices for all Polymarket tokens (round-robin)
  const updatePrices = async () => {
    const polymarketMarkets = markets.filter(m => m.platform === 'POLYMARKET');
    if (polymarketMarkets.length === 0) return;

    // Sort by oldest update first (prioritize stale data)
    const sortedMarkets = [...polymarketMarkets].sort(
      (a, b) => a.lastUpdated.getTime() - b.lastUpdated.getTime()
    );

    // Update a batch of markets
    const batchSize = Math.min(10, sortedMarkets.length);
    const batch = sortedMarkets.slice(0, batchSize);

    for (const market of batch) {
      if (!isPriceUpdatingRef.current) break;

      if (market.sideA.tokenId) {
        const priceA = await fetchTokenPrice(market.sideA.tokenId);
        if (priceA !== null) {
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
    }
  };

  const startDiscovery = useCallback(() => {
    if (isDiscoveringRef.current) return;
    isDiscoveringRef.current = true;
    setIsDiscovering(true);

    // Initial discovery
    const runDiscovery = async () => {
      await Promise.all([fetchPolymarketMarkets(), fetchKalshiMarkets()]);
    };

    runDiscovery();

    // Set up interval for continuous discovery (every 60 seconds)
    discoveryIntervalRef.current = setInterval(runDiscovery, 60000);
  }, []);

  const stopDiscovery = useCallback(() => {
    isDiscoveringRef.current = false;
    setIsDiscovering(false);
    if (discoveryIntervalRef.current) {
      clearInterval(discoveryIntervalRef.current);
      discoveryIntervalRef.current = null;
    }
  }, []);

  const startPriceUpdates = useCallback(() => {
    if (isPriceUpdatingRef.current) return;
    isPriceUpdatingRef.current = true;
    setIsPriceUpdating(true);

    // Set up interval for continuous price updates (every 5 seconds)
    priceUpdateIntervalRef.current = setInterval(updatePrices, 5000);
    updatePrices(); // Initial update
  }, [markets]);

  const stopPriceUpdates = useCallback(() => {
    isPriceUpdatingRef.current = false;
    setIsPriceUpdating(false);
    if (priceUpdateIntervalRef.current) {
      clearInterval(priceUpdateIntervalRef.current);
      priceUpdateIntervalRef.current = null;
    }
  }, []);

  // Auto-start discovery when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      startDiscovery();
      startPriceUpdates();
    } else {
      stopDiscovery();
      stopPriceUpdates();
      setMarkets([]);
    }

    return () => {
      stopDiscovery();
      stopPriceUpdates();
    };
  }, [isAuthenticated]);

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
