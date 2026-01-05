import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSportsArbitrageV2, SportType } from '@/hooks/useSportsArbitrageV2';
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
  RefreshCw, 
  AlertCircle,
  Trophy,
  Search,
  CalendarIcon,
  Filter,
  Zap,
  ZapOff,
  Shield,
  Info,
} from 'lucide-react';
import { format, addDays, subDays, startOfToday } from 'date-fns';

const SPORT_LABELS: Record<SportType, string> = {
  nfl: 'NFL',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
  cfb: 'College Football',
  cbb: 'College Basketball',
};

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
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  const matchedCount = markets.filter(m => m.polymarket).length;
  const pricedCount = markets.filter(m => m.kalshiPrice && m.polymarketPrice).length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onLogout={logout} />
      
      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-semibold">Locked Sports Arbitrage Scanner</h2>
              <p className="text-sm text-muted-foreground">Production-quality locked arbitrage detection</p>
            </div>
          </div>
          
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={cn(
                "gap-1.5",
                isLive 
                  ? "border-green-500 text-green-500" 
                  : "border-muted-foreground text-muted-foreground"
              )}
            >
              {isLive ? <Zap className="w-3 h-3" /> : <ZapOff className="w-3 h-3" />}
              {isLive ? 'Live' : 'Stale'}
            </Badge>
            {lastRefresh && (
              <span className="text-xs text-muted-foreground">
                Updated {format(lastRefresh, 'HH:mm:ss')}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sport Select */}
          <Select value={sport} onValueChange={(v) => setSport(v as SportType)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border">
              {Object.entries(SPORT_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2"
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
              className="h-9 px-2"
              onClick={() => setDate(addDays(date, 1))}
            >
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
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
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
            <RefreshCw className={cn("w-3.5 h-3.5", (isLoading || isFetchingPrices) && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Stats Bar */}
        <div className="flex flex-wrap gap-4 text-sm">
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
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {(isLoading || isFetchingPrices) && tradePlans.length === 0 && (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[300px] w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isFetchingPrices && tradePlans.length === 0 && !error && (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">No Locked Arbitrage Found</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                No qualifying locked arbitrage opportunities at this time. 
                Opportunities must pass all guardrails including freshness, liquidity, and mapping validation.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Trade Plans Grid */}
        {tradePlans.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {tradePlans.map((plan) => (
              <TradePlanCard 
                key={plan.id} 
                plan={plan} 
                onOpenDrawer={() => {}}
              />
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <Card className="border-muted bg-muted/30">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Disclaimer</p>
              <p>
                Informational analytics only. Not financial advice. Not an exchange or broker. 
                Execution, compliance, and settlement responsibility remains with the user.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
