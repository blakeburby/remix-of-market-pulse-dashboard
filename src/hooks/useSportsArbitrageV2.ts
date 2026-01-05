import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { globalRateLimiter, RateLimiterStats } from '@/lib/rate-limiter';
import { DomeTier } from '@/types/dome';

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
    source: 'orderbook' | 'market_bid_ask' | 'market_last_price' | 'none';
    spread: number | null; // bid-ask spread in cents
  } | null;
  polymarketPrice: {
    yesAsk: number | null;
    noAsk: number | null;
    yesBid: number | null;
    noBid: number | null;
    depth: number | null; // dollars
    source: 'market-price' | 'orderbook' | 'none';
    spread: number | null; // bid-ask spread
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
  autoRefreshEnabled: boolean;
  autoRefreshIntervalSeconds: number;
  apiTier: DomeTier;
}

const DEFAULT_SETTINGS: Settings = {
  freshnessWindowSeconds: 30,
  minEdgePercent: 0.5,
  minLiquidityDollars: 100,
  slippageBuffer: 0.5,
  feesPercent: 2,
  autoRefreshEnabled: true,
  autoRefreshIntervalSeconds: 15,
  apiTier: 'dev',
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
  rateLimiterStats: RateLimiterStats;
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

  // Rate limiter stats with manual subscription (avoids useSyncExternalStore infinite loop)
  const [rateLimiterStats, setRateLimiterStats] = useState<RateLimiterStats>(() => globalRateLimiter.getStats());

  useEffect(() => {
    const unsubscribe = globalRateLimiter.subscribe(() => {
      setRateLimiterStats(globalRateLimiter.getStats());
    });
    return unsubscribe;
  }, []);

  const addDiagnostic = useCallback((entry: Omit<DiagnosticEntry, 'id' | 'timestamp'>) => {
    setDiagnostics((prev) => [
      { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now() },
      ...prev,
    ].slice(0, 100)); // keep max 100 entries
  }, []);

  const clearDiagnostics = useCallback(() => setDiagnostics([]), []);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updates };
      // Sync tier with rate limiter
      if (updates.apiTier && updates.apiTier !== prev.apiTier) {
        globalRateLimiter.setTier(updates.apiTier);
      }
      return newSettings;
    });
  }, []);

  // Sync tier on mount
  useEffect(() => {
    globalRateLimiter.setTier(settings.apiTier);
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

  // Helper to fetch with diagnostics and rate limiting
  const fetchWithDiagnostics = useCallback(
    async (
      url: string,
      type: DiagnosticEntry['type'],
      apiKey: string,
      ticker?: string
    ): Promise<{ resp: Response | null; json: any; error?: string; responseSnippet?: string }> => {
      // Wait for rate limiter before making request
      await globalRateLimiter.waitAndAcquire();
      
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

        // Handle 429 rate limit responses
        if (resp.status === 429) {
          const retryAfter = resp.headers.get('Retry-After');
          const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 10;
          globalRateLimiter.markRateLimited(isNaN(retrySeconds) ? 10 : retrySeconds);
          
          const text = await resp.text();
          responseSnippet = truncate(text, 300);
          
          addDiagnostic({
            type,
            url,
            status: 429,
            durationMs: Date.now() - startTime,
            ok: false,
            ticker,
            error: `Rate limited - retry after ${retrySeconds}s`,
            responseSnippet,
            parsedParams,
          });
          
          return { resp, json: null, error: `Rate limited`, responseSnippet };
        }

        if (resp.ok) {
          json = await resp.json();

          // If snapshots are empty, store a snippet so diagnostics are actionable.
          if (
            (type === 'kalshi-price' || type === 'kalshi-price-retry' || type === 'polymarket-orderbook') &&
            Array.isArray(json?.snapshots) &&
            json.snapshots.length === 0
          ) {
            responseSnippet = truncate(JSON.stringify(json), 300);
          }
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

  type KalshiQuoteSource = 'orderbook' | 'market_bid_ask' | 'market_last_price' | 'none';

  type KalshiQuote = {
    yesAsk: number | null; // prob (0-1)
    noAsk: number | null; // prob (0-1)
    yesBid: number | null; // prob (0-1)
    noBid: number | null; // prob (0-1)
    depth: number | null; // dollars
    updatedAt: number | null; // ms
    title: string | null;
    closeTimeMs: number | null;
    source: KalshiQuoteSource;
    error: string | null;
  };

  const asCents = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    // Probability (0-1)
    if (value > 0 && value <= 1) return value * 100;
    // Cents (0-100)
    if (value > 1 && value <= 100) return value;
    return null;
  };

  const centsToProb = (cents: number | null): number | null =>
    typeof cents === 'number' && Number.isFinite(cents) ? cents / 100 : null;

  const fetchKalshiOrderbookQuote = useCallback(
    async (
      marketTicker: string,
      startMs: number,
      endMs: number,
      apiKey: string,
      isRetry: boolean
    ): Promise<{ status: number | null; responseSnippet?: string; timestampMsError: boolean; quote: KalshiQuote | null; reason?: string }> => {
      const safeTicker = encodeURIComponent(marketTicker);
      const url = `https://api.domeapi.io/v1/kalshi/orderbooks?ticker=${safeTicker}&start_time=${toMs(startMs)}&end_time=${toMs(
        endMs
      )}&limit=1`;

      const { resp, json, responseSnippet } = await fetchWithDiagnostics(
        url,
        isRetry ? 'kalshi-price-retry' : 'kalshi-price',
        apiKey,
        marketTicker
      );

      const timestampMsError = !!responseSnippet?.includes('timestamp in milliseconds');

      if (!resp?.ok || !json) {
        return {
          status: resp?.status ?? null,
          responseSnippet,
          timestampMsError,
          quote: null,
          reason: resp ? `Orderbook HTTP ${resp.status}` : 'Orderbook network error',
        };
      }

      const snapshots = Array.isArray(json?.snapshots) ? json.snapshots : [];
      if (snapshots.length === 0) {
        return {
          status: resp.status,
          responseSnippet,
          timestampMsError,
          quote: null,
          reason: 'No orderbook snapshots',
        };
      }

      // Even with limit=1, stay defensive.
      const latest = (snapshots as any[]).reduce((best: any, s: any) => {
        const t = (typeof s?.timestamp === 'number' ? s.timestamp : null) ?? (typeof s?.ts === 'number' ? s.ts : null);
        if (best == null) return s;
        const bestT =
          (typeof best?.timestamp === 'number' ? best.timestamp : null) ?? (typeof best?.ts === 'number' ? best.ts : null);
        if (t == null) return best;
        if (bestT == null) return s;
        return t > bestT ? s : best;
      }, (snapshots as any[])[0]);

      const latestTsRaw =
        (typeof latest?.timestamp === 'number' ? latest.timestamp : null) ?? (typeof latest?.ts === 'number' ? latest.ts : null);
      const updatedAt = typeof latestTsRaw === 'number' ? toMs(latestTsRaw) : Date.now();

      const ob = latest?.orderbook ?? null;
      const yesRaw = Array.isArray(ob?.yes) ? ob.yes : [];
      const noRaw = Array.isArray(ob?.no) ? ob.no : [];

      // Accept both formats:
      // - Tuple: [[price, qty], ...]
      // - Object: [{ price, quantity }, ...]
      const parseOrders = (orders: any[]): Array<[number, number]> => {
        if (!Array.isArray(orders)) return [];
        return orders
          .map((o) => {
            if (Array.isArray(o)) return [o[0], o[1]] as [unknown, unknown];
            if (typeof o === 'object' && o !== null) return [o.price ?? o.priceCents, o.quantity ?? o.qty ?? o.size] as [unknown, unknown];
            return [null, null] as [unknown, unknown];
          })
          .map(([p, q]) => [asCents(p), typeof q === 'number' && Number.isFinite(q) ? q : 0] as const)
          .filter((x): x is [number, number] => typeof x[0] === 'number' && Number.isFinite(x[0]) && x[0] > 0);
      };

      const yesOrders = parseOrders(yesRaw);
      const noOrders = parseOrders(noRaw);

      const yesBidCents = yesOrders.length ? Math.max(...yesOrders.map((o) => o[0])) : null;
      const noBidCents = noOrders.length ? Math.max(...noOrders.map((o) => o[0])) : null;

      // Executable asks (conservative) are the complement of the opposite-side best bid.
      const yesAskCents = typeof noBidCents === 'number' ? 100 - noBidCents : null;
      const noAskCents = typeof yesBidCents === 'number' ? 100 - yesBidCents : null;

      const yesBidQty = typeof yesBidCents === 'number' ? (yesOrders.find((o) => o[0] === yesBidCents)?.[1] ?? 0) : 0;
      const noBidQty = typeof noBidCents === 'number' ? (noOrders.find((o) => o[0] === noBidCents)?.[1] ?? 0) : 0;
      const depth = yesBidQty > 0 && noBidQty > 0 ? Math.min(yesBidQty, noBidQty) / 100 : null;

      // If there are literally no bids on either side, treat as unusable.
      if (yesBidCents == null && noBidCents == null) {
        return {
          status: resp.status,
          responseSnippet,
          timestampMsError,
          quote: null,
          reason: 'No orderbook depth (no YES bids and no NO bids)',
        };
      }

      return {
        status: resp.status,
        responseSnippet,
        timestampMsError,
        quote: {
          yesAsk: centsToProb(yesAskCents),
          noAsk: centsToProb(noAskCents),
          yesBid: centsToProb(yesBidCents),
          noBid: centsToProb(noBidCents),
          depth,
          updatedAt,
          title: null,
          closeTimeMs: null,
          source: 'orderbook',
          error: null,
        },
      };
    },
    [fetchWithDiagnostics]
  );

  const fetchKalshiMarketFallback = useCallback(
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
    ): Promise<KalshiQuote> => {
      const info = marketInfo ?? (await fetchKalshiMarketInfo(marketTicker, apiKey));

      const yesBidCents = asCents(info?.yesBidCents ?? null);
      const noBidCents = asCents(info?.noBidCents ?? null);
      const yesAskCents = asCents(info?.yesAskCents ?? null) ?? (typeof noBidCents === 'number' ? 100 - noBidCents : null);
      const noAskCents = asCents(info?.noAskCents ?? null) ?? (typeof yesBidCents === 'number' ? 100 - yesBidCents : null);

      const hasAnyBidAsk = [yesBidCents, noBidCents, yesAskCents, noAskCents].some((x) => typeof x === 'number');

      if (hasAnyBidAsk) {
        return {
          yesAsk: centsToProb(yesAskCents),
          noAsk: centsToProb(noAskCents),
          yesBid: centsToProb(yesBidCents),
          noBid: centsToProb(noBidCents),
          depth: 0,
          updatedAt: Date.now(),
          title: info?.title ?? null,
          closeTimeMs: info?.closeTimeMs ?? null,
          source: 'market_bid_ask',
          error: null,
        };
      }

      const lastCents = typeof info?.lastPriceCents === 'number' ? info.lastPriceCents : null;
      if (typeof lastCents === 'number' && lastCents > 0) {
        const yesProb = lastCents / 100;
        const noProb = 1 - yesProb;
        return {
          yesAsk: yesProb,
          noAsk: noProb,
          yesBid: yesProb,
          noBid: noProb,
          depth: 0,
          updatedAt: Date.now(),
          title: info?.title ?? null,
          closeTimeMs: info?.closeTimeMs ?? null,
          source: 'market_last_price',
          error: null,
        };
      }

      const lastPriceDetail =
        lastCents === 0 ? 'last_price=0' : lastCents == null ? 'last_price missing' : `last_price=${lastCents}`;

      return {
        yesAsk: null,
        noAsk: null,
        yesBid: null,
        noBid: null,
        depth: null,
        updatedAt: null,
        title: info?.title ?? null,
        closeTimeMs: info?.closeTimeMs ?? null,
        source: 'none',
        error: `No liquidity (no market bid/ask; ${lastPriceDetail})`,
      };
    },
    [fetchKalshiMarketInfo]
  );

  const getKalshiQuoteForTicker = useCallback(
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
    ): Promise<KalshiQuote> => {
      const nowMs = toMs(Date.now());
      const startMs = toMs(nowMs - 24 * 60 * 60 * 1000);

      let orderbookReason: string | null = null;

      const first = await fetchKalshiOrderbookQuote(marketTicker, startMs, nowMs, apiKey, false);
      let orderbook = first;

      if (orderbook.status === 400 && orderbook.timestampMsError) {
        const forcedNow = toMs(Date.now());
        const forcedStart = toMs(forcedNow - 24 * 60 * 60 * 1000);
        orderbook = await fetchKalshiOrderbookQuote(marketTicker, forcedStart, forcedNow, apiKey, true);
      }

      if (orderbook.quote) {
        const base = orderbook.quote;
        const info = marketInfo ?? (await fetchKalshiMarketInfo(marketTicker, apiKey));
        return {
          ...base,
          title: info?.title ?? null,
          closeTimeMs: info?.closeTimeMs ?? null,
        };
      }

      orderbookReason = orderbook.reason ?? (orderbook.status ? `Orderbook HTTP ${orderbook.status}` : 'Orderbook failed');

      const fallback = await fetchKalshiMarketFallback(marketTicker, apiKey, marketInfo);
      if (fallback.source !== 'none') return fallback;

      // If both paths failed, include the orderbook reason too.
      return {
        ...fallback,
        error: `${orderbookReason}; ${fallback.error ?? 'No liquidity'}`,
      };
    },
    [fetchKalshiOrderbookQuote, fetchKalshiMarketFallback, fetchKalshiMarketInfo]
  );

  // Fetch Polymarket prices with orderbook fallback - improved to get bid/ask spread
  const fetchPolymarketPrices = useCallback(
    async (tokenIds: string[], apiKey: string) => {
      if (tokenIds.length < 2) return { 
        yesAsk: null, noAsk: null, yesBid: null, noBid: null, 
        depth: null, updatedAt: null, error: 'Less than 2 token IDs',
        source: 'none' as const, spread: null
      };

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
      let source: 'market-price' | 'orderbook' | 'none' = 'market-price';
      
      // Try to get bids from orderbook for spread calculation
      let aBid: number | null = null;
      let bBid: number | null = null;

      // Fallback to orderbook if market-price fails
      if (aPrice === null || bPrice === null) {
        source = 'orderbook';
        const nowMs = toMs(Date.now());
        const startMs = toMs(nowMs - 60 * 60 * 1000);

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
        if (obResA?.resp?.ok && obResA.json) {
          const snapshots = Array.isArray(obResA.json?.snapshots) ? obResA.json.snapshots : [];
          if (snapshots.length > 0) {
            const latest = snapshots[snapshots.length - 1];
            const asks = Array.isArray(latest?.orderbook?.asks) ? latest.orderbook.asks : [];
            const bids = Array.isArray(latest?.orderbook?.bids) ? latest.orderbook.bids : [];
            if (asks.length > 0 && aPrice === null) {
              aPrice = Math.min(...asks.map((a: any) => a.price ?? a[0] ?? Infinity));
              if (!Number.isFinite(aPrice)) aPrice = null;
            }
            if (bids.length > 0) {
              aBid = Math.max(...bids.map((b: any) => b.price ?? b[0] ?? 0));
              if (!Number.isFinite(aBid) || aBid <= 0) aBid = null;
            }
          }
        }

        // Parse orderbook for B
        if (obResB?.resp?.ok && obResB.json) {
          const snapshots = Array.isArray(obResB.json?.snapshots) ? obResB.json.snapshots : [];
          if (snapshots.length > 0) {
            const latest = snapshots[snapshots.length - 1];
            const asks = Array.isArray(latest?.orderbook?.asks) ? latest.orderbook.asks : [];
            const bids = Array.isArray(latest?.orderbook?.bids) ? latest.orderbook.bids : [];
            if (asks.length > 0 && bPrice === null) {
              bPrice = Math.min(...asks.map((a: any) => a.price ?? a[0] ?? Infinity));
              if (!Number.isFinite(bPrice)) bPrice = null;
            }
            if (bids.length > 0) {
              bBid = Math.max(...bids.map((b: any) => b.price ?? b[0] ?? 0));
              if (!Number.isFinite(bBid) || bBid <= 0) bBid = null;
            }
          }
        }

        if (aPrice === null || bPrice === null) {
          errorMsg = `Token ${aPrice === null ? tokenIds[0] : tokenIds[1]}: No market-price or orderbook`;
          source = 'none';
        }
      }

      // Calculate spread if we have both bid and ask
      const spread = (aPrice !== null && aBid !== null) 
        ? Math.round((aPrice - aBid) * 100) // in cents
        : null;

      return {
        yesAsk: aPrice,
        noAsk: bPrice,
        yesBid: aBid,
        noBid: bBid,
        depth: 1000, // default estimate
        updatedAt,
        error: errorMsg,
        source,
        spread,
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
              getKalshiQuoteForTicker(tickerA, apiKey, infoA),
              getKalshiQuoteForTicker(tickerB, apiKey, infoB),
              fetchPolymarketPrices(market.polymarket.token_ids, apiKey),
            ]);

            const title = infoA?.title ?? kA?.title ?? market.title;
            const teams = title ? parseTeamsFromTitle(title) : null;

            // For Kalshi sports winner markets, each team has its own market ticker:
            // - outcome A price ~= YES on tickerA
            // - outcome B price ~= YES on tickerB (or NO on tickerA)
            const aAsk = kA.yesAsk;
            const bAsk = kB.yesAsk ?? kA.noAsk;

            const aBid = kA.yesBid;
            const bBid = kB.yesBid ?? kA.noBid;

            // Compute spread for Kalshi
            const kalshiSpread = (aAsk !== null && aBid !== null) 
              ? Math.round((aAsk - aBid) * 100) // cents
              : null;

            const kalshiPrice = {
              yesAsk: aAsk,
              noAsk: bAsk,
              yesBid: aBid,
              noBid: bBid,
              depth:
                typeof kA.depth === 'number' && typeof kB.depth === 'number'
                  ? Math.min(kA.depth, kB.depth)
                  : (kA.depth ?? kB.depth ?? null),
              source: kA.source,
              spread: kalshiSpread,
            };

            const polymarketPrice = {
              yesAsk: polyRes.yesAsk,
              noAsk: polyRes.noAsk,
              yesBid: polyRes.yesBid ?? null,
              noBid: polyRes.noBid ?? null,
              depth: polyRes.depth,
              source: polyRes.source,
              spread: polyRes.spread ?? null,
            };

            const kalshiReasonForYesAsk = () => {
              if (kA.source === 'none') return kA.error ?? 'No liquidity';
              if (kA.source === 'orderbook' && kA.yesAsk == null) return 'No NO bids (cannot derive YES ask)';
              if (kA.source === 'market_bid_ask' && kA.yesAsk == null) return 'No market YES ask';
              return 'No Kalshi YES ask';
            };

            const kalshiReasonForBAask = () => {
              // Prefer B ticker first; if we fell back to kA.noAsk, explain that.
              if (kB.yesAsk != null) return null;
              if (kB.source === 'none') return kB.error ?? 'No liquidity';
              if (kB.source === 'orderbook' && kB.yesAsk == null) return 'No NO bids (cannot derive YES ask)';
              if (kB.source === 'market_bid_ask' && kB.yesAsk == null) return 'No market YES ask';
              if (kA.noAsk == null) {
                if (kA.source === 'none') return kA.error ?? 'No liquidity';
                if (kA.source === 'orderbook') return 'No YES bids (cannot derive NO ask)';
                return 'No Kalshi NO ask';
              }
              return 'Using NO ask from outcome A (B ticker missing YES ask)';
            };

            let kalshiError: string | null = null;
            if (aAsk === null || bAsk === null) {
              const parts: string[] = [];
              if (aAsk === null) parts.push(`A(${tickerA}): ${kalshiReasonForYesAsk()}`);
              if (bAsk === null) parts.push(`B(${tickerB}): ${kalshiReasonForBAask() ?? 'No quote'}`);
              kalshiError = parts.join(' | ');
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
    [getApiKey, getKalshiQuoteForTicker, fetchPolymarketPrices, fetchKalshiMarketInfo]
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

  // Auto-refresh loop (runs continuously when enabled)
  useEffect(() => {
    if (!settings.autoRefreshEnabled) return;
    if (settings.autoRefreshIntervalSeconds < 2) return; // lower floor for continuous mode

    const intervalId = setInterval(() => {
      // Only refresh if not already loading and not rate limited
      if (!isLoading && !isFetchingPrices && !globalRateLimiter.isRateLimited()) {
        refresh();
      }
    }, settings.autoRefreshIntervalSeconds * 1000);

    return () => clearInterval(intervalId);
  }, [settings.autoRefreshEnabled, settings.autoRefreshIntervalSeconds, refresh, isLoading, isFetchingPrices]);

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
    rateLimiterStats,
  };
}
