import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useArbitrage } from '@/hooks/useArbitrage';
import { useMarkets } from '@/contexts/MarketsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArbitrageOpportunity, CrossPlatformMatch } from '@/types/dome';
import { formatCents, formatProfitPercent } from '@/lib/arbitrage-matcher';
import { ExternalLink, TrendingUp, AlertCircle, Target, Clock, RefreshCw, Zap, Timer, ArrowUpDown, Calculator, Search } from 'lucide-react';
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

  // Determine profit tier for color coding
  const getProfitTierStyle = (percent: number) => {
    if (percent >= 5) return 'bg-green-600 text-white';
    if (percent >= 2) return 'bg-green-500/80 text-white';
    return 'bg-green-500/60 text-white';
  };
  
  return (
    <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent hover:border-green-500/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={getProfitTierStyle(profitPercent)}>
                <TrendingUp className="w-3 h-3 mr-1" />
                {formatProfitPercent(profitPercent)} PROFIT
              </Badge>
            </div>
            <CardTitle className="text-base sm:text-lg leading-tight line-clamp-2">
              {match.polymarket.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild className="h-7 px-2.5">
              <a href={kalshiUrl} target="_blank" rel="noopener noreferrer">
                Kalshi <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild className="h-7 px-2.5">
              <a href={polymarketUrl} target="_blank" rel="noopener noreferrer">
                Poly <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </Button>
          </div>
        </div>
        <FreshnessBadge 
          polymarket={match.polymarket.lastPriceUpdatedAt} 
          kalshi={match.kalshi.lastPriceUpdatedAt}
          maxAgeSeconds={maxAgeSeconds}
        />
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Trade Instructions - More prominent */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <span className="text-xs font-bold text-green-600">1</span>
              </div>
              <span className="text-xs font-medium text-muted-foreground">BUY YES</span>
            </div>
            <p className="font-semibold text-sm">{buyYesOn === 'KALSHI' ? 'Kalshi' : 'Polymarket'}</p>
            <p className="text-2xl font-bold text-primary">{formatCents(yesPlatformPrice)}</p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <span className="text-xs font-bold text-green-600">2</span>
              </div>
              <span className="text-xs font-medium text-muted-foreground">BUY NO</span>
            </div>
            <p className="font-semibold text-sm">{buyNoOn === 'KALSHI' ? 'Kalshi' : 'Polymarket'}</p>
            <p className="text-2xl font-bold text-primary">{formatCents(noPlatformPrice)}</p>
          </div>
        </div>
        
        {/* Profit Summary - Cleaner */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 text-sm">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-muted-foreground">Cost:</span>
              <span className="ml-1 font-semibold">{formatCents(combinedCost)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Payout:</span>
              <span className="ml-1 font-semibold">$1.00</span>
            </div>
          </div>
          <div className="text-green-600 font-semibold">
            +${profitPerDollar.toFixed(3)}/contract
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Expires {formatDistanceToNow(expirationDate, { addSuffix: true })}</span>
            </div>
            <span>•</span>
            <span>Match: {Math.round(match.matchScore * 100)}%</span>
          </div>
          <Link to={`/calculator?kalshi=${Math.round(yesPlatformPrice * 100)}&poly=${Math.round(noPlatformPrice * 100)}`}>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <Calculator className="w-3 h-3 mr-1" />
              Calculate
            </Button>
          </Link>
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
  
  // Check if prices are real or default
  const polyHasRealPrice = match.polymarket.lastPriceUpdatedAt !== undefined;
  const kalshiHasRealPrice = kalshiYes > 0 && kalshiNo > 0;
  
  // Calculate potential costs in both directions
  const cost1 = kalshiYes + polyNo; // Kalshi YES + Poly NO
  const cost2 = polyYes + kalshiNo; // Poly YES + Kalshi NO
  
  const hasArbitrage = polyHasRealPrice && kalshiHasRealPrice && (cost1 < 1 || cost2 < 1);
  const hasMissingPrices = !polyHasRealPrice || !kalshiHasRealPrice;
  
  return (
    <Card className={`${hasArbitrage ? 'border-green-500/50' : hasMissingPrices ? 'border-amber-500/30 bg-amber-500/5' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <p className="font-medium text-sm line-clamp-2">{match.polymarket.title}</p>
          <Badge variant="secondary" className="shrink-0">
            {Math.round(match.matchScore * 100)}%
          </Badge>
        </div>
        
        {/* Price Status Warning */}
        {hasMissingPrices && (
          <div className="mb-3 p-2 rounded bg-amber-500/10 text-xs text-amber-600 flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" />
            {!polyHasRealPrice && !kalshiHasRealPrice 
              ? 'Awaiting prices from both platforms'
              : !polyHasRealPrice 
              ? 'Awaiting Polymarket price' 
              : 'Kalshi has no trades yet (0¢)'}
          </div>
        )}
        
        {/* Freshness Badge */}
        {!hasMissingPrices && (
          <div className="mb-3">
            <FreshnessBadge 
              polymarket={match.polymarket.lastPriceUpdatedAt} 
              kalshi={match.kalshi.lastPriceUpdatedAt}
              maxAgeSeconds={maxAgeSeconds}
            />
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-muted-foreground mb-1">Polymarket</p>
            <p className={!polyHasRealPrice ? 'text-muted-foreground/50' : ''}>
              YES: {formatCents(polyYes)} / NO: {formatCents(polyNo)}
              {!polyHasRealPrice && ' (default)'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Kalshi</p>
            <p className={!kalshiHasRealPrice ? 'text-muted-foreground/50' : ''}>
              YES: {formatCents(kalshiYes)} / NO: {formatCents(kalshiNo)}
              {!kalshiHasRealPrice && ' (no trades)'}
            </p>
          </div>
        </div>
        
        {polyHasRealPrice && kalshiHasRealPrice && (
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
        )}
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
    matchesWithValidPrices,
    matchesAwaitingPrices,
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
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Scanned:</span>
                <Badge variant="secondary" className="font-mono">
                  {summary.polymarketCount.toLocaleString()} Poly
                </Badge>
                <Badge variant="secondary" className="font-mono">
                  {summary.kalshiCount.toLocaleString()} Kalshi
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Matched:</span>
                <Badge variant="default" className="bg-green-600 font-mono">
                  {summary.matchedMarkets} pairs
                </Badge>
              </div>
              {matchesAwaitingPrices > 0 && (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <Timer className="w-3.5 h-3.5" />
                  <span className="text-xs">
                    {matchesWithValidPrices}/{matches.length} with live prices
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-green-600" />
            <span className="font-medium">
              Active Opportunities: 
              <span className={`ml-1 text-lg ${freshOpportunities.length > 0 ? 'text-green-600 font-bold' : 'text-muted-foreground'}`}>
                {freshOpportunities.length}
              </span>
            </span>
          </div>
          
          {freshOpportunities.length > 1 && (
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
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
          className="shrink-0"
        >
          <Zap className={`w-3.5 h-3.5 mr-1.5 ${isRefreshingKalshi ? 'animate-pulse text-primary' : ''}`} />
          Refresh Kalshi
          {lastKalshiRefresh && (
            <span className="text-muted-foreground ml-1.5 text-xs">
              {formatAge(lastKalshiRefresh)}
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
        <Card className="border-dashed border-muted-foreground/20">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Arbitrage Opportunities Yet</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
              {summary.matchedMarkets > 0 
                ? `Monitoring ${summary.matchedMarkets} matched market pairs for price discrepancies...`
                : 'Start the scanner to discover and match markets across platforms.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link to="/calculator">
                <Button variant="outline" size="sm">
                  <Calculator className="w-4 h-4 mr-2" />
                  Try Calculator
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
