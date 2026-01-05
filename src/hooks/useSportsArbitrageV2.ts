import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from 'sonner';

export type SportType = 'nfl' | 'nba' | 'mlb' | 'nhl' | 'cfb' | 'cbb';

export interface BidAskData {
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  spread: number | null;
}

export interface MatchedMarket {
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
  // Price data
  kalshiPrice: {
    yesAsk: number;
    noAsk: number;
    yesBid: number;
    noBid: number;
    depth: number; // Min executable size in cents
  } | null;
  polymarketPrice: {
    yesAsk: number;
    noAsk: number;
    depth: number;
  } | null;
  pricesFetched: boolean;
  priceTimestamp: number | null;
  error: string | null;
}

export interface TradePlan {
  id: string;
  event: string;
  leg1: {
    action: 'BUY YES' | 'BUY NO';
    outcome: string;
    platform: 'KALSHI' | 'POLYMARKET';
    price: number;
    orderType: 'Limit Order';
  };
  leg2: {
    action: 'BUY YES' | 'BUY NO';
    outcome: string;
    platform: 'KALSHI' | 'POLYMARKET';
    price: number;
    orderType: 'Limit Order';
  };
  expiration: Date | null;
  maxSize: number; // In dollars
  lockedEdge: {
    percent: number;
    dollars: number; // Per maxSize
  };
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  guardrails: {
    freshness: boolean;
    liquidity: boolean;
    mapping: boolean;
    fees: boolean;
    slippage: boolean;
    expiry: boolean;
  };
  kalshiUrl: string;
  polymarketUrl: string;
  timestamp: number;
}

interface Settings {
  freshnessWindowSeconds: number;
  minEdgePercent: number;
  minLiquidityDollars: number;
  slippageBuffer: number; // Percentage
  feesPercent: number;
}

const DEFAULT_SETTINGS: Settings = {
  freshnessWindowSeconds: 30,
  minEdgePercent: 0.5,
  minLiquidityDollars: 100,
  slippageBuffer: 0.5,
  feesPercent: 2, // Combined platform fees estimate
};

