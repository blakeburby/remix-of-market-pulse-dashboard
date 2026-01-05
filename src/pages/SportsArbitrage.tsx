import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSportsArbitrage, SportType, MatchedMarketPair, SportsArbitrageOpportunity } from '@/hooks/useSportsArbitrage';
import { useArbitrageSettings } from '@/hooks/useArbitrageSettings';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { ArbitrageSettingsPanel } from '@/components/dashboard/ArbitrageSettingsPanel';
import { BetCalculator } from '@/components/sports/BetCalculator';
import { PriceProgressBar } from '@/components/sports/ProgressBar';
import { AutoRefreshToggle } from '@/components/sports/AutoRefreshToggle';
import { SearchFilter } from '@/components/sports/SearchFilter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
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
  CalendarIcon,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ExternalLinkIcon,
} from 'lucide-react';
import { format, formatDistanceToNow, addDays, subDays, startOfToday } from 'date-fns';

const SPORT_LABELS: Record<SportType, string> = {
  nfl: 'NFL',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
  cfb: 'College Football',
  cbb: 'College Basketball',
};

function formatCents(price: number): string {
  return `${Math.round(price * 100)}¢`;
}

function formatProfitPercent(percent: number): string {
  return `+${percent.toFixed(2)}%`;
}

function getProfitTierColor(percent: number): string {
  if (percent >= 5) return 'text-green-500 border-green-500 bg-green-500/10';
  if (percent >= 3) return 'text-emerald-500 border-emerald-500 bg-emerald-500/10';
  if (percent >= 1) return 'text-yellow-500 border-yellow-500 bg-yellow-500/10';
  return 'text-orange-500 border-orange-500 bg-orange-500/10';
}

function getProfitBgGradient(percent: number): string {
  if (percent >= 5) return 'from-green-500/10 via-green-500/5 to-transparent';
  if (percent >= 3) return 'from-emerald-500/10 via-emerald-500/5 to-transparent';
  if (percent >= 1) return 'from-yellow-500/10 via-yellow-500/5 to-transparent';
  return 'from-orange-500/10 via-orange-500/5 to-transparent';
}

function openBothPlatforms(kalshiUrl: string, polymarketUrl: string) {
  window.open(kalshiUrl, '_blank');
  setTimeout(() => {
    window.open(polymarketUrl, '_blank');
  }, 100);
}

