import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useArbitrageSettings } from '@/hooks/useArbitrageSettings';
import { format } from 'date-fns';

export type SportType = 'nfl' | 'nba' | 'mlb' | 'nhl' | 'cfb' | 'cbb';

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
  matchedPairs: MatchedMarketPair[];
  opportunities: SportsArbitrageOpportunity[];
  isLoading: boolean;
  isFetchingPrices: boolean;
  error: string | null;
  lastRefresh: Date | null;
  refresh: () => Promise<void>;
  sport: SportType;
  setSport: (sport: SportType) => void;
  date: Date;
  setDate: (date: Date) => void;
  settings: ReturnType<typeof useArbitrageSettings>['settings'];
  updateSettings: ReturnType<typeof useArbitrageSettings>['updateSettings'];
}

export function useSportsArbitrage(): UseSportsArbitrageResult {
  const { getApiKey } = useAuth();
  const { settings, updateSettings } = useArbitrageSettings();
  const [sport, setSport] = useState<SportType>('nfl');
  const [date, setDate] = useState<Date>(new Date());
  const [matchedPairs, setMatchedPairs] = useState<MatchedMarketPair[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

  // Fetch Kalshi market price (returns cents 0-100)
  const fetchKalshiPrice = useCallback(async (marketTicker: string, apiKey: string): Promise<number | null> => {
    const safeTicker = encodeURIComponent(marketTicker);

    try {
      const response = await fetch(`https://api.domeapi.io/v1/kalshi/market-price/${safeTicker}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch Kalshi price for ${marketTicker}: ${response.status}`);
        return null;
      }

      const data = await response.json();

      // Different endpoints/versions sometimes wrap the price differently.
      const price =
        (typeof data === 'number' ? data : null) ??
        data?.price ??
        data?.last_price ??
        data?.market?.price ??
        data?.market?.last_price ??
        data?.data?.price ??
        data?.data?.last_price ??
        null;

      if (typeof price !== 'number') {
        console.warn('Unexpected Kalshi price payload:', data);
        return null;
      }

      return price;
    } catch (err) {
      console.warn(`Error fetching Kalshi price for ${marketTicker}:`, err);
      return null;
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

  // Fetch prices for matched pairs
  const fetchPricesForPairs = useCallback(async (pairs: MatchedMarketPair[]): Promise<MatchedMarketPair[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return pairs;

    // Fetch prices in parallel with small delays
    const updatedPairs = await Promise.all(
      pairs.map(async (pair, index) => {
        // Add small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, index * 50));
        
        let kalshiPrices: { yesPrice: number; noPrice: number } | null = null;
        let polymarketPrices: { yesPrice: number; noPrice: number } | null = null;

        // Fetch Kalshi price (first market ticker is YES)
        if (pair.kalshi.market_tickers.length >= 1) {
          const yesPrice = await fetchKalshiPrice(pair.kalshi.market_tickers[0], apiKey);
          if (yesPrice !== null) {
            kalshiPrices = {
              yesPrice: yesPrice / 100, // Convert cents to decimal
              noPrice: 1 - (yesPrice / 100),
            };
          }
        }

        // Fetch Polymarket prices
        if (pair.polymarket && pair.polymarket.token_ids.length >= 2) {
          const [yesTokenId, noTokenId] = pair.polymarket.token_ids;
          const [yesPrice, noPrice] = await Promise.all([
            fetchPolymarketPrice(yesTokenId, apiKey),
            fetchPolymarketPrice(noTokenId, apiKey),
          ]);

          if (yesPrice !== null && noPrice !== null) {
            polymarketPrices = { yesPrice, noPrice };
          }
        }

        return {
          ...pair,
          kalshiPrices,
          polymarketPrices,
        };
      })
    );

    return updatedPairs;
  }, [getApiKey, fetchPolymarketPrice, fetchKalshiPrice]);

  // Main refresh function
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch matching markets by sport and date
      const matchesData = await fetchMatchingMarkets();

      // Build matched pairs from API response
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
            polymarketPrices: null,
          });
        }
      }

      setMatchedPairs(pairs);

      // Fetch prices for all pairs
      if (pairs.length > 0) {
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
      setIsFetchingPrices(false);
    }
  }, [fetchMatchingMarkets, fetchPricesForPairs]);

  // Fetch on mount and when sport/date changes
  useEffect(() => {
    refresh();
  }, [sport, date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate arbitrage opportunities from matched pairs with prices
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

      // Check both arbitrage directions
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
            expirationDate: new Date(), // Date is from user selection
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
          });
        }
      }
    }

    // Sort by profit percentage descending
    return opps.sort((a, b) => b.profitPercent - a.profitPercent);
  }, [matchedPairs, settings.minProfitPercent]);

  return {
    matchedPairs,
    opportunities,
    isLoading,
    isFetchingPrices,
    error,
    lastRefresh,
    refresh,
    sport,
    setSport,
    date,
    setDate,
    settings,
    updateSettings,
  };
}
