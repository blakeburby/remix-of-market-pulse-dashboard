import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSportsArbitrage } from '@/hooks/useSportsArbitrage';
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
  Target, 
  TrendingUp, 
  Percent, 
  Clock, 
  ExternalLink,
  AlertCircle,
  Trophy
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { SportType, SportsArbitrageOpportunity } from '@/types/sports-arbitrage';

function formatCents(price: number): string {
  return `${Math.round(price * 100)}¢`;
}

function formatProfitPercent(percent: number): string {
  return `+${percent.toFixed(2)}%`;
}

const SPORT_LABELS: Record<SportType, string> = {
  cfb: 'College Football',
  nfl: 'NFL',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
};

function SportsArbitrageCard({ opportunity }: { opportunity: SportsArbitrageOpportunity }) {
  const { match, buyYesOn, buyNoOn, yesPlatformPrice, noPlatformPrice, combinedCost, profitPercent, profitPerDollar, expirationDate } = opportunity;
  
  const polymarketUrl = `https://polymarket.com/event/${match.polymarket_market_slug}`;
  const kalshiUrl = `https://kalshi.com/markets/${match.kalshi_event_ticker}`;
  
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
          {match.polymarket_title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Kalshi: {match.kalshi_title}
        </p>
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
              Match: <span className="font-medium">{Math.round(match.match_score * 100)}%</span>
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

export default function SportsArbitragePage() {
  const { isAuthenticated, logout } = useAuth();
  const { settings, updateSettings, resetSettings, defaults } = useArbitrageSettings();
  const { 
    matches, 
    opportunities, 
    isLoading, 
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
              <SelectContent>
                <SelectItem value="cfb">{SPORT_LABELS.cfb}</SelectItem>
                <SelectItem value="nfl">{SPORT_LABELS.nfl}</SelectItem>
                <SelectItem value="nba">{SPORT_LABELS.nba}</SelectItem>
                <SelectItem value="mlb">{SPORT_LABELS.mlb}</SelectItem>
                <SelectItem value="nhl">{SPORT_LABELS.nhl}</SelectItem>
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
                  <span className="text-muted-foreground">Matched Markets:</span>
                  <span className="ml-2 font-medium">{matches.length}</span>
                </div>
                <div className="text-green-600">
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
        {isLoading && matches.length === 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              <span>Loading {SPORT_LABELS[sport]} markets...</span>
            </div>
            <div className="grid gap-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          </div>
        )}

        {/* Opportunities */}
        {!isLoading && opportunities.length > 0 && (
          <div className="grid gap-4">
            {opportunities.map(opp => (
              <SportsArbitrageCard key={opp.id} opportunity={opp} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && opportunities.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Arbitrage Opportunities</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                {matches.length > 0 
                  ? `Found ${matches.length} matched ${SPORT_LABELS[sport]} markets, but no profitable arbitrage opportunities with min ${settings.minProfitPercent}% profit.`
                  : `No matched markets found for ${SPORT_LABELS[sport]}. Try a different sport.`
                }
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
