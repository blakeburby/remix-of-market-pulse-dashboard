import { useMemo } from 'react';
import { useMarkets } from '@/contexts/MarketsContext';
import { findMatchingMarkets, findArbitrageOpportunities } from '@/lib/arbitrage-matcher';
import { CrossPlatformMatch, ArbitrageOpportunity, UnifiedMarket } from '@/types/dome';

// Freshness configuration
const FRESHNESS_MAX_AGE_SECONDS = 30 * 60; // 30 minutes - max age for a price to be considered fresh
const FRESHNESS_MAX_SKEW_SECONDS = 30 * 60; // 30 minutes - max time difference between the two platforms

export interface UseArbitrageResult {
  opportunities: ArbitrageOpportunity[];
  freshOpportunities: ArbitrageOpportunity[];
  staleCount: number; // Number of opportunities filtered out due to staleness
  matches: CrossPlatformMatch[];
  isLoading: boolean;
  polymarketCount: number;
  kalshiCount: number;
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
 * Filter opportunities to only include those with fresh, synchronized price data
 */
function filterFreshOpportunities(
  opportunities: ArbitrageOpportunity[],
  maxAgeSeconds: number = FRESHNESS_MAX_AGE_SECONDS,
  maxSkewSeconds: number = FRESHNESS_MAX_SKEW_SECONDS
): ArbitrageOpportunity[] {
  const now = Date.now();

  return opportunities.filter((opp) => {
    const { polymarket, kalshi } = opp.match;

    // Both must have valid prices
    if (!hasValidPrices(polymarket) || !hasValidPrices(kalshi)) {
      return false;
    }

    // Both must be fresh
    if (!isFresh(polymarket, now, maxAgeSeconds) || !isFresh(kalshi, now, maxAgeSeconds)) {
      return false;
    }

    // Both must be synchronized (updated close in time)
    if (!areSynchronized(polymarket, kalshi, maxSkewSeconds)) {
      return false;
    }

    return true;
  });
}

export function useArbitrage(): UseArbitrageResult {
  const { markets, isDiscovering, isPriceUpdating } = useMarkets();
  
  const result = useMemo(() => {
    // Split markets by platform
    const polymarkets = markets.filter(m => m.platform === 'POLYMARKET');
    const kalshiMarkets = markets.filter(m => m.platform === 'KALSHI');
    
    // Find matching markets
    const matches = findMatchingMarkets(polymarkets, kalshiMarkets);
    
    // Find all arbitrage opportunities (unfiltered)
    const opportunities = findArbitrageOpportunities(matches);
    
    // Filter to only fresh opportunities
    const freshOpportunities = filterFreshOpportunities(opportunities);
    
    return {
      opportunities,
      freshOpportunities,
      staleCount: opportunities.length - freshOpportunities.length,
      matches,
      polymarketCount: polymarkets.length,
      kalshiCount: kalshiMarkets.length
    };
  }, [markets]);
  
  return {
    ...result,
    isLoading: isDiscovering || isPriceUpdating
  };
}