function SportsArbitrageCard({ 
  opportunity, 
  showCalculator,
  onToggleCalculator 
}: { 
  opportunity: SportsArbitrageOpportunity;
  showCalculator: boolean;
  onToggleCalculator: () => void;
}) {
  const { 
    title, 
    polymarketSlug, 
    kalshiEventTicker,
    kalshiMarketTicker,
    buyYesOn, 
    buyNoOn,
    kalshiYesPrice,
    kalshiNoPrice,
    polyYesPrice,
    polyNoPrice,
    combinedCost, 
    profitPercent, 
    profitPerDollar,
    kalshiBidAsk,
  } = opportunity;

  const yesPlatformPrice = buyYesOn === 'KALSHI' ? kalshiYesPrice : polyYesPrice;
  const noPlatformPrice = buyNoOn === 'KALSHI' ? kalshiNoPrice : polyNoPrice;
  
  // Kalshi URL format: https://kalshi.com/markets/{event_ticker}/{market_ticker}
  const kalshiUrl = `https://kalshi.com/markets/${kalshiEventTicker.toLowerCase()}/${kalshiMarketTicker.toLowerCase()}`;
  const polymarketUrl = `https://polymarket.com/event/${polymarketSlug}`;
  
  const profitTierClass = getProfitTierColor(profitPercent);
  const bgGradient = getProfitBgGradient(profitPercent);
  
  return (
    <Card className={cn("border-primary/20 bg-gradient-to-br", bgGradient)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <Badge variant="default" className="bg-green-600 hover:bg-green-700">
              LOCKED ARBITRAGE
            </Badge>
          </div>
          <Badge variant="outline" className={cn("font-bold text-lg", profitTierClass)}>
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

        {/* Price Comparison + Bid/Ask */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-2 rounded bg-muted/30">
            <p className="text-muted-foreground mb-1">Kalshi</p>
            <p>YES: {formatCents(kalshiYesPrice)} / NO: {formatCents(kalshiNoPrice)}</p>
            {kalshiBidAsk && kalshiBidAsk.spread !== null && (
              <p className="text-muted-foreground mt-1">
                Spread: {kalshiBidAsk.spread}¢
              </p>
            )}
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

        {/* Bet Calculator (Collapsible) */}
        <Collapsible open={showCalculator} onOpenChange={onToggleCalculator}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span>Bet Calculator</span>
              {showCalculator ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <BetCalculator opportunity={opportunity} />
          </CollapsibleContent>
        </Collapsible>
        
        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
          <Button 
            variant="default" 
            size="sm"
            onClick={() => openBothPlatforms(kalshiUrl, polymarketUrl)}
            className="gap-1"
          >
            <ExternalLinkIcon className="w-3 h-3" />
            Open Both
          </Button>
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

function MatchedPairCard({ 
  pair, 
  onRetry 
}: { 
  pair: MatchedMarketPair;
  onRetry: () => void;
}) {
  const marketTicker = pair.kalshi.market_tickers[0] ?? '';
  const kalshiUrl = marketTicker
    ? `https://kalshi.com/markets/${pair.kalshi.event_ticker.toLowerCase()}/${marketTicker.toLowerCase()}`
    : `https://kalshi.com/markets/${pair.kalshi.event_ticker.toLowerCase()}`;
  const polymarketUrl = pair.polymarket 
    ? `https://polymarket.com/event/${pair.polymarket.market_slug}`
    : null;

  const hasError = pair.kalshiError || pair.polymarketError;

  return (
    <Card className="group hover:border-primary/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">
              {pair.kalshi.event_ticker}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pair.polymarket ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Matched
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="w-3 h-3 mr-1" />
                No Match
              </Badge>
            )}
          </div>
        </div>

        {/* Prices */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="p-2 rounded bg-muted/50 text-center">
            <p className="text-xs text-muted-foreground">Kalshi</p>
            {pair.kalshiPrices ? (
              <>
                <p className="font-bold">
                  {formatCents(pair.kalshiPrices.yesPrice)} / {formatCents(pair.kalshiPrices.noPrice)}
                </p>
                {pair.kalshiBidAsk && pair.kalshiBidAsk.spread !== null && (
                  <p className="text-[10px] text-muted-foreground">
                    Spread: {pair.kalshiBidAsk.spread}¢
                  </p>
                )}
              </>
            ) : pair.kalshiError ? (
              <p className="text-xs text-destructive flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {pair.kalshiError.status ? `Error ${pair.kalshiError.status}` : pair.kalshiError.message}
              </p>
            ) : pair.pricesFetched ? (
              <p className="text-xs text-muted-foreground">No price</p>
            ) : (
              <Skeleton className="h-5 w-16 mx-auto" />
            )}
          </div>
          <div className="p-2 rounded bg-muted/50 text-center">
            <p className="text-xs text-muted-foreground">Polymarket</p>
            {pair.polymarketPrices ? (
              <p className="font-bold">
                {formatCents(pair.polymarketPrices.yesPrice)} / {formatCents(pair.polymarketPrices.noPrice)}
              </p>
            ) : pair.polymarketError ? (
              <p className="text-xs text-destructive flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {pair.polymarketError.status ? `Error ${pair.polymarketError.status}` : pair.polymarketError.message}
              </p>
            ) : !pair.polymarket ? (
              <p className="font-bold">—</p>
            ) : pair.pricesFetched ? (
              <p className="text-xs text-muted-foreground">No price</p>
            ) : (
              <Skeleton className="h-5 w-16 mx-auto" />
            )}
          </div>
        </div>

        {/* Edge calculation */}
        {pair.kalshiPrices && pair.polymarketPrices && (
          <div className="text-xs text-center mb-3 p-2 rounded bg-muted/30">
            {(() => {
              const cost1 = pair.kalshiPrices.yesPrice + pair.polymarketPrices.noPrice;
              const cost2 = pair.polymarketPrices.yesPrice + pair.kalshiPrices.noPrice;
              const bestCost = Math.min(cost1, cost2);
              const edge = ((1 - bestCost) / bestCost * 100);
              if (edge > 0) {
                return <span className="text-green-600 font-medium">Edge: +{edge.toFixed(2)}%</span>;
              }
              return <span className="text-muted-foreground">Edge: {edge.toFixed(2)}% (no arb)</span>;
            })()}
          </div>
        )}

        {/* Links + Retry */}
        <div className="flex gap-2">
          {hasError && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onRetry}
              disabled={pair.isRetrying}
              className="shrink-0"
            >
              <RotateCcw className={cn("w-3 h-3", pair.isRetrying && "animate-spin")} />
            </Button>
          )}
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
  const { isAuthenticated, isReady, logout } = useAuth();
  const { settings, updateSettings, resetSettings, defaults } = useArbitrageSettings();
  const {
    matchedPairs,
    opportunities,
    isLoading, 
    isFetchingPrices,
    priceProgress,
    error, 
    lastRefresh, 
    refresh,
    retryPair,
    sport, 
    setSport,
    date,
    setDate,
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    autoRefreshCountdown,
    hideIlliquid,
    setHideIlliquid,
    searchQuery,
    setSearchQuery,
  } = useSportsArbitrage();
  const navigate = useNavigate();
  
  // Collapsible sections
  const [opportunitiesOpen, setOpportunitiesOpen] = useState(true);
  const [matchedPairsOpen, setMatchedPairsOpen] = useState(true);
  
  // Track which calculators are open
  const [openCalculators, setOpenCalculators] = useState<Set<string>>(new Set());
  
  const toggleCalculator = (id: string) => {
    setOpenCalculators(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      navigate('/');
    }
  }, [isReady, isAuthenticated, navigate]);

  if (!isReady) {
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  const matchedCount = matchedPairs.filter(p => p.polymarket).length;
  const pricedCount = matchedPairs.filter(p => p.kalshiPrices && p.polymarketPrices).length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onLogout={logout} />
      
      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {/* Header Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-semibold">Sports Arbitrage</h2>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sport} onValueChange={(v) => setSport(v as SportType)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border">
                <SelectItem value="nfl">{SPORT_LABELS.nfl}</SelectItem>
                <SelectItem value="nba">{SPORT_LABELS.nba}</SelectItem>
                <SelectItem value="mlb">{SPORT_LABELS.mlb}</SelectItem>
                <SelectItem value="nhl">{SPORT_LABELS.nhl}</SelectItem>
                <SelectItem value="cfb">{SPORT_LABELS.cfb}</SelectItem>
                <SelectItem value="cbb">{SPORT_LABELS.cbb}</SelectItem>
              </SelectContent>
            </Select>

            {/* Quick Date Controls */}
            <div className="flex items-center gap-1 mr-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs"
                onClick={() => setDate(subDays(date, 1))}
              >
                ←
              </Button>
              <Button
                variant={format(date, 'yyyy-MM-dd') === format(startOfToday(), 'yyyy-MM-dd') ? 'secondary' : 'ghost'}
                size="sm"
                className="h-9 px-2 text-xs"
                onClick={() => setDate(startOfToday())}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs"
                onClick={() => setDate(addDays(date, 1))}
              >
                →
              </Button>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-[130px] justify-start text-left font-normal h-9",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "MMM d") : <span>Date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            
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
              className="h-9"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", (isLoading || isFetchingPrices) && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Search + Filters Row */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              hideIlliquid={hideIlliquid}
              onHideIlliquidChange={setHideIlliquid}
            />
          </div>
          <AutoRefreshToggle
            enabled={autoRefreshEnabled}
            onToggle={setAutoRefreshEnabled}
            countdown={autoRefreshCountdown}
            isLoading={isLoading || isFetchingPrices}
          />
        </div>

        {/* Sticky Stats Bar */}
        <Card className="border-border bg-muted/30 sticky top-0 z-10">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs sm:text-sm">Sport:</span>
                  <span className="font-medium">{SPORT_LABELS[sport]}</span>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium">{format(date, "MMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs sm:text-sm">Markets:</span>
                  <span className="font-medium">{matchedPairs.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs sm:text-sm">Priced:</span>
                  <span className="font-medium">{pricedCount}</span>
                </div>
                <div className={cn("flex items-center gap-2", opportunities.length > 0 && 'text-green-600')}>
                  <span className="text-muted-foreground text-xs sm:text-sm">Opps:</span>
                  <span className="font-bold">{opportunities.length}</span>
                </div>
              </div>
              {lastRefresh && (
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(lastRefresh, { addSuffix: true })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Price Progress Bar */}
        <PriceProgressBar progress={priceProgress} isFetching={isFetchingPrices} />

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
        {isLoading && matchedPairs.length === 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Loading {SPORT_LABELS[sport]} markets for {format(date, "MMM d, yyyy")}...</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          </div>
        )}

        {/* Arbitrage Opportunities Section */}
        {!isLoading && opportunities.length > 0 && (
          <Collapsible open={opportunitiesOpen} onOpenChange={setOpportunitiesOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <h3 className="text-lg font-semibold text-green-600 flex items-center gap-2">
                  🎯 Arbitrage Opportunities ({opportunities.length})
                </h3>
                {opportunitiesOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="grid gap-4">
                {opportunities.map(opp => (
                  <SportsArbitrageCard 
                    key={opp.id} 
                    opportunity={opp}
                    showCalculator={openCalculators.has(opp.id)}
                    onToggleCalculator={() => toggleCalculator(opp.id)}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Matched Pairs Section */}
        {!isLoading && matchedPairs.filter(p => p.polymarket).length > 0 && (
          <Collapsible open={matchedPairsOpen} onOpenChange={setMatchedPairsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  Cross-Platform Matches ({matchedPairs.filter(p => p.polymarket).length})
                  {opportunities.length === 0 && (
                    <span className="text-xs">(no arbitrage at min {settings.minProfitPercent}%)</span>
                  )}
                </h3>
                {matchedPairsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {matchedPairs
                  .filter(p => p.polymarket)
                  .map(pair => (
                    <MatchedPairCard 
                      key={pair.kalshi.event_ticker} 
                      pair={pair}
                      onRetry={() => retryPair(pair.kalshi.event_ticker)}
                    />
                  ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Empty State */}
        {!isLoading && !error && matchedPairs.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No {SPORT_LABELS[sport]} Markets Found</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                No matching {SPORT_LABELS[sport]} markets found for {format(date, "MMMM d, yyyy")}. Try a different date or sport.
              </p>
              <Button variant="outline" onClick={refresh} disabled={isLoading}>
                <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
                Refresh
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
