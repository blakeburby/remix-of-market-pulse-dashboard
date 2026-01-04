import { useMemo, useEffect } from 'react';
import { useMarkets } from '@/contexts/MarketsContext';
import { findMatchingMarkets, findArbitrageOpportunities } from '@/lib/arbitrage-matcher';
import { CrossPlatformMatch, ArbitrageOpportunity, UnifiedMarket } from '@/types/dome';
import { useArbitrageSettings } from './useArbitrageSettings';

export interface UseArbitrageResult {
  opportunities: ArbitrageOpportunity[];
  freshOpportunities: ArbitrageOpportunity[];
  staleOpportunities: ArbitrageOpportunity[]; // Stale opportunities for display when toggle is on
  staleCount: number; // Number of opportunities filtered out due to staleness
  lowProfitCount: number; // Number filtered out due to low profit
  matches: CrossPlatformMatch[];
  freshMatches: CrossPlatformMatch[]; // Matches with fresh prices
  staleMatches: CrossPlatformMatch[]; // Matches with stale prices
  executableMatches: CrossPlatformMatch[]; // Matches that pass all gates (ready for arbitrage)
  matchesWithValidPrices: number; // Matches where both platforms have real prices
  matchesAwaitingPrices: number; // Matches missing prices
  isLoading: boolean;
  polymarketCount: number;
  kalshiCount: number;
  settings: ReturnType<typeof useArbitrageSettings>['settings'];
  updateSettings: ReturnType<typeof useArbitrageSettings>['updateSettings'];
}

/**
 * GATE 1: Check if a market has LIVE prices (explicitly fetched, not discovery data)
 * This is the first hard gate - prices must come from price API, not discovery
 */
function hasLivePrices(market: UnifiedMarket): boolean {
  // Must have explicit price update timestamp (not null)
  // null means we only discovered this market, never fetched its price
  if (market.lastPriceUpdatedAt === null) {
    return false;
  }
  // Must have non-null YES and NO probabilities
  if (market.sideA.probability === null || market.sideB.probability === null) {
    return false;
  }
  return true;
}

/**
 * GATE 2: Check if a market's price is recent (within max age)
 */
function isFresh(market: UnifiedMarket, now: number, maxAgeSeconds: number): boolean {
  if (!market.lastPriceUpdatedAt) return false;
  const ageMs = now - market.lastPriceUpdatedAt.getTime();
  return ageMs <= maxAgeSeconds * 1000;
}

/**
 * GATE 3: Check if two markets have synchronized price updates (within drift tolerance)
 * This ensures prices were fetched close in time for reliable arbitrage
 */
function areSynchronized(
  marketA: UnifiedMarket,
  marketB: UnifiedMarket,
  maxDriftSeconds: number
): boolean {
  if (!marketA.lastPriceUpdatedAt || !marketB.lastPriceUpdatedAt) {
    return false;
  }
  const driftMs = Math.abs(
    marketA.lastPriceUpdatedAt.getTime() - marketB.lastPriceUpdatedAt.getTime()
  );
  return driftMs <= maxDriftSeconds * 1000;
}

/**
 * HARD GATE: Check if a match is executable for arbitrage
 * ALL conditions must pass:
 * 1. Both markets have live prices (not just discovery data)
 * 2. Both prices are fresh (within maxAgeSeconds)
 * 3. Price timestamps are synchronized (within maxDriftSeconds)
 * 
 * If ANY check fails, NO arbitrage opportunity should be shown
 */
function isMatchExecutable(
  match: CrossPlatformMatch,
  now: number,
  maxAgeSeconds: number,
  maxDriftSeconds: number
): boolean {
  const { polymarket, kalshi } = match;
  
  // Gate 1: Both must have LIVE prices (not just discovery data)
  if (!hasLivePrices(polymarket) || !hasLivePrices(kalshi)) {
    return false;
  }
  
  // Gate 2: Both prices must be fresh (within max age)
  if (!isFresh(polymarket, now, maxAgeSeconds) || !isFresh(kalshi, now, maxAgeSeconds)) {
    return false;
  }
  
  // Gate 3: Timestamps must be synchronized (within max drift)
  if (!areSynchronized(polymarket, kalshi, maxDriftSeconds)) {
    return false;
  }
  
  return true;
}

/**
 * Legacy check for UI display purposes - less strict than isMatchExecutable
 */
function isMatchFresh(
  match: CrossPlatformMatch,
  now: number,
  maxAgeSeconds: number,
  maxSkewSeconds: number
): boolean {
  const { polymarket, kalshi } = match;
  
  if (!hasLivePrices(polymarket) || !hasLivePrices(kalshi)) {
    return false;
  }
  if (!isFresh(polymarket, now, maxAgeSeconds) || !isFresh(kalshi, now, maxAgeSeconds)) {
    return false;
  }
  if (!areSynchronized(polymarket, kalshi, maxSkewSeconds)) {
    return false;
  }
  return true;
}