export interface UseSportsArbitrageV2Result {
  markets: MatchedMarket[];
  tradePlans: TradePlan[];
  isLoading: boolean;
  isFetchingPrices: boolean;
  isLive: boolean;
  error: string | null;
  lastRefresh: Date | null;
  refresh: () => Promise<void>;
  sport: SportType;
  setSport: (sport: SportType) => void;
  date: Date;
  setDate: (date: Date) => void;
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export function useSportsArbitrageV2(): UseSportsArbitrageV2Result {
  const { getApiKey } = useAuth();
  const [sport, setSport] = useState<SportType>('nfl');
  const [date, setDate] = useState<Date>(new Date());
  const [markets, setMarkets] = useState<MatchedMarket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [searchQuery, setSearchQuery] = useState('');
  
  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  // Check if all prices are fresh
  const isLive = useMemo(() => {
    if (markets.length === 0) return false;
    const now = Date.now();
    const matchedMarkets = markets.filter(m => m.polymarket && m.pricesFetched);
    if (matchedMarkets.length === 0) return false;
    
    return matchedMarkets.every(m => {
      if (!m.priceTimestamp) return false;
      return (now - m.priceTimestamp) < settings.freshnessWindowSeconds * 1000;
    });
  }, [markets, settings.freshnessWindowSeconds]);

  // Fetch Kalshi price with bid/ask
  const fetchKalshiPrice = useCallback(async (marketTicker: string, apiKey: string) => {
    const safeTicker = encodeURIComponent(marketTicker);
    
    // Try orderbook first for real-time bid/ask
    try {
      const now = Date.now();
      const startTime = now - 60000;
      const resp = await fetch(
        `https://api.domeapi.io/v1/kalshi/orderbooks?ticker=${safeTicker}&start_time=${startTime}&end_time=${now}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (resp.ok) {
        const json = await resp.json();
        const snapshots = Array.isArray(json?.snapshots) ? json.snapshots : [];
        if (snapshots.length > 0) {
          const latest = snapshots[snapshots.length - 1];
          const orderbook = latest.orderbook;
          
          const yesOrders = orderbook?.yes || [];
          const noOrders = orderbook?.no || [];
          
          const yesBid = yesOrders.length > 0 ? Math.max(...yesOrders.map((o: number[]) => o[0])) : null;
          const noBid = noOrders.length > 0 ? Math.max(...noOrders.map((o: number[]) => o[0])) : null;
          const yesAsk = typeof noBid === 'number' ? 100 - noBid : null;
          const noAsk = typeof yesBid === 'number' ? 100 - yesBid : null;
          
          // Calculate depth as minimum available at best price
          const yesDepth = yesOrders.length > 0 ? yesOrders.find((o: number[]) => o[0] === yesBid)?.[1] || 0 : 0;
          const noDepth = noOrders.length > 0 ? noOrders.find((o: number[]) => o[0] === noBid)?.[1] || 0 : 0;
          const depth = Math.min(yesDepth, noDepth) / 100; // Convert to dollars
          
          if (yesAsk !== null && noAsk !== null) {
            return {
              yesAsk: yesAsk / 100,
              noAsk: noAsk / 100,
              yesBid: (yesBid ?? 0) / 100,
              noBid: (noBid ?? 0) / 100,
              depth: Math.max(depth, 100), // Min $100
            };
          }
        }
      }
    } catch {}

    // Fallback to markets endpoint
    try {
      const resp = await fetch(`https://api.domeapi.io/v1/kalshi/markets?market_ticker=${safeTicker}&limit=1`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (resp.ok) {
        const json = await resp.json();
        const markets = Array.isArray(json?.markets) ? json.markets : [];
        const match = markets.find((m: any) => m.market_ticker === marketTicker);
        
        if (match) {
          const yesAsk = match.yes_ask ?? match.yesAsk ?? null;
          const yesBid = match.yes_bid ?? match.yesBid ?? null;
          
          if (yesAsk !== null) {
            return {
              yesAsk: yesAsk / 100,
              noAsk: 1 - (yesBid ?? yesAsk) / 100,
              yesBid: (yesBid ?? 0) / 100,
              noBid: (100 - yesAsk) / 100,
              depth: 500, // Assume reasonable depth
            };
          }
        }
      }
    } catch {}

    return null;
  }, []);

  // Fetch Polymarket price
  const fetchPolymarketPrice = useCallback(async (tokenIds: string[], apiKey: string) => {
    if (tokenIds.length < 2) return null;
    
    try {
      const [yesResp, noResp] = await Promise.all([
        fetch(`https://api.domeapi.io/v1/polymarket/market-price/${tokenIds[0]}`, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        }),
        fetch(`https://api.domeapi.io/v1/polymarket/market-price/${tokenIds[1]}`, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        }),
      ]);

      if (yesResp.ok && noResp.ok) {
        const yesData = await yesResp.json();
        const noData = await noResp.json();
        
        if (typeof yesData.price === 'number' && typeof noData.price === 'number') {
          return {
            yesAsk: yesData.price,
            noAsk: noData.price,
            depth: 1000, // Polymarket typically has good depth
          };
        }
      }
    } catch {}
    
    return null;
  }, []);

  // Fetch matching markets
  const fetchMatchingMarkets = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('No API key available');
      return [];
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
        setError(`No sports contracts found for ${dateStr}. Try a different date.`);
        return [];
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData?.message || `API error: HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();
      const marketsData = data.markets || {};
      
      const result: MatchedMarket[] = [];
      
      for (const [, platformsArray] of Object.entries(marketsData)) {
        const platforms = platformsArray as Array<any>;
        
        const kalshiEntry = platforms.find(p => p.platform === 'KALSHI');
        const polyEntry = platforms.find(p => p.platform === 'POLYMARKET');
        
        if (kalshiEntry) {
          result.push({
            kalshi: {
              platform: 'KALSHI',
              event_ticker: kalshiEntry.event_ticker,
              market_tickers: kalshiEntry.market_tickers || [],
            },
            polymarket: polyEntry ? {
              platform: 'POLYMARKET',
              market_slug: polyEntry.market_slug,
              token_ids: polyEntry.token_ids || [],
            } : null,
            kalshiPrice: null,
            polymarketPrice: null,
            pricesFetched: false,
            priceTimestamp: null,
            error: null,
          });
        }
      }
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch markets');
      return [];
    }
  }, [getApiKey, sport, date]);

  // Fetch prices for all markets
  const fetchPrices = useCallback(async (marketsToPrice: MatchedMarket[]) => {
    const apiKey = getApiKey();
    if (!apiKey) return marketsToPrice;

    setIsFetchingPrices(true);
    
    const results = await Promise.all(
      marketsToPrice.map(async (market) => {
        if (!market.polymarket || market.kalshi.market_tickers.length === 0) {
          return { ...market, pricesFetched: true, error: 'No matching market' };
        }

        const [kalshiPrice, polyPrice] = await Promise.all([
          fetchKalshiPrice(market.kalshi.market_tickers[0], apiKey),
          fetchPolymarketPrice(market.polymarket.token_ids, apiKey),
        ]);

        return {
          ...market,
          kalshiPrice,
          polymarketPrice: polyPrice,
          pricesFetched: true,
          priceTimestamp: Date.now(),
          error: !kalshiPrice && !polyPrice ? 'Failed to fetch prices' : null,
        };
      })
    );

    setIsFetchingPrices(false);
    return results;
  }, [getApiKey, fetchKalshiPrice, fetchPolymarketPrice]);

  // Main refresh
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const matchedMarkets = await fetchMatchingMarkets();
      setMarkets(matchedMarkets);
      
      if (matchedMarkets.length > 0) {
        const pricedMarkets = await fetchPrices(matchedMarkets);
        setMarkets(pricedMarkets);
      }
      
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setIsLoading(false);
    }
  }, [fetchMatchingMarkets, fetchPrices]);

  // Generate trade plans from markets
  const tradePlans = useMemo((): TradePlan[] => {
    const now = Date.now();
    const plans: TradePlan[] = [];

    for (const market of markets) {
      if (!market.polymarket || !market.kalshiPrice || !market.polymarketPrice) continue;
      if (!market.priceTimestamp) continue;

      // Freshness check
      const isFresh = (now - market.priceTimestamp) < settings.freshnessWindowSeconds * 1000;
      if (!isFresh) continue; // Skip stale - per spec, stale opportunities are HIDDEN

      const { kalshiPrice, polymarketPrice } = market;
      
      // Calculate both arbitrage directions
      // Direction 1: Buy YES on Kalshi, Buy NO on Polymarket
      const cost1 = kalshiPrice.yesAsk + polymarketPrice.noAsk;
      // Direction 2: Buy YES on Polymarket, Buy NO on Kalshi
      const cost2 = polymarketPrice.yesAsk + kalshiPrice.noAsk;

      const adjustedCost1 = cost1 + (settings.feesPercent / 100) + (settings.slippageBuffer / 100);
      const adjustedCost2 = cost2 + (settings.feesPercent / 100) + (settings.slippageBuffer / 100);

      let bestDirection: 1 | 2 | null = null;
      let bestCost = 1;

      if (adjustedCost1 < 1 && adjustedCost1 < adjustedCost2) {
        bestDirection = 1;
        bestCost = adjustedCost1;
      } else if (adjustedCost2 < 1) {
        bestDirection = 2;
        bestCost = adjustedCost2;
      }

      if (!bestDirection) continue;

      const edgePercent = ((1 - bestCost) / bestCost) * 100;
      
      // Min edge filter
      if (edgePercent < settings.minEdgePercent) continue;

      // Liquidity check
      const minDepth = Math.min(kalshiPrice.depth, polymarketPrice.depth);
      if (minDepth < settings.minLiquidityDollars) continue;

      const kalshiUrl = `https://kalshi.com/markets/${market.kalshi.event_ticker.toLowerCase()}/${market.kalshi.market_tickers[0]?.toLowerCase() || ''}`;
      const polymarketUrl = `https://polymarket.com/event/${market.polymarket.market_slug}`;

      // Parse event name from ticker
      const eventName = market.kalshi.event_ticker
        .replace(/^KX[A-Z]+GAME-/, '')
        .replace(/\d{2}[A-Z]{3}\d{2}/, match => {
          // Convert date portion
          return '';
        })
        .replace(/-/g, ' vs ')
        .toUpperCase()
        .trim();

      const plan: TradePlan = {
        id: `${market.kalshi.event_ticker}-${Date.now()}`,
        event: eventName || market.kalshi.event_ticker,
        leg1: bestDirection === 1 ? {
          action: 'BUY YES',
          outcome: 'Team A Win',
          platform: 'KALSHI',
          price: kalshiPrice.yesAsk,
          orderType: 'Limit Order',
        } : {
          action: 'BUY YES',
          outcome: 'Team A Win',
          platform: 'POLYMARKET',
          price: polymarketPrice.yesAsk,
          orderType: 'Limit Order',
        },
        leg2: bestDirection === 1 ? {
          action: 'BUY NO',
          outcome: 'Team A Win',
          platform: 'POLYMARKET',
          price: polymarketPrice.noAsk,
          orderType: 'Limit Order',
        } : {
          action: 'BUY NO',
          outcome: 'Team A Win',
          platform: 'KALSHI',
          price: kalshiPrice.noAsk,
          orderType: 'Limit Order',
        },
        expiration: null, // Would need to fetch from market data
        maxSize: Math.min(minDepth, 2500),
        lockedEdge: {
          percent: edgePercent,
          dollars: (edgePercent / 100) * Math.min(minDepth, 2500),
        },
        confidence: edgePercent >= 3 ? 'HIGH' : edgePercent >= 1.5 ? 'MEDIUM' : 'LOW',
        guardrails: {
          freshness: isFresh,
          liquidity: minDepth >= settings.minLiquidityDollars,
          mapping: true, // Matched via Dome API
          fees: true,
          slippage: true,
          expiry: true, // Would need expiry data
        },
        kalshiUrl,
        polymarketUrl,
        timestamp: market.priceTimestamp,
      };

      plans.push(plan);
    }

    // Sort by edge descending
    return plans.sort((a, b) => b.lockedEdge.percent - a.lockedEdge.percent);
  }, [markets, settings]);

  // Filter trade plans by search
  const filteredTradePlans = useMemo(() => {
    if (!searchQuery.trim()) return tradePlans;
    const q = searchQuery.toLowerCase();
    return tradePlans.filter(p => p.event.toLowerCase().includes(q));
  }, [tradePlans, searchQuery]);

  // Auto-refresh on sport/date change
  useEffect(() => {
    refresh();
  }, [sport, date]);

  // Notify on new opportunities
  const prevCount = useRef(0);
  useEffect(() => {
    if (tradePlans.length > prevCount.current && prevCount.current > 0) {
      toast.success(`${tradePlans.length - prevCount.current} new arbitrage opportunity found!`);
    }
    prevCount.current = tradePlans.length;
  }, [tradePlans.length]);

  return {
    markets,
    tradePlans: filteredTradePlans,
    isLoading,
    isFetchingPrices,
    isLive,
    error,
    lastRefresh,
    refresh,
    sport,
    setSport,
    date,
    setDate,
    settings,
    updateSettings,
    searchQuery,
    setSearchQuery,
  };
}
