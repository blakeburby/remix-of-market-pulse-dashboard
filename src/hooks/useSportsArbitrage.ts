import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useArbitrageSettings } from '@/hooks/useArbitrageSettings';

export type SportType = 'nfl' | 'nba' | 'mlb' | 'nhl' | 'cfb';

// Sport-specific event ticker prefixes for Kalshi
const SPORT_PREFIXES: Record<SportType, string[]> = {
  nfl: ['KXNFLGAME', 'KXNFL'],
  nba: ['KXNBAGAME', 'KXNBA'],
  mlb: ['KXMLBGAME', 'KXMLB'],
  nhl: ['KXNHLGAME', 'KXNHL'],
  cfb: ['KXNCAAFGAME', 'KXNCAAF'],
};

export interface KalshiSportsMarket {
  event_ticker: string;
  market_ticker: string;
  title: string;
  start_time: number;
  end_time: number;
  close_time: number;
  status: string;
  last_price: number;
  volume: number;
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
  kalshiMarket: KalshiSportsMarket | null;
  // Fetched prices
  polymarketPrices: {
    yesPrice: number;
    noPrice: number;
  } | null;
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
}

interface UseSportsArbitrageResult {
  kalshiMarkets: KalshiSportsMarket[];
  matchedPairs: MatchedMarketPair[];
  opportunities: SportsArbitrageOpportunity[];
  isLoading: boolean;
  isLoadingMatches: boolean;
  isFetchingPrices: boolean;
  error: string | null;
  lastRefresh: Date | null;
  refresh: () => Promise<void>;
  sport: SportType;
  setSport: (sport: SportType) => void;
  settings: ReturnType<typeof useArbitrageSettings>['settings'];
  updateSettings: ReturnType<typeof useArbitrageSettings>['updateSettings'];
}

