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

export interface DiagnosticEntry {
  id: string;
  timestamp: number;
  type: 'matching-markets' | 'kalshi-price' | 'kalshi-price-retry' | 'kalshi-market' | 'polymarket-price' | 'polymarket-orderbook';
  url: string;
  status: number | null;
  durationMs: number;
  ok: boolean;
  error?: string;
  responseSnippet?: string;
  /** Market ticker for per-market calls */
  ticker?: string;
  /** Parsed query params for debugging */
  parsedParams?: {
    start_time?: number;
    end_time?: number;
    start_time_unit?: 'seconds' | 'milliseconds';
    end_time_unit?: 'seconds' | 'milliseconds';
  };
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
  diagnostics: DiagnosticEntry[];
  clearDiagnostics: () => void;
}

function parseTeamsFromTitle(title: string): { a: string; b: string } | null {
  // Examples: "Atlanta vs Toronto Winner?", "Arizona at Los Angeles Winner?", "Arizona @ Los Angeles Winner?"
  const vsMatch = title.match(/^(.+?)\s+vs\.?\s+(.+?)\s+Winner\?/i);
  if (vsMatch) {
    const a = vsMatch[1].trim();
    const b = vsMatch[2].trim();
    if (a && b) return { a, b };
  }

  const atMatch = title.match(/^(.+?)\s+(?:at|@)\s+(.+?)\s+Winner\?/i);
  if (atMatch) {
    const a = atMatch[1].trim();
    const b = atMatch[2].trim();
    if (a && b) return { a, b };
  }

  return null;
}

function msFromSeconds(seconds: unknown): number | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  return seconds * 1000;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}

/**
 * Normalize any timestamp to milliseconds.
 * - If < 1e12, treat as seconds → multiply by 1000
 * - If > 1e14, treat as microseconds → divide by 1000
 * - Else treat as milliseconds
 */
