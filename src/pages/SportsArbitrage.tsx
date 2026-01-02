import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSportsArbitrage, SportType, MatchedMarketPair } from '@/hooks/useSportsArbitrage';
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
  XCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const SPORT_LABELS: Record<SportType, string> = {
  nfl: 'NFL',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
  cfb: 'College Football',
};

function MatchedPairCard({ pair }: { pair: MatchedMarketPair }) {
  const kalshiUrl = `https://kalshi.com/markets/${pair.kalshi.event_ticker}`;
  const polymarketUrl = pair.polymarket 
    ? `https://polymarket.com/event/${pair.polymarket.market_slug}`
    : null;

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
        {pair.kalshiMarket && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="p-2 rounded bg-muted/50 text-center">
              <p className="text-xs text-muted-foreground">Kalshi Price</p>
              <p className="font-bold">{pair.kalshiMarket.last_price}¢</p>
            </div>
            <div className="p-2 rounded bg-muted/50 text-center">
              <p className="text-xs text-muted-foreground">Polymarket</p>
              <p className="font-bold text-muted-foreground">
                {pair.polymarket ? 'Fetch needed' : '—'}
              </p>
            </div>
          </div>
        )}

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
    isLoading, 
    isLoadingMatches,
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
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
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
                  <span className="text-muted-foreground">Kalshi Markets:</span>
                  <span className="ml-2 font-medium">{kalshiMarkets.length}</span>
                </div>
                <div className={matchedCount > 0 ? 'text-green-600' : ''}>
                  <span className="text-muted-foreground">Matched:</span>
                  <span className="ml-2 font-bold">{matchedCount}</span>
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

        {/* Loading Matches indicator */}
        {isLoadingMatches && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Finding matching Polymarket markets...</span>
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          </div>
        )}

        {/* Matched Pairs */}
        {!isLoading && matchedPairs.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Cross-Platform Matches ({matchedCount} found)
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

        {/* Kalshi-only markets */}
        {!isLoading && kalshiMarkets.length > 0 && matchedPairs.filter(p => !p.polymarket).length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Kalshi Markets (no Polymarket match)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {matchedPairs
                .filter(p => !p.polymarket)
                .slice(0, 6)
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
