import { useMemo, useEffect } from 'react';
import { useMarkets } from '@/contexts/MarketsContext';
import { findMatchingMarkets, findArbitrageOpportunities } from '@/lib/arbitrage-matcher';
import { CrossPlatformMatch, ArbitrageOpportunity, UnifiedMarket } from '@/types/dome';
import { useArbitrageSettings } from './useArbitrageSettings';

export interface UseArbitrageResult {
  opportunities: ArbitrageOpportunity[];
  freshOpportunities: ArbitrageOpportunity[];
  staleCount: number; // Number of opportunities filtered out due to staleness
  lowProfitCount: number; // Number filtered out due to low profit
  matches: CrossPlatformMatch[];
  freshMatches: CrossPlatformMatch[]; // Matches with fresh prices
  staleMatches: CrossPlatformMatch[]; // Matches with stale prices
  matchesWithValidPrices: number; // Matches where both platforms have real prices
  matchesAwaitingPrices: number; // Matches missing prices
  isLoading: boolean;
  polymarketCount: number;
  kalshiCount: number;
  settings: ReturnType<typeof useArbitrageSettings>['settings'];
  updateSettings: ReturnType<typeof useArbitrageSettings>['updateSettings'];
}

/**
 * Check if a market has valid, fresh price data
 */
function hasValidPrices(market: UnifiedMarket): boolean {
  // Must have non-null YES and NO probabilities
  if (market.sideA.probability == null || market.sideB.probability == null) {
    return false;
  }
  // Must have a price update timestamp
  if (!market.lastPriceUpdatedAt) {
    return false;
  }
  return true;
}

/**
 * Check if a market's price is recent (within max age)
 */
function isFresh(market: UnifiedMarket, now: number, maxAgeSeconds: number): boolean {
  if (!market.lastPriceUpdatedAt) return false;
  const ageMs = now - market.lastPriceUpdatedAt.getTime();
  return ageMs <= maxAgeSeconds * 1000;
}

/**
 * Check if two markets have synchronized price updates (close in time)
 */
function areSynchronized(
  marketA: UnifiedMarket,
  marketB: UnifiedMarket,
  maxSkewSeconds: number
): boolean {
  if (!marketA.lastPriceUpdatedAt || !marketB.lastPriceUpdatedAt) {
    return false;
  }
  const skewMs = Math.abs(
    marketA.lastPriceUpdatedAt.getTime() - marketB.lastPriceUpdatedAt.getTime()
  );
  return skewMs <= maxSkewSeconds * 1000;
}

/**
 * Check if a match has fresh, synchronized price data
 */
function isMatchFresh(
  match: CrossPlatformMatch,
  now: number,
  maxAgeSeconds: number,
  maxSkewSeconds: number
): boolean {
  const { polymarket, kalshi } = match;
  
  if (!hasValidPrices(polymarket) || !hasValidPrices(kalshi)) {
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
 * Filter opportunities to only include those with fresh, synchronized price data
 */
function filterFreshOpportunities(
  opportunities: ArbitrageOpportunity[],
  maxAgeSeconds: number,
  maxSkewSeconds: number
): ArbitrageOpportunity[] {
  const now = Date.now();
  return opportunities.filter((opp) => isMatchFresh(opp.match, now, maxAgeSeconds, maxSkewSeconds));
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
    
    // Find matching markets
    const matches = findMatchingMarkets(polymarkets, kalshiMarkets);
    
    // Extract matched Polymarket IDs for priority fetching
    const matchedPolyIds = new Set(matches.map(m => m.polymarket.id));
    
    // Count matches with valid prices (not default/zero)
    const matchesWithValidPrices = matches.filter(m => {
      const polyHasRealPrice = m.polymarket.lastPriceUpdatedAt !== undefined;
      const kalshiYes = m.kalshi.sideA.probability;
      const kalshiHasRealPrice = kalshiYes > 0 && kalshiYes < 1;
      return polyHasRealPrice && kalshiHasRealPrice;
    }).length;
    const matchesAwaitingPrices = matches.length - matchesWithValidPrices;
    
    // Separate fresh and stale matches
    const freshMatches = matches.filter(m => 
      isMatchFresh(m, now, settings.maxAgeSeconds, settings.maxSkewSeconds)
    );
    const staleMatches = matches.filter(m => 
      !isMatchFresh(m, now, settings.maxAgeSeconds, settings.maxSkewSeconds)
    );
    
    // Find all arbitrage opportunities (unfiltered)
    const opportunities = findArbitrageOpportunities(matches);
    
    // Filter to only fresh opportunities
    const freshByTime = filterFreshOpportunities(
      opportunities,
      settings.maxAgeSeconds,
      settings.maxSkewSeconds
    );
    
    // Filter by profit threshold
    const freshOpportunities = filterByProfitThreshold(freshByTime, settings.minProfitPercent);
    const lowProfitCount = freshByTime.length - freshOpportunities.length;
    
    return {
      opportunities,
      freshOpportunities,
      staleCount: opportunities.length - freshByTime.length,
      lowProfitCount,
      matches,
      freshMatches,
      staleMatches,
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
    staleCount: result.staleCount,
    lowProfitCount: result.lowProfitCount,
    matches: result.matches,
    freshMatches: result.freshMatches,
    staleMatches: result.staleMatches,
    matchesWithValidPrices: result.matchesWithValidPrices,
    matchesAwaitingPrices: result.matchesAwaitingPrices,
    polymarketCount: result.polymarketCount,
    kalshiCount: result.kalshiCount,
    isLoading: isDiscovering || isPriceUpdating,
    settings,
    updateSettings,
  };
}