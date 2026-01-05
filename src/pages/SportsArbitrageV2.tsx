import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MatchedMarket, useSportsArbitrageV2, SportType } from '@/hooks/useSportsArbitrageV2';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { TradePlanCard } from '@/components/sports-v2/TradePlanCard';
import { FiltersPanel } from '@/components/sports-v2/FiltersPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CalendarIcon,
  Filter,
  Info,
  RefreshCw,
  Search,
  Shield,
  Trophy,
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

function formatCents(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return '—';
  return `${Math.round(price * 100)}¢`;
}

function formatImplied(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return '—';
  return `${(price * 100).toFixed(1)}%`;
}

function formatDecimalOdds(price: number | null): string {
  if (price === null || !Number.isFinite(price) || price <= 0) return '—';
  return (1 / price).toFixed(2);
}

function MarketTitle({ market }: { market: MatchedMarket }) {
  const title = market.title;
  if (title) return <span className="truncate">{title}</span>;

  const raw = market.kalshi.event_ticker.replace(/^KX[A-Z]+GAME-/, '').replace(/-/g, ' ');
  return <span className="truncate">{raw}</span>;
}

export default function SportsArbitrageV2Page() {
  const { isAuthenticated, logout } = useAuth();
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
  } = useSportsArbitrageV2();

  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    document.title = 'Locked Sports Arbitrage Scanner V2 | Burby Capital';
    ensureMeta('description', 'Locked sports arbitrage scanner with real-time odds, guardrails, and copy-ready trade plans across platforms.');
    ensureCanonical(`${window.location.origin}/sports-v2`);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  const filteredMarkets = useMemo(() => {
    if (!searchQuery.trim()) return markets;
    const q = searchQuery.toLowerCase();
    return markets.filter((m) => (m.title ?? m.kalshi.event_ticker).toLowerCase().includes(q));
  }, [markets, searchQuery]);

  if (!isAuthenticated) return null;

  const matchedCount = markets.filter((m) => m.polymarket).length;
  const pricedCount = markets.filter((m) => m.kalshiPrice && m.polymarketPrice).length;

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

          {/* Status Badge */}
          <div className="flex items-center gap-2">
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

        {/* Error */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Matched Markets (always) */}
        {filteredMarkets.length > 0 && (
          <section className="space-y-4" aria-label="Matched markets list">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              Matched Markets ({filteredMarkets.filter((m) => m.polymarket).length} of {filteredMarkets.length})
            </h2>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMarkets.map((market) => {
                const aLabel = market.outcomeA ?? 'Outcome A';
                const bLabel = market.outcomeB ?? 'Outcome B';

                const kYes = market.kalshiPrice?.yesAsk ?? null;
                const kNo = market.kalshiPrice?.noAsk ?? null;
                const pYes = market.polymarketPrice?.yesAsk ?? null;
                const pNo = market.polymarketPrice?.noAsk ?? null;

                const expiryText = market.expiresAt ? format(new Date(market.expiresAt), 'MMM d, yyyy HH:mm') : null;

                return (
                  <Card
                    key={market.kalshi.event_ticker}
                    className={cn('transition-colors', market.polymarket ? 'border-chart-2/30' : 'border-muted')}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm truncate flex-1">
                          <MarketTitle market={market} />
                        </p>
                        <Badge variant={market.polymarket ? 'default' : 'secondary'} className="shrink-0 text-xs">
                          {market.polymarket ? 'Matched' : 'Kalshi Only'}
                        </Badge>
                      </div>

                      {expiryText && (
                        <p className="text-xs text-muted-foreground">Expires: {expiryText} UTC</p>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded bg-muted/50 space-y-1">
                          <p className="text-muted-foreground">Kalshi</p>
                          <p className="font-medium truncate">{aLabel}: {formatCents(kYes)} ({formatImplied(kYes)})</p>
                          <p className="font-medium truncate">{bLabel}: {formatCents(kNo)} ({formatImplied(kNo)})</p>
                          <p className="text-[10px] text-muted-foreground">Dec odds: {formatDecimalOdds(kYes)} / {formatDecimalOdds(kNo)}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/50 space-y-1">
                          <p className="text-muted-foreground">Polymarket</p>
                          <p className="font-medium truncate">{aLabel}: {formatCents(pYes)} ({formatImplied(pYes)})</p>
                          <p className="font-medium truncate">{bLabel}: {formatCents(pNo)} ({formatImplied(pNo)})</p>
                          <p className="text-[10px] text-muted-foreground">Dec odds: {formatDecimalOdds(pYes)} / {formatDecimalOdds(pNo)}</p>
                        </div>
                      </div>

                      {(market.kalshiError || market.polymarketError) && (
                        <div className="space-y-1">
                          {market.kalshiError && <p className="text-xs text-destructive">Kalshi: {market.kalshiError}</p>}
                          {market.polymarketError && <p className="text-xs text-destructive">Polymarket: {market.polymarketError}</p>}
                        </div>
                      )}

                      {!market.pricesFetched && market.polymarket && <Skeleton className="h-10" />}
                    </CardContent>
                  </Card>
                );
              })}
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
