import { useArbitrage } from '@/hooks/useArbitrage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArbitrageOpportunity } from '@/types/dome';
import { formatCents, formatProfitPercent } from '@/lib/arbitrage-matcher';
import { ExternalLink, TrendingUp, AlertCircle, Target, Clock, Percent, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function ArbitrageCard({ opportunity }: { opportunity: ArbitrageOpportunity }) {
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

function MatchCard({ match }: { match: { polymarket: any; kalshi: any; matchScore: number; matchReason: string } }) {
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
  const { freshOpportunities, staleCount, matches, isLoading, polymarketCount, kalshiCount } = useArbitrage();
  
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
      {/* Stats Bar */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span>Polymarket: <strong className="text-foreground">{polymarketCount}</strong> markets</span>
        <span>Kalshi: <strong className="text-foreground">{kalshiCount}</strong> markets</span>
        <span>Matched: <strong className="text-foreground">{matches.length}</strong> pairs</span>
        <span className={freshOpportunities.length > 0 ? 'text-green-600' : ''}>
          Arbitrage: <strong>{freshOpportunities.length}</strong> {freshOpportunities.length === 1 ? 'opportunity' : 'opportunities'}
        </span>
        {staleCount > 0 && (
          <span className="text-muted-foreground/60 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            {staleCount} awaiting fresh prices
          </span>
        )}
      </div>
      
      {/* Arbitrage Opportunities */}
      {freshOpportunities.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Active Arbitrage Opportunities
          </h3>
          <div className="grid gap-4">
            {freshOpportunities.map(opp => (
              <ArbitrageCard key={opp.id} opportunity={opp} />
            ))}
          </div>
        </div>
      ) : staleCount > 0 ? (
        <Card className="border-dashed border-chart-4/30 bg-chart-4/5">
          <CardContent className="py-8 text-center">
            <RefreshCw className="w-12 h-12 mx-auto text-chart-4 mb-4 animate-spin" style={{ animationDuration: '3s' }} />
            <h3 className="text-lg font-semibold mb-2">Waiting for Both Markets to Update…</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Found {staleCount} potential {staleCount === 1 ? 'opportunity' : 'opportunities'}, but prices need to be refreshed on both platforms within 30 seconds of each other for reliable arbitrage detection.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Arbitrage Opportunities Found</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Arbitrage opportunities are rare and fleeting. The scanner is continuously monitoring 
              {matches.length > 0 ? ` ${matches.length} matched market pairs` : ' both platforms'} for price discrepancies.
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Matched Markets */}
      {matches.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">
            Matched Markets ({matches.length})
          </h3>
          <p className="text-sm text-muted-foreground">
            These markets appear to be the same event on both platforms. Combined cost under 100¢ = arbitrage.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((match, i) => (
              <MatchCard key={i} match={match} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
