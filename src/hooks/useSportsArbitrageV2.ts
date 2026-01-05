import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from 'sonner';

export type SportType = 'nfl' | 'nba' | 'mlb' | 'nhl' | 'cfb' | 'cbb';

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

  // Enriched metadata (best-effort)
  title: string | null;
  outcomeA: string | null;
  outcomeB: string | null;
  expiresAt: number | null; // ms

  // Prices (best-effort). NOTE: for sports winner markets, "YES" ~= outcome A and "NO" ~= outcome B.
  kalshiPrice: {
    yesAsk: number | null;
    noAsk: number | null;
    yesBid: number | null;
    noBid: number | null;
    depth: number | null; // dollars
  } | null;
  polymarketPrice: {
    yesAsk: number | null;
    noAsk: number | null;
    depth: number | null; // dollars
  } | null;

  kalshiUpdatedAt: number | null; // ms
  polymarketUpdatedAt: number | null; // ms

  pricesFetched: boolean;
  priceTimestamp: number | null; // ms (when we last computed)

  kalshiError: string | null;
  polymarketError: string | null;
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
  maxSize: number; // dollars
  lockedEdge: {
    percent: number;
    dollars: number;
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
  slippageBuffer: number; // percent
  feesPercent: number; // percent
}

const DEFAULT_SETTINGS: Settings = {
  freshnessWindowSeconds: 30,
  minEdgePercent: 0.5,
  minLiquidityDollars: 100,
  slippageBuffer: 0.5,
  feesPercent: 2,
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

function parseTeamsFromTitle(title: string): { a: string; b: string } | null {
  // Examples: "Atlanta vs Toronto Winner?"
  const m = title.match(/^(.+?)\s+vs\s+(.+?)\s+Winner\?/i);
  if (!m) return null;
  const a = m[1].trim();
  const b = m[2].trim();
  if (!a || !b) return null;
  return { a, b };
}

function msFromSeconds(seconds: unknown): number | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  return seconds * 1000;
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
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const isLive = useMemo(() => {
    const now = Date.now();
    const priced = markets.filter((m) => m.polymarket && m.kalshiPrice && m.polymarketPrice);
    if (priced.length === 0) return false;

    return priced.every((m) => {
      if (!m.kalshiUpdatedAt || !m.polymarketUpdatedAt) return false;
      return (
        now - m.kalshiUpdatedAt < settings.freshnessWindowSeconds * 1000 &&
        now - m.polymarketUpdatedAt < settings.freshnessWindowSeconds * 1000
      );
    });
  }, [markets, settings.freshnessWindowSeconds]);

  const fetchKalshiMarketInfo = useCallback(async (marketTicker: string, apiKey: string) => {
    try {
      const safeTicker = encodeURIComponent(marketTicker);
      const resp = await fetch(
        `https://api.domeapi.io/v1/kalshi/markets?market_ticker=${safeTicker}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!resp.ok) return null;
      const json = await resp.json();
      const mkts = Array.isArray(json?.markets) ? json.markets : [];
      const m = mkts.find((x: any) => x?.market_ticker === marketTicker) ?? mkts[0];
      if (!m) return null;

      return {
        title: typeof m.title === 'string' ? m.title : null,
        closeTimeMs: msFromSeconds(m.close_time ?? m.closeTime ?? m.end_time ?? m.endTime),
      };
    } catch {
      return null;
    }
  }, []);

  const fetchKalshiOutcome = useCallback(async (marketTicker: string, apiKey: string) => {
    const safeTicker = encodeURIComponent(marketTicker);

    // Orderbooks endpoint expects epoch milliseconds
    try {
      const nowMs = Date.now();
      const startMs = nowMs - 60 * 60 * 1000; // last hour

      const resp = await fetch(
        `https://api.domeapi.io/v1/kalshi/orderbooks?ticker=${safeTicker}&start_time=${startMs}&end_time=${nowMs}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!resp.ok) return null;
      const json = await resp.json();
      const snapshots = Array.isArray(json?.snapshots) ? json.snapshots : [];
      if (snapshots.length === 0) return null;

      const latest = snapshots[snapshots.length - 1];
      const orderbook = latest?.orderbook;

      const yesOrders: Array<[number, number]> = Array.isArray(orderbook?.yes) ? orderbook.yes : [];
      const noOrders: Array<[number, number]> = Array.isArray(orderbook?.no) ? orderbook.no : [];

      const yesBidCents = yesOrders.length ? Math.max(...yesOrders.map((o) => o[0])) : null;
      const noBidCents = noOrders.length ? Math.max(...noOrders.map((o) => o[0])) : null;

      // Best executable YES ask can be derived from best NO bid (complement pricing)
      const yesAskCents = typeof noBidCents === 'number' ? 100 - noBidCents : null;

      const yesBidQty =
        typeof yesBidCents === 'number'
          ? (yesOrders.find((o) => o[0] === yesBidCents)?.[1] ?? 0)
          : 0;
      const noBidQty =
        typeof noBidCents === 'number'
          ? (noOrders.find((o) => o[0] === noBidCents)?.[1] ?? 0)
          : 0;

      const depthDollars = Math.min(yesBidQty, noBidQty) / 100; // best-effort

      const yesBid = typeof yesBidCents === 'number' ? yesBidCents / 100 : null;
      const yesAsk = typeof yesAskCents === 'number' ? yesAskCents / 100 : null;

      return {
        yesBid,
        yesAsk,
        depth: Number.isFinite(depthDollars) ? depthDollars : null,
        updatedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }, []);

  const fetchPolymarketOutcomes = useCallback(async (tokenIds: string[], apiKey: string) => {
    if (tokenIds.length < 2) return null;

    try {
      const [aResp, bResp] = await Promise.all([
        fetch(`https://api.domeapi.io/v1/polymarket/market-price/${tokenIds[0]}`, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        }),
        fetch(`https://api.domeapi.io/v1/polymarket/market-price/${tokenIds[1]}`, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        }),
      ]);

      if (!aResp.ok || !bResp.ok) return null;
      const aData = await aResp.json();
      const bData = await bResp.json();

      const aAsk = typeof aData?.price === 'number' ? aData.price : null;
      const bAsk = typeof bData?.price === 'number' ? bData.price : null;
      const atTimeMs = msFromSeconds(aData?.at_time) ?? msFromSeconds(bData?.at_time) ?? Date.now();

      return {
        yesAsk: aAsk,
        noAsk: bAsk,
        depth: 1000,
        updatedAt: atTimeMs,
      };
    } catch {
      return null;
    }
  }, []);

  const fetchMatchingMarkets = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('No API key available');
      return [] as MatchedMarket[];
    }

    const dateStr = format(date, 'yyyy-MM-dd');

    try {
      const response = await fetch(
        `https://api.domeapi.io/v1/matching-markets/sports/${sport}?date=${dateStr}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
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
      const marketsData = data?.markets || {};

      const result: MatchedMarket[] = [];
      for (const [, platformsArray] of Object.entries(marketsData)) {
        const platforms = platformsArray as Array<any>;
        const kalshiEntry = platforms.find((p) => p.platform === 'KALSHI');
        const polyEntry = platforms.find((p) => p.platform === 'POLYMARKET');

        if (!kalshiEntry) continue;

        result.push({
          kalshi: {
            platform: 'KALSHI',
            event_ticker: kalshiEntry.event_ticker,
            market_tickers: kalshiEntry.market_tickers || [],
          },
          polymarket: polyEntry
            ? {
                platform: 'POLYMARKET',
                market_slug: polyEntry.market_slug,
                token_ids: polyEntry.token_ids || [],
              }
            : null,

          title: null,
          outcomeA: null,
          outcomeB: null,
          expiresAt: null,

          kalshiPrice: null,
          polymarketPrice: null,

          kalshiUpdatedAt: null,
          polymarketUpdatedAt: null,

          pricesFetched: false,
          priceTimestamp: null,

          kalshiError: null,
          polymarketError: null,
        });
      }

      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch markets');
      return [];
    }
  }, [getApiKey, sport, date]);

  const fetchPrices = useCallback(
    async (marketsToPrice: MatchedMarket[]): Promise<MatchedMarket[]> => {
      const apiKey = getApiKey();
      if (!apiKey) return marketsToPrice;

      setIsFetchingPrices(true);

      const results = await Promise.all(
        marketsToPrice.map(async (market) => {
          if (!market.polymarket) {
            return { ...market, pricesFetched: true, kalshiError: null, polymarketError: 'No match on Polymarket' };
          }

          const tickerA = market.kalshi.market_tickers[0] ?? null;
          const tickerB = market.kalshi.market_tickers[1] ?? null;

          const [kalshiInfo, kA, kB, poly] = await Promise.all([
            tickerA ? fetchKalshiMarketInfo(tickerA, apiKey) : Promise.resolve(null),
            tickerA ? fetchKalshiOutcome(tickerA, apiKey) : Promise.resolve(null),
            tickerB ? fetchKalshiOutcome(tickerB, apiKey) : Promise.resolve(null),
            fetchPolymarketOutcomes(market.polymarket.token_ids, apiKey),
          ]);

          const title = kalshiInfo?.title ?? market.title;
          const teams = title ? parseTeamsFromTitle(title) : null;

          const yesAsk = kA?.yesAsk ?? kA?.yesBid ?? null;
          const noAsk = kB?.yesAsk ?? kB?.yesBid ?? null;

          const kalshiPrice = {
            yesAsk,
            noAsk,
            yesBid: kA?.yesBid ?? null,
            noBid: kB?.yesBid ?? null,
            depth:
              typeof kA?.depth === 'number' && typeof kB?.depth === 'number'
                ? Math.min(kA.depth, kB.depth)
                : (kA?.depth ?? kB?.depth ?? null),
          };

          const polymarketPrice = {
            yesAsk: poly?.yesAsk ?? null,
            noAsk: poly?.noAsk ?? null,
            depth: poly?.depth ?? null,
          };

          const kalshiError =
            !tickerA || !tickerB
              ? 'Missing Kalshi outcome tickers'
              : (!kA || !kB)
                ? 'No Kalshi orderbook quotes'
                : (yesAsk === null || noAsk === null)
                  ? 'Kalshi quotes missing'
                  : null;

          const polymarketError =
            !poly || poly.yesAsk === null || poly.noAsk === null ? 'Missing Polymarket quotes' : null;

          return {
            ...market,
            title,
            outcomeA: teams?.a ?? null,
            outcomeB: teams?.b ?? null,
            expiresAt: kalshiInfo?.closeTimeMs ?? market.expiresAt,

            kalshiPrice,
            polymarketPrice,

            kalshiUpdatedAt: kA?.updatedAt ?? kB?.updatedAt ?? null,
            polymarketUpdatedAt: poly?.updatedAt ?? null,

            pricesFetched: true,
            priceTimestamp: Date.now(),

            kalshiError,
            polymarketError,
          };
        })
      );

      setIsFetchingPrices(false);
      return results;
    },
    [getApiKey, fetchKalshiOutcome, fetchPolymarketOutcomes, fetchKalshiMarketInfo]
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const matchedMarkets = await fetchMatchingMarkets();
      setMarkets(matchedMarkets);

      if (matchedMarkets.length > 0) {
        const priced = await fetchPrices(matchedMarkets);
        setMarkets(priced);
      }

      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setIsLoading(false);
    }
  }, [fetchMatchingMarkets, fetchPrices]);

  const tradePlans = useMemo((): TradePlan[] => {
    const now = Date.now();
    const plans: TradePlan[] = [];

    for (const market of markets) {
      if (!market.polymarket || !market.kalshiPrice || !market.polymarketPrice) continue;

      const aK = market.kalshiPrice.yesAsk;
      const bK = market.kalshiPrice.noAsk;
      const aP = market.polymarketPrice.yesAsk;
      const bP = market.polymarketPrice.noAsk;

      if (aK === null || bK === null || aP === null || bP === null) continue;
      if (!market.kalshiUpdatedAt || !market.polymarketUpdatedAt) continue;

      const freshA = now - market.kalshiUpdatedAt < settings.freshnessWindowSeconds * 1000;
      const freshB = now - market.polymarketUpdatedAt < settings.freshnessWindowSeconds * 1000;
      const isFresh = freshA && freshB;
      if (!isFresh) continue; // hide stale per spec

      const feeSlipMultiplier = 1 + (settings.feesPercent + settings.slippageBuffer) / 100;

      const cost1 = (aK + bP) * feeSlipMultiplier; // buy A on Kalshi + (NO A) on Poly
      const cost2 = (aP + bK) * feeSlipMultiplier; // buy A on Poly + (NO A) on Kalshi

      let bestDirection: 1 | 2 | null = null;
      let bestCost = 1;

      if (cost1 < 1 && cost1 <= cost2) {
        bestDirection = 1;
        bestCost = cost1;
      } else if (cost2 < 1) {
        bestDirection = 2;
        bestCost = cost2;
      }

      if (!bestDirection) continue;

      const edgePercent = ((1 - bestCost) / bestCost) * 100;
      if (edgePercent < settings.minEdgePercent) continue;

      const minDepth = Math.min(market.kalshiPrice.depth ?? 0, market.polymarketPrice.depth ?? 0);
      if (minDepth < settings.minLiquidityDollars) continue;

      const outcomeA = market.outcomeA ?? 'Outcome A';
      const outcomeB = market.outcomeB ?? 'Outcome B';

      const kalshiUrl = `https://kalshi.com/markets/${market.kalshi.event_ticker.toLowerCase()}/${market.kalshi.market_tickers[0]?.toLowerCase() || ''}`;
      const polymarketUrl = `https://polymarket.com/event/${market.polymarket.market_slug}`;

      const eventName = market.title ?? market.kalshi.event_ticker;

      const maxSize = Math.min(minDepth, 2500);

      const plan: TradePlan = {
        id: `${market.kalshi.event_ticker}-${market.priceTimestamp ?? Date.now()}`,
        event: eventName,
        leg1:
          bestDirection === 1
            ? {
                action: 'BUY YES',
                outcome: outcomeA,
                platform: 'KALSHI',
                price: aK,
                orderType: 'Limit Order',
              }
            : {
                action: 'BUY YES',
                outcome: outcomeA,
                platform: 'POLYMARKET',
                price: aP,
                orderType: 'Limit Order',
              },
        leg2:
          bestDirection === 1
            ? {
                action: 'BUY NO',
                outcome: `${outcomeA} (NO = ${outcomeB})`,
                platform: 'POLYMARKET',
                price: bP,
                orderType: 'Limit Order',
              }
            : {
                action: 'BUY NO',
                outcome: `${outcomeA} (NO = ${outcomeB})`,
                platform: 'KALSHI',
                price: bK,
                orderType: 'Limit Order',
              },
        expiration: typeof market.expiresAt === 'number' ? new Date(market.expiresAt) : null,
        maxSize,
        lockedEdge: {
          percent: edgePercent,
          dollars: (edgePercent / 100) * maxSize,
        },
        confidence: edgePercent >= 3 ? 'HIGH' : edgePercent >= 1.5 ? 'MEDIUM' : 'LOW',
        guardrails: {
          freshness: isFresh,
          liquidity: minDepth >= settings.minLiquidityDollars,
          mapping: true,
          fees: true,
          slippage: true,
          expiry: true,
        },
        kalshiUrl,
        polymarketUrl,
        timestamp: market.priceTimestamp ?? Date.now(),
      };

      plans.push(plan);
    }

    return plans.sort((a, b) => b.lockedEdge.percent - a.lockedEdge.percent);
  }, [markets, settings]);

  const filteredTradePlans = useMemo(() => {
    if (!searchQuery.trim()) return tradePlans;
    const q = searchQuery.toLowerCase();
    return tradePlans.filter((p) => p.event.toLowerCase().includes(q));
  }, [tradePlans, searchQuery]);

  // Refresh when sport/date changes
  useEffect(() => {
    refresh();
  }, [sport, date, refresh]);

  // Toast on new opportunities
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
