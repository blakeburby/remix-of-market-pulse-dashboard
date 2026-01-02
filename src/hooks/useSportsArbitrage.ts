import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  SportType, 
  SportsMatchedMarket, 
  SportsArbitrageOpportunity 
} from '@/types/sports-arbitrage';
import { useArbitrageSettings } from '@/hooks/useArbitrageSettings';

interface UseSportsArbitrageResult {
  matches: SportsMatchedMarket[];
  opportunities: SportsArbitrageOpportunity[];
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  refresh: () => Promise<void>;
  sport: SportType;
  setSport: (sport: SportType) => void;
  settings: ReturnType<typeof useArbitrageSettings>['settings'];
  updateSettings: ReturnType<typeof useArbitrageSettings>['updateSettings'];
}

function calculateArbitrageOpportunities(
  matches: SportsMatchedMarket[],
  minProfitPercent: number
): SportsArbitrageOpportunity[] {
  const opportunities: SportsArbitrageOpportunity[] = [];

  for (const match of matches) {
    const polyYes = match.polymarket_yes_price;
    const polyNo = match.polymarket_no_price;
    const kalshiYes = match.kalshi_yes_price / 100; // Kalshi prices are in cents
    const kalshiNo = match.kalshi_no_price / 100;

    // Check both directions
    // Direction 1: Buy YES on Kalshi, buy NO on Polymarket
    const cost1 = kalshiYes + polyNo;
    if (cost1 < 1) {
      const profit = 1 - cost1;
      const profitPercent = (profit / cost1) * 100;
      if (profitPercent >= minProfitPercent) {
        opportunities.push({
          id: `${match.polymarket_market_slug}-${match.kalshi_market_ticker}-1`,
          match,
          buyYesOn: 'KALSHI',
          buyNoOn: 'POLYMARKET',
          yesPlatformPrice: kalshiYes,
          noPlatformPrice: polyNo,
          combinedCost: cost1,
          profitPercent,
          profitPerDollar: profit,
          expirationDate: new Date(Math.min(match.polymarket_end_time, match.kalshi_end_time) * 1000),
        });
      }
    }

    // Direction 2: Buy YES on Polymarket, buy NO on Kalshi
    const cost2 = polyYes + kalshiNo;
    if (cost2 < 1) {
      const profit = 1 - cost2;
      const profitPercent = (profit / cost2) * 100;
      if (profitPercent >= minProfitPercent) {
        opportunities.push({
          id: `${match.polymarket_market_slug}-${match.kalshi_market_ticker}-2`,
          match,
          buyYesOn: 'POLYMARKET',
          buyNoOn: 'KALSHI',
          yesPlatformPrice: polyYes,
          noPlatformPrice: kalshiNo,
          combinedCost: cost2,
          profitPercent,
          profitPerDollar: profit,
          expirationDate: new Date(Math.min(match.polymarket_end_time, match.kalshi_end_time) * 1000),
        });
      }
    }
  }

  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

export function useSportsArbitrage(): UseSportsArbitrageResult {
  const { getApiKey } = useAuth();
  const { settings, updateSettings } = useArbitrageSettings();
  const [sport, setSport] = useState<SportType>('cfb');
  const [matches, setMatches] = useState<SportsMatchedMarket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchMatches = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('No API key available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://api.domeapi.io/v1/matching-markets/sports/${sport}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limited. Please wait a moment and try again.');
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      setMatches(data.matches || []);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch matches');
    } finally {
      setIsLoading(false);
    }
  }, [getApiKey, sport]);

  // Fetch on mount and when sport changes
  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const opportunities = useMemo(
    () => calculateArbitrageOpportunities(matches, settings.minProfitPercent),
    [matches, settings.minProfitPercent]
  );

  return {
    matches,
    opportunities,
    isLoading,
    error,
    lastRefresh,
    refresh: fetchMatches,
    sport,
    setSport,
    settings,
    updateSettings,
  };
}
