import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSportsArbitrage, SportType, MatchedMarketPair, SportsArbitrageOpportunity } from '@/hooks/useSportsArbitrage';
import { useArbitrageSettings } from '@/hooks/useArbitrageSettings';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { ArbitrageSettingsPanel } from '@/components/dashboard/ArbitrageSettingsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  RefreshCw, 
  AlertCircle,
  Trophy,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Target,
  TrendingUp,
  Percent,
  Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const SPORT_LABELS: Record<SportType, string> = {
  nfl: 'NFL',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
  cfb: 'College Football',
};

function formatCents(price: number): string {
  return `${Math.round(price * 100)}¢`;
}

function formatProfitPercent(percent: number): string {
  return `+${percent.toFixed(2)}%`;
}

function SportsArbitrageCard({ opportunity }: { opportunity: SportsArbitrageOpportunity }) {
  const { 
    title, 
    polymarketSlug, 
    kalshiEventTicker, 
    buyYesOn, 
    buyNoOn,
    kalshiYesPrice,
    kalshiNoPrice,
    polyYesPrice,
    polyNoPrice,
    combinedCost, 
    profitPercent, 
    profitPerDollar, 
    expirationDate 
  } = opportunity;

  const yesPlatformPrice = buyYesOn === 'KALSHI' ? kalshiYesPrice : polyYesPrice;
  const noPlatformPrice = buyNoOn === 'KALSHI' ? kalshiNoPrice : polyNoPrice;
  
  const kalshiUrl = `https://kalshi.com/markets/${kalshiEventTicker}`;
  const polymarketUrl = `https://polymarket.com/event/${polymarketSlug}`;
  
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
          {title}
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

        {/* Price Comparison */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-2 rounded bg-muted/30">
            <p className="text-muted-foreground mb-1">Kalshi</p>
            <p>YES: {formatCents(kalshiYesPrice)} / NO: {formatCents(kalshiNoPrice)}</p>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <p className="text-muted-foreground mb-1">Polymarket</p>
            <p>YES: {formatCents(polyYesPrice)} / NO: {formatCents(polyNoPrice)}</p>
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

function MatchedPairCard({ pair }: { pair: MatchedMarketPair }) {
  const kalshiUrl = `https://kalshi.com/markets/${pair.kalshi.event_ticker}`;
  const polymarketUrl = pair.polymarket 
    ? `https://polymarket.com/event/${pair.polymarket.market_slug}`
    : null;

  const kalshiYes = pair.kalshiMarket ? pair.kalshiMarket.last_price : null;
  const kalshiNo = kalshiYes !== null ? 100 - kalshiYes : null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1">
            <p className="font-medium text-sm">
              {pair.kalshiMarket?.title || pair.kalshi.event_ticker}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {pair.kalshi.event_ticker}
            </p>
          </div>
          {pair.polymarket ? (
            <Badge variant="default" className="bg-green-600 shrink-0">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Matched
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0">
              <XCircle className="w-3 h-3 mr-1" />
              No Match
            </Badge>
          )}
        </div>

        {/* Prices */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="p-2 rounded bg-muted/50 text-center">
            <p className="text-xs text-muted-foreground">Kalshi</p>
            <p className="font-bold">
              {kalshiYes !== null ? `${kalshiYes}¢ / ${kalshiNo}¢` : '—'}
            </p>
          </div>
          <div className="p-2 rounded bg-muted/50 text-center">
            <p className="text-xs text-muted-foreground">Polymarket</p>
            <p className="font-bold">
              {pair.polymarketPrices 
                ? `${formatCents(pair.polymarketPrices.yesPrice)} / ${formatCents(pair.polymarketPrices.noPrice)}`
                : pair.polymarket ? 'Loading...' : '—'
              }
            </p>
          </div>
        </div>

        {/* Links */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild className="flex-1">
            <a href={kalshiUrl} target="_blank" rel="noopener noreferrer">
              Kalshi <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </Button>
          {polymarketUrl && (
            <Button variant="outline" size="sm" asChild className="flex-1">
              <a href={polymarketUrl} target="_blank" rel="noopener noreferrer">
                Polymarket <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SportsArbitragePage() {
  const { isAuthenticated, logout } = useAuth();
  const { settings, updateSettings, resetSettings, defaults } = useArbitrageSettings();
  const { 
    kalshiMarkets,
    matchedPairs,
    opportunities,
    isLoading, 
    isLoadingMatches,
    isFetchingPrices,
    error, 
    lastRefresh, 
    refresh, 
    sport, 
    setSport 
  } = useSportsArbitrage();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  const matchedCount = matchedPairs.filter(p => p.polymarket).length;
  const pricedCount = matchedPairs.filter(p => p.polymarketPrices).length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onLogout={logout} />
      
      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-8">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-semibold">Sports Arbitrage</h2>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={sport} onValueChange={(v) => setSport(v as SportType)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border">
                <SelectItem value="nfl">{SPORT_LABELS.nfl}</SelectItem>
                <SelectItem value="nba">{SPORT_LABELS.nba}</SelectItem>
                <SelectItem value="mlb">{SPORT_LABELS.mlb}</SelectItem>
                <SelectItem value="nhl">{SPORT_LABELS.nhl}</SelectItem>
                <SelectItem value="cfb">{SPORT_LABELS.cfb}</SelectItem>
              </SelectContent>
            </Select>
            
            <ArbitrageSettingsPanel
              settings={settings}
              updateSettings={updateSettings}
              resetSettings={resetSettings}
              defaults={defaults}
            />
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refresh}
              disabled={isLoading || isFetchingPrices}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading || isFetchingPrices ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        <Card className="border-border bg-muted/30">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-muted-foreground">Sport:</span>
                  <span className="ml-2 font-medium">{SPORT_LABELS[sport]}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Kalshi:</span>
                  <span className="ml-2 font-medium">{kalshiMarkets.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Matched:</span>
                  <span className="ml-2 font-medium">{matchedCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Priced:</span>
                  <span className="ml-2 font-medium">{pricedCount}</span>
                </div>
                <div className={opportunities.length > 0 ? 'text-green-600' : ''}>
                  <span className="text-muted-foreground">Opportunities:</span>
                  <span className="ml-2 font-bold">{opportunities.length}</span>
                </div>
              </div>
              {lastRefresh && (
                <div className="text-xs text-muted-foreground">
                  Last refresh: {formatDistanceToNow(lastRefresh, { addSuffix: true })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Loading indicators */}
        {(isLoadingMatches || isFetchingPrices) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>
              {isFetchingPrices 
                ? 'Fetching Polymarket prices...' 
                : 'Finding matching Polymarket markets...'}
            </span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && kalshiMarkets.length === 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Loading {SPORT_LABELS[sport]} markets...</span>
            </div>
            <div className="grid gap-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          </div>
        )}

        {/* Arbitrage Opportunities */}
        {!isLoading && opportunities.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-green-600">
              🎯 Arbitrage Opportunities ({opportunities.length})
            </h3>
            <div className="grid gap-4">
              {opportunities.map(opp => (
                <SportsArbitrageCard key={opp.id} opportunity={opp} />
              ))}
            </div>
          </div>
        )}

        {/* Matched Pairs without arbitrage */}
        {!isLoading && matchedPairs.filter(p => p.polymarket).length > 0 && opportunities.length === 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Cross-Platform Matches (no arbitrage at min {settings.minProfitPercent}% profit)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {matchedPairs
                .filter(p => p.polymarket)
                .map(pair => (
                  <MatchedPairCard key={pair.kalshi.event_ticker} pair={pair} />
                ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && kalshiMarkets.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No {SPORT_LABELS[sport]} Markets Found</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                No open {SPORT_LABELS[sport]} markets found on Kalshi. Try a different sport or check back later.
              </p>
              <Button variant="outline" onClick={refresh} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
