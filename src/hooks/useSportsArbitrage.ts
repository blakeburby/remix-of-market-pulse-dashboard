import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useArbitrageSettings } from '@/hooks/useArbitrageSettings';
import { format } from 'date-fns';
import { toast } from 'sonner';

export type SportType = 'nfl' | 'nba' | 'mlb' | 'nhl' | 'cfb' | 'cbb';

export interface PriceError {
  status: number | null;
  message: string;
}

export interface BidAskData {
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  spread: number | null;
}

export interface MatchedMarketPair {
  kalshi: {
    platform: 'KALSHI';
    event_ticker: string;
    market_tickers: string[];
  };
  polymarket: {
    platform: 'POLYMARKET';
    market_slug: string;
    token_ids: string[];
  } | null;
  // Fetched prices
  kalshiPrices: {
    yesPrice: number;
    noPrice: number;
  } | null;
  kalshiBidAsk: BidAskData | null;
  kalshiError: PriceError | null;
  polymarketPrices: {
    yesPrice: number;
    noPrice: number;
  } | null;
  polymarketError: PriceError | null;
  pricesFetched: boolean;
  isRetrying: boolean;
}

export interface SportsArbitrageOpportunity {
  id: string;
  title: string;
  polymarketSlug: string;
  kalshiEventTicker: string;
  kalshiYesPrice: number;
  kalshiNoPrice: number;
  polyYesPrice: number;
  polyNoPrice: number;
  buyYesOn: 'POLYMARKET' | 'KALSHI';
  buyNoOn: 'POLYMARKET' | 'KALSHI';
  combinedCost: number;
  profitPercent: number;
  profitPerDollar: number;
  expirationDate: Date;
  matchScore: number;
  kalshiBidAsk: BidAskData | null;
}

export interface PriceProgress {
  total: number;
  completed: number;
  current: string | null;
}

