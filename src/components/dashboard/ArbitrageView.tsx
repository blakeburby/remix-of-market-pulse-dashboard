import { useState, useMemo } from 'react';
import { useArbitrage } from '@/hooks/useArbitrage';
import { useMarkets } from '@/contexts/MarketsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArbitrageOpportunity, CrossPlatformMatch } from '@/types/dome';
import { formatCents, formatProfitPercent } from '@/lib/arbitrage-matcher';
import { ExternalLink, TrendingUp, AlertCircle, Target, Clock, Percent, RefreshCw, Zap, Timer, ArrowUpDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type SortOption = 'profit' | 'expiration' | 'freshness';

// Helper to format age in human-readable format
function formatAge(date: Date | undefined | null): string {
  if (!date) return 'never';
  const ageMs = Date.now() - date.getTime();
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// Helper to get freshness color class
function getFreshnessColor(date: Date | undefined | null, maxAgeSeconds: number): string {
  if (!date) return 'text-destructive';
  const ageSeconds = (Date.now() - date.getTime()) / 1000;
  if (ageSeconds <= maxAgeSeconds * 0.5) return 'text-green-600';
  if (ageSeconds <= maxAgeSeconds) return 'text-amber-600';
  return 'text-destructive';
}

// Freshness badge component
function FreshnessBadge({ 
  polymarket, 
  kalshi, 
  maxAgeSeconds 
}: { 
  polymarket: Date | undefined | null; 
  kalshi: Date | undefined | null;
  maxAgeSeconds: number;
}) {
  return (
    <div className="flex items-center gap-2 text-[10px] sm:text-xs">
      <div className="flex items-center gap-1">
        <Timer className="w-3 h-3 text-muted-foreground" />
        <span className={getFreshnessColor(polymarket, maxAgeSeconds)}>
          Poly: {formatAge(polymarket)}
        </span>
        <span className="text-muted-foreground">|</span>
        <span className={getFreshnessColor(kalshi, maxAgeSeconds)}>
          Kalshi: {formatAge(kalshi)}
        </span>
      </div>
    </div>
  );
}


function ArbitrageCard({ opportunity, maxAgeSeconds }: { opportunity: ArbitrageOpportunity; maxAgeSeconds: number }) {
  const { match, buyYesOn, buyNoOn, yesPlatformPrice, noPlatformPrice, combinedCost, profitPercent, profitPerDollar, expirationDate } = opportunity;
  
  const polymarketUrl = match.polymarket.marketSlug 
    ? `https://polymarket.com/event/${match.polymarket.eventSlug}` 
    : '#';
  const kalshiUrl = match.kalshi.kalshiEventTicker 
    ? `https://kalshi.com/markets/${match.kalshi.kalshiEventTicker}` 
    : '#';
  
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <Badge variant="default" className="bg-green-600 hover:bg-green-700">
              LOCKED ARBITRAGE
            </Badge>
          </div>
          <Badge variant="outline" className="text-green-600 border-green-600 font-bold text-lg">
            {formatProfitPercent(profitPercent)}
          </Badge>
        </div>
        <CardTitle className="text-base sm:text-lg leading-tight mt-2">
          {match.polymarket.title}
        </CardTitle>
        {/* Freshness Badge */}
        <FreshnessBadge 
          polymarket={match.polymarket.lastPriceUpdatedAt} 
          kalshi={match.kalshi.lastPriceUpdatedAt}
          maxAgeSeconds={maxAgeSeconds}
        />
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Trade Instructions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-xs text-muted-foreground mb-1">BUY YES on</p>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{buyYesOn === 'KALSHI' ? 'Kalshi' : 'Polymarket'}</span>
              <span className="text-lg font-bold text-primary">{formatCents(yesPlatformPrice)}</span>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-xs text-muted-foreground mb-1">BUY NO on</p>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{buyNoOn === 'KALSHI' ? 'Kalshi' : 'Polymarket'}</span>
              <span className="text-lg font-bold text-primary">{formatCents(noPlatformPrice)}</span>
            </div>
          </div>
        </div>
        
        {/* Profit Summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span>Cost: <strong>{formatCents(combinedCost)}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Percent className="w-4 h-4 text-muted-foreground" />
            <span>Payout: <strong>$1.00</strong></span>
          </div>
          <div className="flex items-center gap-1.5 text-green-600">
            <span>Profit: <strong>${profitPerDollar.toFixed(4)}</strong> per contract</span>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Expires {formatDistanceToNow(expirationDate, { addSuffix: true })}</span>
            </div>
            <div>
              Match: <span className="font-medium">{Math.round(match.matchScore * 100)}%</span>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={kalshiUrl} target="_blank" rel="noopener noreferrer">
                Kalshi <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={polymarketUrl} target="_blank" rel="noopener noreferrer">
                Polymarket <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MatchCard({ match, maxAgeSeconds }: { match: CrossPlatformMatch; maxAgeSeconds: number }) {
  const polyYes = match.polymarket.sideA.probability;
  const polyNo = match.polymarket.sideB.probability;
  const kalshiYes = match.kalshi.sideA.probability;
  const kalshiNo = match.kalshi.sideB.probability;
  
  // Calculate potential costs in both directions
  const cost1 = kalshiYes + polyNo; // Kalshi YES + Poly NO
  const cost2 = polyYes + kalshiNo; // Poly YES + Kalshi NO
  
  const hasArbitrage = cost1 < 1 || cost2 < 1;
  
  return (
    <Card className={hasArbitrage ? 'border-green-500/50' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <p className="font-medium text-sm line-clamp-2">{match.polymarket.title}</p>
          <Badge variant="secondary" className="shrink-0">
            {Math.round(match.matchScore * 100)}%
          </Badge>
        </div>
        
        {/* Freshness Badge */}
        <div className="mb-3">
          <FreshnessBadge 
            polymarket={match.polymarket.lastPriceUpdatedAt} 
            kalshi={match.kalshi.lastPriceUpdatedAt}
            maxAgeSeconds={maxAgeSeconds}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-muted-foreground mb-1">Polymarket</p>
            <p>YES: {formatCents(polyYes)} / NO: {formatCents(polyNo)}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Kalshi</p>
            <p>YES: {formatCents(kalshiYes)} / NO: {formatCents(kalshiNo)}</p>
          </div>
        </div>
        
        <div className="mt-3 pt-3 border-t text-xs">
          <div className="flex justify-between">
            <span>K-YES + P-NO:</span>
            <span className={cost1 < 1 ? 'text-green-600 font-bold' : ''}>{formatCents(cost1)}</span>
          </div>
          <div className="flex justify-between">
            <span>P-YES + K-NO:</span>
            <span className={cost2 < 1 ? 'text-green-600 font-bold' : ''}>{formatCents(cost2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ArbitrageView() {
  const { 
    freshOpportunities, 
    staleCount, 
    lowProfitCount,
    matches, 
    freshMatches,
    staleMatches,
    isLoading, 
    polymarketCount, 
    kalshiCount,
    settings,
  } = useArbitrage();
  
  const { refreshKalshiPrices, isRefreshingKalshi, lastKalshiRefresh, summary } = useMarkets();
  const [sortBy, setSortBy] = useState<SortOption>('profit');

  const sortedOpportunities = useMemo(() => {
    const sorted = [...freshOpportunities];
    switch (sortBy) {
      case 'profit':
        return sorted.sort((a, b) => b.profitPercent - a.profitPercent);
      case 'expiration':
        return sorted.sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());
      case 'freshness':
        return sorted.sort((a, b) => {
          const aFresh = Math.max(
            a.match.polymarket.lastPriceUpdatedAt?.getTime() || 0,
            a.match.kalshi.lastPriceUpdatedAt?.getTime() || 0
          );
          const bFresh = Math.max(
            b.match.polymarket.lastPriceUpdatedAt?.getTime() || 0,
            b.match.kalshi.lastPriceUpdatedAt?.getTime() || 0
          );
          return bFresh - aFresh;
        });
      default:
        return sorted;
    }
  }, [freshOpportunities, sortBy]);
  
  if (isLoading && matches.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <span>Loading markets and scanning for arbitrage opportunities...</span>
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Scan Coverage Header */}
      <Card className="border-border bg-muted/30">
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-muted-foreground">Scanned:</span>
                <span className="ml-2 font-medium">{summary.polymarketCount.toLocaleString()} Poly</span>
                <span className="mx-1 text-muted-foreground">/</span>
                <span className="font-medium">{summary.kalshiCount.toLocaleString()} Kalshi</span>
              </div>
              <div>
                <span className="text-muted-foreground">Contracts:</span>
                <span className="ml-2 font-medium">{summary.totalContracts.toLocaleString()}</span>
              </div>
              <div className="text-green-600">
                <span className="text-muted-foreground">Matched:</span>
                <span className="ml-2 font-bold">{summary.matchedMarkets} pairs</span>
                <span className="ml-1 text-xs">({summary.matchCoveragePercent.toFixed(1)}%)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-3">
          <span className={freshOpportunities.length > 0 ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
            Active: <strong className="text-lg">{freshOpportunities.length}</strong>
          </span>
          
          {freshOpportunities.length > 1 && (
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <ArrowUpDown className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="profit">Highest Profit</SelectItem>
                <SelectItem value="expiration">Soonest Expiry</SelectItem>
                <SelectItem value="freshness">Most Fresh</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={refreshKalshiPrices}
          disabled={isRefreshingKalshi}
        >
          <Zap className={`w-3 h-3 mr-1 ${isRefreshingKalshi ? 'animate-pulse' : ''}`} />
          Refresh Kalshi
          {lastKalshiRefresh && (
            <span className="text-muted-foreground ml-1">
              ({formatAge(lastKalshiRefresh)})
            </span>
          )}
        </Button>
      </div>
      
      {/* Arbitrage Opportunities */}
      {sortedOpportunities.length > 0 ? (
        <div className="grid gap-4">
          {sortedOpportunities.map(opp => (
            <ArbitrageCard key={opp.id} opportunity={opp} maxAgeSeconds={settings.maxAgeSeconds} />
          ))}
        </div>
      ) : staleCount > 0 ? (
        <Card className="border-dashed border-chart-4/30 bg-chart-4/5">
          <CardContent className="py-8 text-center">
            <RefreshCw className="w-12 h-12 mx-auto text-chart-4 mb-4 animate-spin" style={{ animationDuration: '3s' }} />
            <h3 className="text-lg font-semibold mb-2">Waiting for Fresh Prices…</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Found {staleCount} potential {staleCount === 1 ? 'opportunity' : 'opportunities'}, but prices need to be refreshed.
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshKalshiPrices}
              disabled={isRefreshingKalshi}
              className="mt-4"
            >
              <Zap className={`w-3 h-3 mr-1 ${isRefreshingKalshi ? 'animate-pulse' : ''}`} />
              Force Kalshi Refresh
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Arbitrage Opportunities</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Scanning for price discrepancies across platforms…
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