export function useSportsArbitrage(): UseSportsArbitrageResult {
  const { getApiKey } = useAuth();
  const { settings, updateSettings } = useArbitrageSettings();
  const [sport, setSport] = useState<SportType>('nfl');
  const [kalshiMarkets, setKalshiMarkets] = useState<KalshiSportsMarket[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<MatchedMarketPair[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Fetch a single Polymarket token price
  const fetchPolymarketPrice = useCallback(async (tokenId: string, apiKey: string): Promise<number | null> => {
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
        return null;
      }

      const data = await response.json();
      return data.price ?? null;
    } catch {
      return null;
    }
  }, []);

  // Step 1: Fetch Kalshi sports markets
  const fetchKalshiMarkets = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('No API key available');
      return [];
    }

    const prefixes = SPORT_PREFIXES[sport];
    const allMarkets: KalshiSportsMarket[] = [];
    
    try {
      // Fetch first batch of Kalshi markets
      const response = await fetch(
        'https://api.domeapi.io/v1/kalshi/markets?status=open&limit=100',
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

      const data = await response.json();
      
      // Filter for sports markets by event ticker prefix
      const sportsMarkets = (data.markets || []).filter((m: KalshiSportsMarket) =>
        prefixes.some(prefix => m.event_ticker.startsWith(prefix))
      );
      
      allMarkets.push(...sportsMarkets);
      
      return allMarkets;
    } catch (err) {
      throw err;
    }
  }, [getApiKey, sport]);

  // Step 2: Find matching Polymarket markets using the API
  const fetchMatchingMarkets = useCallback(async (kalshiTickers: string[]) => {
    const apiKey = getApiKey();
    if (!apiKey || kalshiTickers.length === 0) return {};

    try {
      // Build query string with multiple kalshi_event_ticker params
      const uniqueTickers = [...new Set(kalshiTickers)].slice(0, 10); // Limit to 10
      const queryParams = uniqueTickers
        .map(ticker => `kalshi_event_ticker=${encodeURIComponent(ticker)}`)
        .join('&');

      const response = await fetch(
        `https://api.domeapi.io/v1/matching-markets/sports?${queryParams}`,
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
      return {};
    }
  }, [getApiKey]);

  // Step 3: Fetch Polymarket prices for matched pairs
  const fetchPricesForPairs = useCallback(async (pairs: MatchedMarketPair[]): Promise<MatchedMarketPair[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return pairs;

    const pairsWithPoly = pairs.filter(p => p.polymarket && p.polymarket.token_ids.length >= 2);
    
    // Fetch prices in parallel with rate limiting
    const updatedPairs = await Promise.all(
      pairs.map(async (pair) => {
        if (!pair.polymarket || pair.polymarket.token_ids.length < 2) {
          return pair;
        }

        const [yesTokenId, noTokenId] = pair.polymarket.token_ids;
        
        // Add small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const [yesPrice, noPrice] = await Promise.all([
          fetchPolymarketPrice(yesTokenId, apiKey),
          fetchPolymarketPrice(noTokenId, apiKey),
        ]);

        return {
          ...pair,
          polymarketPrices: yesPrice !== null && noPrice !== null
            ? { yesPrice, noPrice }
            : null,
        };
      })
    );

    return updatedPairs;
  }, [getApiKey, fetchPolymarketPrice]);

  // Main refresh function
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Get Kalshi sports markets
      const markets = await fetchKalshiMarkets();
      setKalshiMarkets(markets);

      if (markets.length === 0) {
        setMatchedPairs([]);
        setLastRefresh(new Date());
        return;
      }

      // Step 2: Get unique event tickers and find matches
      setIsLoadingMatches(true);
      const eventTickers = [...new Set(markets.map(m => m.event_ticker))];
      const matchesData = await fetchMatchingMarkets(eventTickers);

      // Build matched pairs
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
          const kalshiMarket = markets.find(m => m.event_ticker === kalshiData.event_ticker);
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
            kalshiMarket: kalshiMarket || null,
            polymarketPrices: null,
          });
        }
      }

      setMatchedPairs(pairs);
      setIsLoadingMatches(false);

      // Step 3: Fetch Polymarket prices for matched pairs
      if (pairs.some(p => p.polymarket)) {
        setIsFetchingPrices(true);
        const pairsWithPrices = await fetchPricesForPairs(pairs);
        setMatchedPairs(pairsWithPrices);
        setIsFetchingPrices(false);
      }

      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
      setIsLoadingMatches(false);
      setIsFetchingPrices(false);
    }
  }, [fetchKalshiMarkets, fetchMatchingMarkets, fetchPricesForPairs]);

  // Fetch on mount and when sport changes
  useEffect(() => {
    refresh();
  }, [sport]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate arbitrage opportunities from matched pairs with prices
  const opportunities = useMemo(() => {
    const opps: SportsArbitrageOpportunity[] = [];

    for (const pair of matchedPairs) {
      if (!pair.polymarket || !pair.polymarketPrices || !pair.kalshiMarket) {
        continue;
      }

      const kalshiYes = pair.kalshiMarket.last_price / 100; // Convert cents to decimal
      const kalshiNo = 1 - kalshiYes;
      const polyYes = pair.polymarketPrices.yesPrice;
      const polyNo = pair.polymarketPrices.noPrice;

      // Check both arbitrage directions
      // Direction 1: Buy YES on Kalshi, buy NO on Polymarket
      const cost1 = kalshiYes + polyNo;
      if (cost1 < 1) {
        const profit = 1 - cost1;
        const profitPercent = (profit / cost1) * 100;
        if (profitPercent >= settings.minProfitPercent) {
          opps.push({
            id: `${pair.kalshi.event_ticker}-1`,
            title: pair.kalshiMarket.title,
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
            expirationDate: new Date(pair.kalshiMarket.end_time * 1000),
            matchScore: 1,
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
            title: pair.kalshiMarket.title,
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
            expirationDate: new Date(pair.kalshiMarket.end_time * 1000),
            matchScore: 1,
          });
        }
      }
    }

    // Sort by profit percentage descending
    return opps.sort((a, b) => b.profitPercent - a.profitPercent);
  }, [matchedPairs, settings.minProfitPercent]);

  return {
    kalshiMarkets,
    matchedPairs,
    opportunities,
    isLoading,
    isLoadingMatches,
    isFetchingPrices,
    error,
    lastRefresh,
    refresh,
    sport,
    setSport,
    settings,
    updateSettings,
  };
}