interface UseSportsArbitrageResult {
  matchedPairs: MatchedMarketPair[];
  opportunities: SportsArbitrageOpportunity[];
  isLoading: boolean;
  isFetchingPrices: boolean;
  priceProgress: PriceProgress;
  error: string | null;
  lastRefresh: Date | null;
  refresh: () => Promise<void>;
  retryPair: (eventTicker: string) => Promise<void>;
  sport: SportType;
  setSport: (sport: SportType) => void;
  date: Date;
  setDate: (date: Date) => void;
  settings: ReturnType<typeof useArbitrageSettings>['settings'];
  updateSettings: ReturnType<typeof useArbitrageSettings>['updateSettings'];
  // Auto-refresh
  autoRefreshEnabled: boolean;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  autoRefreshCountdown: number;
  // Filters
  hideIlliquid: boolean;
  setHideIlliquid: (hide: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const AUTO_REFRESH_INTERVAL = 30; // seconds

export function useSportsArbitrage(): UseSportsArbitrageResult {
  const { getApiKey } = useAuth();
  const { settings, updateSettings } = useArbitrageSettings();
  const [sport, setSport] = useState<SportType>('nfl');
  const [date, setDate] = useState<Date>(new Date());
  const [matchedPairs, setMatchedPairs] = useState<MatchedMarketPair[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [priceProgress, setPriceProgress] = useState<PriceProgress>({ total: 0, completed: 0, current: null });
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  
  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState(AUTO_REFRESH_INTERVAL);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  
  // Filters
  const [hideIlliquid, setHideIlliquid] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Track previous opportunities count for alerts
  const prevOpportunitiesCount = useRef(0);

  // Result type for price fetches
  type PriceResult = { price: number; bidAsk?: BidAskData } | { error: PriceError };

  // Fetch a single Polymarket token price
  const fetchPolymarketPrice = useCallback(async (tokenId: string, apiKey: string): Promise<PriceResult> => {
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

      if (!response.ok) {
        return { error: { status: response.status, message: `HTTP ${response.status}` } };
      }

      const data = await response.json();
      const price = data.price ?? null;
      if (typeof price !== 'number') {
        return { error: { status: null, message: 'Invalid response' } };
      }
      return { price };
    } catch (err) {
      return { error: { status: null, message: err instanceof Error ? err.message : 'Network error' } };
    }
  }, []);

  // Fetch Kalshi market price with bid/ask data
  const fetchKalshiPrice = useCallback(async (marketTicker: string, apiKey: string): Promise<PriceResult> => {
    const safeTicker = encodeURIComponent(marketTicker);

    const deriveYesPriceCents = (payload: any): { price: number | null; bidAsk: BidAskData } => {
      const resolved = (typeof payload === 'object' && payload !== null && 'market' in payload)
        ? payload.market
        : payload;

      const yesBid = resolved?.yes_bid ?? resolved?.yesBid ?? null;
      const yesAsk = resolved?.yes_ask ?? resolved?.yesAsk ?? null;
      const noBid = resolved?.no_bid ?? resolved?.noBid ?? null;
      const noAsk = resolved?.no_ask ?? resolved?.noAsk ?? null;
      
      const spread = (typeof yesBid === 'number' && typeof yesAsk === 'number' && yesBid > 0 && yesAsk > 0)
        ? yesAsk - yesBid
        : null;

      const bidAsk: BidAskData = { yesBid, yesAsk, noBid, noAsk, spread };

      const fromBidAsk =
        (typeof yesBid === 'number' && yesBid > 0 && typeof yesAsk === 'number' && yesAsk > 0)
          ? (yesBid + yesAsk) / 2
          : (typeof yesAsk === 'number' && yesAsk > 0)
            ? yesAsk
            : (typeof yesBid === 'number' && yesBid > 0)
              ? yesBid
              : null;

      if (typeof fromBidAsk === 'number' && fromBidAsk > 0) return { price: fromBidAsk, bidAsk };

      const rawLast =
        (typeof resolved === 'number' ? resolved : null) ??
        resolved?.price ??
        resolved?.last_price ??
        resolved?.data?.price ??
        resolved?.data?.last_price ??
        null;

      return { price: (typeof rawLast === 'number' && rawLast > 0) ? rawLast : null, bidAsk };
    };

    const fetchMarketSnapshot = async (): Promise<any | null> => {
      try {
        const resp = await fetch(`https://api.domeapi.io/v1/kalshi/markets?tickers=${safeTicker}&limit=1`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (!resp.ok) return null;
        const json = await resp.json();
        const first = Array.isArray(json?.markets) ? json.markets[0] : null;
        return first ?? null;
      } catch {
        return null;
      }
    };

    try {
      const response = await fetch(`https://api.domeapi.io/v1/kalshi/market-price/${safeTicker}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return { error: { status: response.status, message: `HTTP ${response.status}` } };
      }

      const data = await response.json();
      let result = deriveYesPriceCents(data);

      // Fallback: markets snapshot when price endpoint returns 0 or missing
      if (!result.price) {
        const snapshot = await fetchMarketSnapshot();
        if (snapshot) {
          result = deriveYesPriceCents(snapshot);
        }
      }

      if (!result.price) {
        return { error: { status: null, message: 'No price / no liquidity' } };
      }

      return { price: result.price, bidAsk: result.bidAsk };
    } catch (err) {
      return { error: { status: null, message: err instanceof Error ? err.message : 'Network error' } };
    }
  }, []);

  // Fetch matching markets by sport and date
  const fetchMatchingMarkets = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('No API key available');
      return {};
    }

    const dateStr = format(date, 'yyyy-MM-dd');

    try {
      const response = await fetch(
        `https://api.domeapi.io/v1/matching-markets/sports/${sport}?date=${dateStr}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 404) {
        return {};
      }

      if (!response.ok) {
        if (response.status === 400) {
          const errorData = await response.json().catch(() => ({}));
          console.warn('Matching markets API error:', errorData);
          return {};
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.markets || {};
    } catch (err) {
      console.error('Failed to fetch matching markets:', err);
      throw err;
    }
  }, [getApiKey, sport, date]);

  // Fetch prices for a single pair
  const fetchPriceForPair = useCallback(async (pair: MatchedMarketPair): Promise<MatchedMarketPair> => {
    const apiKey = getApiKey();
    if (!apiKey) return pair;

    let kalshiPrices: { yesPrice: number; noPrice: number } | null = null;
    let kalshiBidAsk: BidAskData | null = null;
    let kalshiError: PriceError | null = null;
    let polymarketPrices: { yesPrice: number; noPrice: number } | null = null;
    let polymarketError: PriceError | null = null;

    // Fetch Kalshi price
    if (pair.kalshi.market_tickers.length >= 1) {
      const result = await fetchKalshiPrice(pair.kalshi.market_tickers[0], apiKey);
      if ('price' in result) {
        kalshiPrices = {
          yesPrice: result.price / 100,
          noPrice: 1 - (result.price / 100),
        };
        kalshiBidAsk = result.bidAsk || null;
      } else {
        kalshiError = result.error;
      }
    } else {
      kalshiError = { status: null, message: 'No market ticker' };
    }

    // Fetch Polymarket prices
    if (pair.polymarket && pair.polymarket.token_ids.length >= 2) {
      const [yesTokenId, noTokenId] = pair.polymarket.token_ids;
      const [yesResult, noResult] = await Promise.all([
        fetchPolymarketPrice(yesTokenId, apiKey),
        fetchPolymarketPrice(noTokenId, apiKey),
      ]);

      if ('price' in yesResult && 'price' in noResult) {
        polymarketPrices = { yesPrice: yesResult.price, noPrice: noResult.price };
      } else {
        const errorMsg = 'error' in yesResult ? yesResult.error.message : ('error' in noResult ? noResult.error.message : 'Unknown error');
        const errorStatus = 'error' in yesResult ? yesResult.error.status : ('error' in noResult ? noResult.error.status : null);
        polymarketError = { status: errorStatus, message: errorMsg };
      }
    } else if (pair.polymarket) {
      polymarketError = { status: null, message: 'Missing token IDs' };
    }

    return {
      ...pair,
      kalshiPrices,
      kalshiBidAsk,
      kalshiError,
      polymarketPrices,
      polymarketError,
      pricesFetched: true,
      isRetrying: false,
    };
  }, [getApiKey, fetchPolymarketPrice, fetchKalshiPrice]);

  // Fetch prices for matched pairs with progress tracking
  const fetchPricesForPairs = useCallback(async (pairs: MatchedMarketPair[]): Promise<MatchedMarketPair[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return pairs;

    setPriceProgress({ total: pairs.length, completed: 0, current: null });
    const updatedPairs: MatchedMarketPair[] = [];

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      setPriceProgress({ total: pairs.length, completed: i, current: pair.kalshi.event_ticker });
      
      // Add small delay between requests
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const updatedPair = await fetchPriceForPair(pair);
      updatedPairs.push(updatedPair);
      
      // Update state incrementally for better UX
      setMatchedPairs(prev => {
        const newPairs = [...prev];
        const idx = newPairs.findIndex(p => p.kalshi.event_ticker === pair.kalshi.event_ticker);
        if (idx >= 0) {
          newPairs[idx] = updatedPair;
        }
        return newPairs;
      });
    }

    setPriceProgress({ total: pairs.length, completed: pairs.length, current: null });
    return updatedPairs;
  }, [getApiKey, fetchPriceForPair]);

  // Retry a single pair
  const retryPair = useCallback(async (eventTicker: string) => {
    const pairIndex = matchedPairs.findIndex(p => p.kalshi.event_ticker === eventTicker);
    if (pairIndex === -1) return;

    // Mark as retrying
    setMatchedPairs(prev => {
      const newPairs = [...prev];
      newPairs[pairIndex] = { ...newPairs[pairIndex], isRetrying: true };
      return newPairs;
    });

    const pair = matchedPairs[pairIndex];
    const updatedPair = await fetchPriceForPair(pair);

    setMatchedPairs(prev => {
      const newPairs = [...prev];
      newPairs[pairIndex] = updatedPair;
      return newPairs;
    });
  }, [matchedPairs, fetchPriceForPair]);

  // Main refresh function
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const matchesData = await fetchMatchingMarkets();

      const pairs: MatchedMarketPair[] = [];
      
      for (const [key, platformsArray] of Object.entries(matchesData)) {
        const platforms = platformsArray as Array<{
          platform: 'KALSHI' | 'POLYMARKET';
          event_ticker?: string;
          market_tickers?: string[];
          market_slug?: string;
          token_ids?: string[];
        }>;
        
        const kalshiData = platforms.find(p => p.platform === 'KALSHI');
        const polyData = platforms.find(p => p.platform === 'POLYMARKET');
        
        if (kalshiData) {
          pairs.push({
            kalshi: {
              platform: 'KALSHI',
              event_ticker: kalshiData.event_ticker!,
              market_tickers: kalshiData.market_tickers || [],
            },
            polymarket: polyData ? {
              platform: 'POLYMARKET',
              market_slug: polyData.market_slug!,
              token_ids: polyData.token_ids || [],
            } : null,
            kalshiPrices: null,
            kalshiBidAsk: null,
            kalshiError: null,
            polymarketPrices: null,
            polymarketError: null,
            pricesFetched: false,
            isRetrying: false,
          });
        }
      }

      setMatchedPairs(pairs);

      if (pairs.length > 0) {
        setIsFetchingPrices(true);
        await fetchPricesForPairs(pairs);
        setIsFetchingPrices(false);
      }

      setLastRefresh(new Date());
      setAutoRefreshCountdown(AUTO_REFRESH_INTERVAL);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
      setIsFetchingPrices(false);
    }
  }, [fetchMatchingMarkets, fetchPricesForPairs]);

  // Fetch on mount and when sport/date changes
  useEffect(() => {
    refresh();
  }, [sport, date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshEnabled && !isLoading && !isFetchingPrices) {
      // Countdown timer
      countdownRef.current = setInterval(() => {
        setAutoRefreshCountdown(prev => {
          if (prev <= 1) {
            return AUTO_REFRESH_INTERVAL;
          }
          return prev - 1;
        });
      }, 1000);

      // Refresh timer
      autoRefreshRef.current = setInterval(() => {
        refresh();
      }, AUTO_REFRESH_INTERVAL * 1000);
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [autoRefreshEnabled, isLoading, isFetchingPrices, refresh]);

  // Calculate arbitrage opportunities
  const opportunities = useMemo(() => {
    const opps: SportsArbitrageOpportunity[] = [];

    for (const pair of matchedPairs) {
      if (!pair.polymarket || !pair.polymarketPrices || !pair.kalshiPrices) {
        continue;
      }

      const kalshiYes = pair.kalshiPrices.yesPrice;
      const kalshiNo = pair.kalshiPrices.noPrice;
      const polyYes = pair.polymarketPrices.yesPrice;
      const polyNo = pair.polymarketPrices.noPrice;

      // Direction 1: Buy YES on Kalshi, buy NO on Polymarket
      const cost1 = kalshiYes + polyNo;
      if (cost1 < 1) {
        const profit = 1 - cost1;
        const profitPercent = (profit / cost1) * 100;
        if (profitPercent >= settings.minProfitPercent) {
          opps.push({
            id: `${pair.kalshi.event_ticker}-1`,
            title: pair.kalshi.event_ticker,
            polymarketSlug: pair.polymarket.market_slug,
            kalshiEventTicker: pair.kalshi.event_ticker,
            kalshiYesPrice: kalshiYes,
            kalshiNoPrice: kalshiNo,
            polyYesPrice: polyYes,
            polyNoPrice: polyNo,
            buyYesOn: 'KALSHI',
            buyNoOn: 'POLYMARKET',
            combinedCost: cost1,
            profitPercent,
            profitPerDollar: profit,
            expirationDate: new Date(),
            matchScore: 1,
            kalshiBidAsk: pair.kalshiBidAsk,
          });
        }
      }

      // Direction 2: Buy YES on Polymarket, buy NO on Kalshi
      const cost2 = polyYes + kalshiNo;
      if (cost2 < 1) {
        const profit = 1 - cost2;
        const profitPercent = (profit / cost2) * 100;
        if (profitPercent >= settings.minProfitPercent) {
          opps.push({
            id: `${pair.kalshi.event_ticker}-2`,
            title: pair.kalshi.event_ticker,
            polymarketSlug: pair.polymarket.market_slug,
            kalshiEventTicker: pair.kalshi.event_ticker,
            kalshiYesPrice: kalshiYes,
            kalshiNoPrice: kalshiNo,
            polyYesPrice: polyYes,
            polyNoPrice: polyNo,
            buyYesOn: 'POLYMARKET',
            buyNoOn: 'KALSHI',
            combinedCost: cost2,
            profitPercent,
            profitPerDollar: profit,
            expirationDate: new Date(),
            matchScore: 1,
            kalshiBidAsk: pair.kalshiBidAsk,
          });
        }
      }
    }

    return opps.sort((a, b) => b.profitPercent - a.profitPercent);
  }, [matchedPairs, settings.minProfitPercent]);

  // Alert on new opportunities
  useEffect(() => {
    if (opportunities.length > prevOpportunitiesCount.current && prevOpportunitiesCount.current > 0) {
      const newCount = opportunities.length - prevOpportunitiesCount.current;
      toast.success(`🎯 ${newCount} new arbitrage opportunit${newCount === 1 ? 'y' : 'ies'} found!`, {
        duration: 5000,
      });
      // Play sound
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR8MLpTW98aYTjMEXpHN6bCNZD0FFH6c4O7LhHlTTF1w');
        audio.volume = 0.3;
        audio.play().catch(() => {});
      } catch {}
    }
    prevOpportunitiesCount.current = opportunities.length;
  }, [opportunities.length]);

  // Filter matched pairs
  const filteredPairs = useMemo(() => {
    let filtered = matchedPairs;

    // Hide illiquid
    if (hideIlliquid) {
      filtered = filtered.filter(p => 
        (p.kalshiPrices && (p.kalshiBidAsk?.yesBid || p.kalshiBidAsk?.yesAsk)) ||
        p.kalshiPrices
      );
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.kalshi.event_ticker.toLowerCase().includes(query) ||
        p.polymarket?.market_slug.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [matchedPairs, hideIlliquid, searchQuery]);

  return {
    matchedPairs: filteredPairs,
    opportunities,
    isLoading,
    isFetchingPrices,
    priceProgress,
    error,
    lastRefresh,
    refresh,
    retryPair,
    sport,
    setSport,
    date,
    setDate,
    settings,
    updateSettings,
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    autoRefreshCountdown,
    hideIlliquid,
    setHideIlliquid,
    searchQuery,
    setSearchQuery,
  };
}
