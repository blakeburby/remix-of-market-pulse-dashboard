import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSportsArbitrageV2, SportType } from '@/hooks/useSportsArbitrageV2';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { TradePlanCard } from '@/components/sports-v2/TradePlanCard';
import { MarketCard } from '@/components/sports-v2/MarketCard';
import { FiltersPanel } from '@/components/sports-v2/FiltersPanel';
import { DiagnosticsPanel } from '@/components/sports-v2/DiagnosticsPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CalendarIcon,
  Filter,
  Info,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  Shield,
  Trophy,
  TrendingUp,
  Zap,
  ZapOff,
} from 'lucide-react';
import { addDays, format, startOfToday, subDays } from 'date-fns';

const SPORT_LABELS: Record<SportType, string> = {
  nfl: 'NFL',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
  cfb: 'College Football',
  cbb: 'College Basketball',
};

function ensureMeta(name: string, content: string) {
  const selector = `meta[name="${name}"]`;
  let tag = document.querySelector(selector) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function ensureCanonical(url: string) {
  let tag = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!tag) {
    tag = document.createElement('link');
    tag.rel = 'canonical';
    document.head.appendChild(tag);
  }
  tag.href = url;
}

export default function SportsArbitrageV2Page() {
  const { isAuthenticated, isReady, logout } = useAuth();
  const navigate = useNavigate();

  const {
    markets,
    tradePlans,
    isLoading,
    isFetchingPrices,
    isLive,
    error,
    lastRefresh,
    refresh,
    sport,
    setSport,
    date,
    setDate,
    settings,
    updateSettings,
    searchQuery,
    setSearchQuery,
    diagnostics,
    clearDiagnostics,
    rateLimiterStats,
  } = useSportsArbitrageV2();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');

  useEffect(() => {
    document.title = 'Locked Sports Arbitrage Scanner V2 | Burby Capital';
    ensureMeta('description', 'Locked sports arbitrage scanner with real-time odds, guardrails, and copy-ready trade plans across platforms.');
    ensureCanonical(`${window.location.origin}/sports-v2`);
  }, []);

  useEffect(() => {
    if (isReady && !isAuthenticated) navigate('/');
  }, [isReady, isAuthenticated, navigate]);

  const filteredMarkets = useMemo(() => {
    if (!searchQuery.trim()) return markets;
    const q = searchQuery.toLowerCase();
    return markets.filter((m) => (m.title ?? m.kalshi.event_ticker).toLowerCase().includes(q));
  }, [markets, searchQuery]);

  if (!isReady) return null;
  if (!isAuthenticated) return null;

  const matchedCount = markets.filter((m) => m.polymarket).length;
  const pricedCount = markets.filter((m) => {
    const kYes = m.kalshiPrice?.yesAsk ?? null;
    const kNo = m.kalshiPrice?.noAsk ?? null;
    const pYes = m.polymarketPrice?.yesAsk ?? null;
    const pNo = m.polymarketPrice?.noAsk ?? null;
    return [kYes, kNo, pYes, pNo].every((v) => typeof v === 'number' && Number.isFinite(v));
  }).length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onLogout={logout} />

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Locked Sports Arbitrage Scanner</h1>
              <p className="text-sm text-muted-foreground">Production-quality locked arbitrage detection</p>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Rate limiter status */}
            {rateLimiterStats.isRateLimited && (
              <Badge variant="destructive" className="gap-1.5">
                <AlertCircle className="w-3 h-3" />
                Throttled
              </Badge>
            )}
            {/* RPM counter */}
            <Badge variant="secondary" className="gap-1.5 text-xs">
              {rateLimiterStats.requestsPerMinute} RPM
            </Badge>
            {/* Auto-refresh indicator */}
            {settings.autoRefreshEnabled && (
              <Badge variant="outline" className="gap-1.5 border-primary text-primary animate-pulse">
                <RefreshCw className="w-3 h-3" />
                Auto {settings.autoRefreshIntervalSeconds}s
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                'gap-1.5',
                isLive ? 'border-chart-2 text-chart-2' : 'border-muted-foreground text-muted-foreground'
              )}
            >
              {isLive ? <Zap className="w-3 h-3" /> : <ZapOff className="w-3 h-3" />}
              {isLive ? 'Live' : 'Stale'}
            </Badge>
            {lastRefresh && (
              <span className="text-xs text-muted-foreground">Updated {format(lastRefresh, 'HH:mm:ss')}</span>
            )}
          </div>
        </header>

        {/* Controls */}
        <section className="flex flex-wrap items-center gap-2" aria-label="Sports V2 controls">
          {/* Sport Select */}
          <Select value={sport} onValueChange={(v) => setSport(v as SportType)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border">
              {Object.entries(SPORT_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Controls */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => setDate(subDays(date, 1))}>
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
            <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => setDate(addDays(date, 1))}>
              →
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {format(date, 'MMM d')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Filters */}
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Filter className="w-3.5 h-3.5" />
                Filters
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[320px] sm:w-[400px]">
              <SheetHeader>
                <SheetTitle>Filters & Guardrails</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <FiltersPanel settings={settings} onUpdate={updateSettings} />
              </div>
            </SheetContent>
          </Sheet>

          {/* Refresh */}
          <Button
            variant="default"
            size="sm"
            className="h-9 gap-1.5"
            onClick={refresh}
            disabled={isLoading || isFetchingPrices}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', (isLoading || isFetchingPrices) && 'animate-spin')} />
            Refresh
          </Button>
        </section>

        {/* Stats */}
        <section className="flex flex-wrap gap-4 text-sm" aria-label="Sports V2 stats">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Markets:</span>
            <span className="font-medium">{markets.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Matched:</span>
            <span className="font-medium">{matchedCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Priced:</span>
            <span className="font-medium">{pricedCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Opportunities:</span>
            <span className="font-bold text-primary">{tradePlans.length}</span>
          </div>
        </section>

        {/* API Diagnostics Panel */}
        <DiagnosticsPanel diagnostics={diagnostics} onClear={clearDiagnostics} rateLimiterStats={rateLimiterStats} />

        {/* Error */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {(isLoading || isFetchingPrices) && markets.length === 0 && !error && (
          <section className="space-y-3" aria-label="Sports V2 loading state">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <div className="grid grid-cols-2 gap-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Matched Markets */}
        {filteredMarkets.length > 0 && (
          <section className="space-y-4" aria-label="Matched markets list">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                Matched Markets ({filteredMarkets.filter((m) => m.polymarket).length} of {filteredMarkets.length})
              </h2>
              <div className="flex items-center gap-1">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'compact' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setViewMode('compact')}
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className={cn(
              "grid gap-3",
              viewMode === 'grid' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'
            )}>
              {filteredMarkets.map((market) => (
                <MarketCard key={market.kalshi.event_ticker} market={market} />
              ))}
            </div>
          </section>
        )}

        {/* Empty states */}
        {!isLoading && !isFetchingPrices && markets.length === 0 && !error && (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="font-semibold mb-2">No Sports Markets Found</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                No sports contracts found for this date. Try selecting a date closer to today.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Trade Plans */}
        {tradePlans.length > 0 && (
          <section className="space-y-4" aria-label="Locked arbitrage opportunities">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-chart-2">
              <Shield className="w-5 h-5" />
              Locked Arbitrage Opportunities ({tradePlans.length})
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {tradePlans.map((plan) => (
                <TradePlanCard key={plan.id} plan={plan} onOpenDrawer={() => {}} />
              ))}
            </div>
          </section>
        )}

        {/* Disclaimer */}
        <aside>
          <Card className="border-muted bg-muted/30">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Disclaimer</p>
                <p>
                  Informational analytics only. Not financial advice. Not an exchange or broker. Execution, compliance, and settlement responsibility remains with the user.
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