/**
 * Filter out expired opportunities
 */
function filterExpired(opportunities: ArbitrageOpportunity[]): ArbitrageOpportunity[] {
  const now = new Date();
  return opportunities.filter(opp => opp.expirationDate > now);
}

/**
 * Filter opportunities by minimum profit threshold
 */
function filterByProfitThreshold(
  opportunities: ArbitrageOpportunity[],
  minProfitPercent: number
): ArbitrageOpportunity[] {
  return opportunities.filter(opp => opp.profitPercent >= minProfitPercent);
}

export function useArbitrage(): UseArbitrageResult {
  const { markets, isDiscovering, isPriceUpdating, setMatchedPolymarketIds } = useMarkets();
  const { settings, updateSettings } = useArbitrageSettings();
  
  const result = useMemo(() => {
    const now = Date.now();
    
    // Split markets by platform
    const polymarkets = markets.filter(m => m.platform === 'POLYMARKET');
    const kalshiMarkets = markets.filter(m => m.platform === 'KALSHI');
    
    // Find matching markets (based on title/event similarity)
    const matches = findMatchingMarkets(polymarkets, kalshiMarkets);
    
    // Extract matched Polymarket IDs for priority fetching
    const matchedPolyIds = new Set(matches.map(m => m.polymarket.id));
    
    // Count matches with valid prices (has lastPriceUpdatedAt)
    const matchesWithValidPrices = matches.filter(m => 
      hasLivePrices(m.polymarket) && hasLivePrices(m.kalshi)
    ).length;
    const matchesAwaitingPrices = matches.length - matchesWithValidPrices;
    
    // CRITICAL: Only include executable matches for arbitrage calculation
    // This is the hard gate that ensures arbitrage only appears if executable right now
    const executableMatches = matches.filter(m => 
      isMatchExecutable(m, now, settings.maxAgeSeconds, settings.maxDriftSeconds)
    );
    
    // Separate fresh and stale matches for UI display
    const freshMatches = matches.filter(m => 
      isMatchFresh(m, now, settings.maxAgeSeconds, settings.maxSkewSeconds)
    );
    const staleMatches = matches.filter(m => 
      !isMatchFresh(m, now, settings.maxAgeSeconds, settings.maxSkewSeconds)
    );
    
    // CRITICAL: Find arbitrage opportunities ONLY from executable matches
    // This ensures we only show opportunities that can be executed right now
    const allOpportunities = findArbitrageOpportunities(executableMatches);
    
    // Filter out expired opportunities
    const opportunities = filterExpired(allOpportunities);
    
    // Fresh opportunities = executable + meet profit threshold
    const freshOpportunities = filterByProfitThreshold(opportunities, settings.minProfitPercent);
    const lowProfitCount = opportunities.length - freshOpportunities.length;
    
    // Stale opportunities = opportunities from non-executable matches (for display when toggle is on)
    // Calculate from stale matches for UI purposes
    const staleMatchOpportunities = findArbitrageOpportunities(staleMatches);
    const staleOpportunities = filterByProfitThreshold(
      filterExpired(staleMatchOpportunities), 
      settings.minProfitPercent
    );
    
    return {
      opportunities,
      freshOpportunities,
      staleOpportunities,
      staleCount: staleOpportunities.length,
      lowProfitCount,
      matches,
      freshMatches,
      staleMatches,
      executableMatches,
      matchesWithValidPrices,
      matchesAwaitingPrices,
      polymarketCount: polymarkets.length,
      kalshiCount: kalshiMarkets.length,
      matchedPolyIds,
    };
  }, [markets, settings]);
  
  // Update matched Polymarket IDs for priority price fetching
  useEffect(() => {
    setMatchedPolymarketIds(result.matchedPolyIds);
  }, [result.matchedPolyIds, setMatchedPolymarketIds]);
  
  return {
    opportunities: result.opportunities,
    freshOpportunities: result.freshOpportunities,
    staleOpportunities: result.staleOpportunities,
    staleCount: result.staleCount,
    lowProfitCount: result.lowProfitCount,
    matches: result.matches,
    freshMatches: result.freshMatches,
    staleMatches: result.staleMatches,
    executableMatches: result.executableMatches,
    matchesWithValidPrices: result.matchesWithValidPrices,
    matchesAwaitingPrices: result.matchesAwaitingPrices,
    polymarketCount: result.polymarketCount,
    kalshiCount: result.kalshiCount,
    isLoading: isDiscovering || isPriceUpdating,
    settings,
    updateSettings,
  };
}
