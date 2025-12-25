import { useMemo } from 'react';
import { useMarkets } from '@/contexts/MarketsContext';
import { findMatchingMarkets, findArbitrageOpportunities } from '@/lib/arbitrage-matcher';
import { CrossPlatformMatch, ArbitrageOpportunity } from '@/types/dome';

export interface UseArbitrageResult {
  opportunities: ArbitrageOpportunity[];
  matches: CrossPlatformMatch[];
  isLoading: boolean;
  polymarketCount: number;
  kalshiCount: number;
}

export function useArbitrage(): UseArbitrageResult {
  const { markets, isDiscovering, isPriceUpdating } = useMarkets();
  
  const result = useMemo(() => {
    // Split markets by platform
    const polymarkets = markets.filter(m => m.platform === 'POLYMARKET');
    const kalshiMarkets = markets.filter(m => m.platform === 'KALSHI');
    
    // Find matching markets
    const matches = findMatchingMarkets(polymarkets, kalshiMarkets);
    
    // Find arbitrage opportunities
    const opportunities = findArbitrageOpportunities(matches);
    
    return {
      opportunities,
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