function toMs(ts: number): number {
  if (ts < 1e12) return Math.floor(ts * 1000);
  if (ts > 1e14) return Math.floor(ts / 1000);
  return Math.floor(ts);
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
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);

  const addDiagnostic = useCallback((entry: Omit<DiagnosticEntry, 'id' | 'timestamp'>) => {
    setDiagnostics((prev) => [
      { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now() },
      ...prev,
    ].slice(0, 100)); // keep max 100 entries
  }, []);

  const clearDiagnostics = useCallback(() => setDiagnostics([]), []);

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

  // Helper to parse timestamp params from URL for diagnostics
  const parseTimestampParams = (url: string): DiagnosticEntry['parsedParams'] => {
    try {
      const urlObj = new URL(url);
      const startTime = urlObj.searchParams.get('start_time');
      const endTime = urlObj.searchParams.get('end_time');
      
      const result: DiagnosticEntry['parsedParams'] = {};
      
      if (startTime) {
        const num = parseInt(startTime, 10);
        result.start_time = num;
        result.start_time_unit = num < 1e12 ? 'seconds' : 'milliseconds';
      }
      if (endTime) {
        const num = parseInt(endTime, 10);
        result.end_time = num;
        result.end_time_unit = num < 1e12 ? 'seconds' : 'milliseconds';
      }
      
      return Object.keys(result).length > 0 ? result : undefined;
    } catch {
      return undefined;
    }
  };

  // Helper to fetch with diagnostics
  const fetchWithDiagnostics = useCallback(
    async (
      url: string,
      type: DiagnosticEntry['type'],
      apiKey: string,
      ticker?: string
    ): Promise<{ resp: Response | null; json: any; error?: string; responseSnippet?: string }> => {
      const startTime = Date.now();
      const parsedParams = parseTimestampParams(url);
      
      try {
        const resp = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        let json: any = null;
        let responseSnippet: string | undefined;

        if (resp.ok) {
          json = await resp.json();
        } else {
          const text = await resp.text();
          responseSnippet = truncate(text, 300);
        }

        addDiagnostic({
          type,
          url,
          status: resp.status,
          durationMs: Date.now() - startTime,
          ok: resp.ok,
          ticker,
          error: resp.ok ? undefined : `HTTP ${resp.status}`,
          responseSnippet,
          parsedParams,
        });

        return { resp, json, responseSnippet };
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
        addDiagnostic({
          type,
          url,
          status: null,
          durationMs: Date.now() - startTime,
          ok: false,
          ticker,
          error: errMsg,
          parsedParams,
        });
        return { resp: null, json: null, error: errMsg };
      }
    },
    [addDiagnostic]
  );

  // Fetch Kalshi market info (title, last_price, close_time, and best-effort bid/ask)
  const fetchKalshiMarketInfo = useCallback(
    async (marketTicker: string, apiKey: string) => {
      const safeTicker = encodeURIComponent(marketTicker);
      const url = `https://api.domeapi.io/v1/kalshi/markets?market_ticker=${safeTicker}&limit=1`;
      const { resp, json } = await fetchWithDiagnostics(url, 'kalshi-market', apiKey, marketTicker);

      if (!resp?.ok || !json) return null;

      const mkts = Array.isArray(json?.markets) ? json.markets : [];
      const m = mkts.find((x: any) => x?.market_ticker === marketTicker) ?? mkts[0];
      if (!m) return null;

      const yesBidCents = (typeof m.yes_bid === 'number' ? m.yes_bid : (typeof m.yesBid === 'number' ? m.yesBid : null)) as
        | number
        | null;
      const yesAskCents = (typeof m.yes_ask === 'number' ? m.yes_ask : (typeof m.yesAsk === 'number' ? m.yesAsk : null)) as
        | number
        | null;
      const noBidCents = (typeof m.no_bid === 'number' ? m.no_bid : (typeof m.noBid === 'number' ? m.noBid : null)) as
        | number
        | null;
      const noAskCents = (typeof m.no_ask === 'number' ? m.no_ask : (typeof m.noAsk === 'number' ? m.noAsk : null)) as
        | number
        | null;

      return {
        title: typeof m.title === 'string' ? m.title : null,
        closeTimeMs: msFromSeconds(m.close_time ?? m.closeTime ?? m.end_time ?? m.endTime),
        lastPriceCents: typeof m.last_price === 'number' ? m.last_price : null,
        yesBidCents,
        yesAskCents,
        noBidCents,
        noAskCents,
      };
    },
    [fetchWithDiagnostics]
  );

  // Fetch Kalshi orderbook with retry logic and fallback to market bid/ask
  const fetchKalshiPrices = useCallback(
    async (
      marketTicker: string,
      apiKey: string,
      marketInfo?: {
        title: string | null;
        closeTimeMs: number | null;
        lastPriceCents: number | null;
        yesBidCents?: number | null;
        yesAskCents?: number | null;
        noBidCents?: number | null;
        noAskCents?: number | null;
      } | null
    ) => {
      const safeTicker = encodeURIComponent(marketTicker);
      const nowMs = toMs(Date.now());
      const startMs = toMs(nowMs - 30 * 24 * 60 * 60 * 1000); // last 30 days, normalized

      // Helper to attempt orderbook fetch
      const attemptOrderbook = async (
        start: number,
        end: number,
        isRetry: boolean
      ): Promise<{ resp: Response | null; json: any; responseSnippet?: string }> => {
        const url = `https://api.domeapi.io/v1/kalshi/orderbooks?ticker=${safeTicker}&start_time=${start}&end_time=${end}&limit=20`;
        return fetchWithDiagnostics(
          url,
          isRetry ? 'kalshi-price-retry' : 'kalshi-price',
          apiKey,
          marketTicker
        );
      };

      // First attempt with normalized ms timestamps
      let { resp, json, responseSnippet } = await attemptOrderbook(startMs, nowMs, false);

      // Retry if we got a 400 with timestamp error message
      if (resp?.status === 400 && responseSnippet?.includes('timestamp in milliseconds')) {
        // Force ensure milliseconds (double-check normalization)
        const forcedNowMs = toMs(Date.now());
        const forcedStartMs = toMs(forcedNowMs - 30 * 24 * 60 * 60 * 1000);
        const retryResult = await attemptOrderbook(forcedStartMs, forcedNowMs, true);
        resp = retryResult.resp;
        json = retryResult.json;
        responseSnippet = retryResult.responseSnippet;
      }

      // Helper to use market info as fallback
      const useMarketFallback = async (reason: string) => {
        const info = marketInfo ?? (await fetchKalshiMarketInfo(marketTicker, apiKey));

        const yesBid =
          typeof info?.yesBidCents === 'number' && info.yesBidCents > 0 ? info.yesBidCents / 100 : null;
        const yesAsk =
          typeof info?.yesAskCents === 'number' && info.yesAskCents > 0 ? info.yesAskCents / 100 : null;
        const noBid =
          typeof info?.noBidCents === 'number' && info.noBidCents > 0 ? info.noBidCents / 100 : null;
        const noAsk =
          typeof info?.noAskCents === 'number' && info.noAskCents > 0 ? info.noAskCents / 100 : null;

        const derivedYesAsk = yesAsk ?? (noBid !== null ? 1 - noBid : null);
        const derivedNoAsk = noAsk ?? (yesBid !== null ? 1 - yesBid : null);

        if (derivedYesAsk !== null || derivedNoAsk !== null || yesBid !== null || noBid !== null) {
          return {
            yesAsk: derivedYesAsk,
            noAsk: derivedNoAsk,
            yesBid,
            noBid,
            depth: 0,
            updatedAt: Date.now(),
            title: info?.title ?? null,
            closeTimeMs: info?.closeTimeMs ?? null,
            error: `${reason} - using market bid/ask`,
          };
        }

        if (info?.lastPriceCents != null && info.lastPriceCents > 0) {
          const yesMid = info.lastPriceCents / 100;
          const noMid = 1 - yesMid;
          return {
            yesAsk: yesMid,
            noAsk: noMid,
            yesBid: yesMid,
            noBid: noMid,
            depth: 0,
            updatedAt: Date.now(),
            title: info?.title ?? null,
            closeTimeMs: info?.closeTimeMs ?? null,
            error: `${reason} - using last_price`,
          };
        }

        return {
          yesAsk: null,
          noAsk: null,
          yesBid: null,
          noBid: null,
          depth: null,
          updatedAt: null,
          error: `${reason} - no market bid/ask or last_price`,
        };
      };

      // If orderbook request failed, try market fallback
      if (!resp?.ok || !json) {
        return useMarketFallback(responseSnippet || 'Orderbook request failed');
      }

      const snapshots = Array.isArray(json?.snapshots) ? json.snapshots : [];

      if (snapshots.length === 0) {
        return useMarketFallback('No orderbook snapshots');
      }

      // Find latest snapshot
      const latest = (snapshots as any[]).reduce((best: any, s: any) => {
        const t =
          (typeof s?.timestamp === 'number' ? s.timestamp : null) ??
          (typeof s?.ts === 'number' ? s.ts : null);
        if (best == null) return s;

        const bestT =
          (typeof best?.timestamp === 'number' ? best.timestamp : null) ??
          (typeof best?.ts === 'number' ? best.ts : null);

        if (t == null) return best;
        if (bestT == null) return s;
        return t > bestT ? s : best;
      }, (snapshots as any[])[0]);

      const latestTsRaw =
        (typeof latest?.timestamp === 'number' ? latest.timestamp : null) ??
        (typeof latest?.ts === 'number' ? latest.ts : null);

      const latestTsMs = typeof latestTsRaw === 'number' ? toMs(latestTsRaw) : Date.now();

      const orderbook = latest?.orderbook;

      // Parse orderbook - handle both tuple [price, qty] and object { price, quantity } formats
      const parseOrders = (orders: any[]): Array<[number, number]> => {
        if (!Array.isArray(orders)) return [];
        return orders.map((o) => {
          if (Array.isArray(o)) return [o[0], o[1]] as [number, number];
          if (typeof o === 'object' && o !== null) {
            const price = o.price ?? o.priceCents ?? 0;
            const qty = o.quantity ?? o.qty ?? o.size ?? 0;
            return [price, qty] as [number, number];
          }
          return [0, 0] as [number, number];
        });
      };

      const yesOrders = parseOrders(orderbook?.yes);
      const noOrders = parseOrders(orderbook?.no);

      let yesBidCents = yesOrders.length ? Math.max(...yesOrders.map((o) => o[0])) : null;
      let noBidCents = noOrders.length ? Math.max(...noOrders.map((o) => o[0])) : null;

      // Sanity check: if price looks like dollars (0 < p < 1), convert to cents
      if (yesBidCents !== null && yesBidCents > 0 && yesBidCents < 1) {
        yesBidCents = yesBidCents * 100;
      }
      if (noBidCents !== null && noBidCents > 0 && noBidCents < 1) {
        noBidCents = noBidCents * 100;
      }

      // Best executable YES/NO ask derived from opposite side best bid (complement pricing)
      const yesAskCents = typeof noBidCents === 'number' ? 100 - noBidCents : null;
      const noAskCents = typeof yesBidCents === 'number' ? 100 - yesBidCents : null;

      const yesBidQty =
        typeof yesBidCents === 'number' ? (yesOrders.find((o) => o[0] === yesBidCents)?.[1] ?? 0) : 0;
      const noBidQty =
        typeof noBidCents === 'number' ? (noOrders.find((o) => o[0] === noBidCents)?.[1] ?? 0) : 0;

      const depthDollars = Math.min(yesBidQty, noBidQty) / 100;

      return {
        yesBid: typeof yesBidCents === 'number' ? yesBidCents / 100 : null,
        noBid: typeof noBidCents === 'number' ? noBidCents / 100 : null,
        yesAsk: typeof yesAskCents === 'number' ? yesAskCents / 100 : null,
        noAsk: typeof noAskCents === 'number' ? noAskCents / 100 : null,
        depth: Number.isFinite(depthDollars) ? depthDollars : null,
        updatedAt: latestTsMs,
        error: null,
      };
    },
    [fetchWithDiagnostics, fetchKalshiMarketInfo]
  );

  // Fetch Polymarket prices with orderbook fallback
  const fetchPolymarketPrices = useCallback(
    async (tokenIds: string[], apiKey: string) => {
      if (tokenIds.length < 2) return { yesAsk: null, noAsk: null, depth: null, updatedAt: null, error: 'Less than 2 token IDs' };

      const urlA = `https://api.domeapi.io/v1/polymarket/market-price/${tokenIds[0]}`;
      const urlB = `https://api.domeapi.io/v1/polymarket/market-price/${tokenIds[1]}`;

      const [resA, resB] = await Promise.all([
        fetchWithDiagnostics(urlA, 'polymarket-price', apiKey, tokenIds[0]),
        fetchWithDiagnostics(urlB, 'polymarket-price', apiKey, tokenIds[1]),
      ]);

      let aPrice: number | null = resA.resp?.ok ? resA.json?.price ?? null : null;
      let bPrice: number | null = resB.resp?.ok ? resB.json?.price ?? null : null;
      let updatedAt = msFromSeconds(resA.json?.at_time) ?? msFromSeconds(resB.json?.at_time) ?? Date.now();
      let errorMsg: string | null = null;

      // Fallback to orderbook if market-price fails
      if (aPrice === null || bPrice === null) {
        const nowMs = Date.now();
        const startMs = nowMs - 60 * 60 * 1000;

        const orderbookPromises = [];
        if (aPrice === null) {
          const obUrlA = `https://api.domeapi.io/v1/polymarket/orderbooks?token_id=${tokenIds[0]}&start_time=${startMs}&end_time=${nowMs}&limit=1`;
          orderbookPromises.push(fetchWithDiagnostics(obUrlA, 'polymarket-orderbook', apiKey, tokenIds[0]));
        } else {
          orderbookPromises.push(Promise.resolve(null));
        }

        if (bPrice === null) {
          const obUrlB = `https://api.domeapi.io/v1/polymarket/orderbooks?token_id=${tokenIds[1]}&start_time=${startMs}&end_time=${nowMs}&limit=1`;
          orderbookPromises.push(fetchWithDiagnostics(obUrlB, 'polymarket-orderbook', apiKey, tokenIds[1]));
        } else {
          orderbookPromises.push(Promise.resolve(null));
        }

        const [obResA, obResB] = await Promise.all(orderbookPromises);

        // Parse orderbook for A
        if (aPrice === null && obResA?.resp?.ok && obResA.json) {
          const snapshots = Array.isArray(obResA.json?.snapshots) ? obResA.json.snapshots : [];
          if (snapshots.length > 0) {
            const latest = snapshots[snapshots.length - 1];
            const asks = Array.isArray(latest?.orderbook?.asks) ? latest.orderbook.asks : [];
            if (asks.length > 0) {
              aPrice = Math.min(...asks.map((a: any) => a.price ?? a[0] ?? Infinity));
              if (!Number.isFinite(aPrice)) aPrice = null;
            }
          }
        }

        // Parse orderbook for B
        if (bPrice === null && obResB?.resp?.ok && obResB.json) {
          const snapshots = Array.isArray(obResB.json?.snapshots) ? obResB.json.snapshots : [];
          if (snapshots.length > 0) {
            const latest = snapshots[snapshots.length - 1];
            const asks = Array.isArray(latest?.orderbook?.asks) ? latest.orderbook.asks : [];
            if (asks.length > 0) {
              bPrice = Math.min(...asks.map((a: any) => a.price ?? a[0] ?? Infinity));
              if (!Number.isFinite(bPrice)) bPrice = null;
            }
          }
        }

        if (aPrice === null || bPrice === null) {
          errorMsg = `Token ${aPrice === null ? tokenIds[0] : tokenIds[1]}: No market-price or orderbook`;
        }
      }

      return {
        yesAsk: aPrice,
        noAsk: bPrice,
        depth: 1000, // default estimate
        updatedAt,
        error: errorMsg,
      };
    },
    [fetchWithDiagnostics]
  );

  const fetchMatchingMarkets = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('No API key available');
      return [] as MatchedMarket[];
    }

    const dateStr = format(date, 'yyyy-MM-dd');
    const url = `https://api.domeapi.io/v1/matching-markets/sports/${sport}?date=${dateStr}`;

    console.info('[SportsV2] Fetch matching markets', { sport, date: dateStr });

    const { resp, json, error: errMsg, responseSnippet } = await fetchWithDiagnostics(url, 'matching-markets', apiKey);

    if (!resp) {
      setError(errMsg || 'Network error');
      return [];
    }

    if (resp.status === 404) {
      setError(`No sports contracts found for ${dateStr}. Try a different date.`);
      return [];
    }

    if (!resp.ok) {
      setError(responseSnippet || `API error: HTTP ${resp.status}`);
      return [];
    }

    const marketsData = json?.markets || {};

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
  }, [getApiKey, sport, date, fetchWithDiagnostics]);

  const fetchPrices = useCallback(
    async (marketsToPrice: MatchedMarket[]): Promise<MatchedMarket[]> => {
      const apiKey = getApiKey();
      if (!apiKey) return marketsToPrice;

      setIsFetchingPrices(true);

      try {
        const results = await Promise.all(
          marketsToPrice.map(async (market) => {
            if (!market.polymarket) {
              return { ...market, pricesFetched: true, kalshiError: null, polymarketError: 'No match on Polymarket' };
            }

            const tickerA = market.kalshi.market_tickers[0] ?? null;
            const tickerB = market.kalshi.market_tickers[1] ?? null;

            if (!tickerA || !tickerB) {
              return {
                ...market,
                pricesFetched: true,
                kalshiError: 'Missing Kalshi outcome tickers',
                polymarketError: null,
              };
            }

            const [infoA, infoB] = await Promise.all([
              fetchKalshiMarketInfo(tickerA, apiKey),
              fetchKalshiMarketInfo(tickerB, apiKey),
            ]);

            const [kA, kB, polyRes] = await Promise.all([
              fetchKalshiPrices(tickerA, apiKey, infoA),
              fetchKalshiPrices(tickerB, apiKey, infoB),
              fetchPolymarketPrices(market.polymarket.token_ids, apiKey),
            ]);

            const title = infoA?.title ?? kA?.title ?? market.title;
            const teams = title ? parseTeamsFromTitle(title) : null;

            // For Kalshi sports winner markets, each team has its own market ticker:
            // - outcome A price ~= YES on tickerA
            // - outcome B price ~= YES on tickerB (or NO on tickerA)
            const aPrice = kA.yesAsk ?? kA.yesBid ?? null;
            const bPrice = kB.yesAsk ?? kB.yesBid ?? kA.noAsk ?? kA.noBid ?? null;

            const kalshiPrice = {
              yesAsk: aPrice,
              noAsk: bPrice,
              yesBid: kA.yesBid ?? null,
              noBid: kB.yesBid ?? null,
              depth:
                typeof kA.depth === 'number' && typeof kB.depth === 'number'
                  ? Math.min(kA.depth, kB.depth)
                  : (kA.depth ?? kB.depth ?? null),
            };

            const polymarketPrice = {
              yesAsk: polyRes.yesAsk,
              noAsk: polyRes.noAsk,
              depth: polyRes.depth,
            };

            let kalshiError: string | null = null;
            if (aPrice === null || bPrice === null) {
              const parts: string[] = [];
              if (aPrice === null) parts.push(`A(${tickerA}): ${kA.error ?? 'no quotes'}`);
              if (bPrice === null) parts.push(`B(${tickerB}): ${kB.error ?? 'no quotes'}`);
              kalshiError = parts.join(' | ');
            } else {
              const warns = [kA.error, kB.error].filter(
                (x): x is string => typeof x === 'string' && x.length > 0
              );
              kalshiError = warns.length ? warns.join(' | ') : null;
            }

            const polymarketError =
              polyRes.yesAsk === null || polyRes.noAsk === null
                ? polyRes.error || 'No Polymarket quotes'
                : null;

            return {
              ...market,
              title,
              outcomeA: teams?.a ?? null,
              outcomeB: teams?.b ?? null,
              expiresAt: infoA?.closeTimeMs ?? kA?.closeTimeMs ?? market.expiresAt,

              kalshiPrice,
              polymarketPrice,

              kalshiUpdatedAt: kA.updatedAt ?? kB.updatedAt,
              polymarketUpdatedAt: polyRes.updatedAt,

              pricesFetched: true,
              priceTimestamp: Date.now(),

              kalshiError,
              polymarketError,
            };
          })
        );

        return results;
      } finally {
        setIsFetchingPrices(false);
      }
    },
    [getApiKey, fetchKalshiPrices, fetchPolymarketPrices, fetchKalshiMarketInfo]
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
    diagnostics,
    clearDiagnostics,
  };
}
