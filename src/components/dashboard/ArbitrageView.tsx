import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useArbitrage } from '@/hooks/useArbitrage';
import { useMarkets } from '@/contexts/MarketsContext';
import { useWatchlist } from '@/hooks/useWatchlist';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArbitrageOpportunity, CrossPlatformMatch } from '@/types/dome';
import { formatCents, formatProfitPercent } from '@/lib/arbitrage-matcher';
import { MatchDetailsPanel } from './MatchDetailsPanel';
import { ExternalLink, TrendingUp, AlertCircle, Target, Clock, RefreshCw, Zap, Timer, ArrowUpDown, Calculator, Search, CheckCircle2, ArrowRight, DollarSign, Percent, Sparkles, AlertTriangle, Copy, Check, Star, Filter, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

type SortOption = 'profit' | 'expiration' | 'freshness';

// Platform icon components
function PolymarketIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <div className={`${className} rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-[8px]`}>
      P
    </div>
  );
}

function KalshiIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <div className={`${className} rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-[8px]`}>
      K
    </div>
  );
}

// Helper to format age in human-readable format
function formatAge(date: Date | undefined | null): string {
  if (!date) return 'never';
  const ageMs = Date.now() - date.getTime();
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

// Helper to get freshness color class
function getFreshnessColor(date: Date | undefined | null, maxAgeSeconds: number): string {
  if (!date) return 'text-destructive';
  const ageSeconds = (Date.now() - date.getTime()) / 1000;
  if (ageSeconds <= maxAgeSeconds * 0.5) return 'text-chart-4';
  if (ageSeconds <= maxAgeSeconds) return 'text-amber-500';
  return 'text-destructive';
}

// Freshness indicator with dots
function FreshnessIndicator({ 
  polymarket, 
  kalshi, 
  maxAgeSeconds 
}: { 
  polymarket: Date | undefined | null; 
  kalshi: Date | undefined | null;
  maxAgeSeconds: number;
}) {
  return (
    <div className="flex items-center gap-3 text-[10px]">
      <div className="flex items-center gap-1.5">
        <PolymarketIcon className="w-3 h-3" />
        <span className={getFreshnessColor(polymarket, maxAgeSeconds)}>
          {formatAge(polymarket)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <KalshiIcon className="w-3 h-3" />
        <span className={getFreshnessColor(kalshi, maxAgeSeconds)}>
          {formatAge(kalshi)}
        </span>
      </div>
    </div>
  );
}


function ArbitrageCard({ 
  opportunity, 
  maxAgeSeconds, 
  isStale = false,
  isWatchlisted = false,
  onToggleWatchlist
}: { 
  opportunity: ArbitrageOpportunity; 
  maxAgeSeconds: number; 
  isStale?: boolean;
  isWatchlisted?: boolean;
  onToggleWatchlist?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedTicker, setCopiedTicker] = useState<string | null>(null);
  const { match, buyYesOn, buyNoOn, yesPlatformPrice, noPlatformPrice, combinedCost, profitPercent, profitPerDollar, expirationDate } = opportunity;
  
  const polymarketUrl = match.polymarket.marketSlug 
    ? `https://polymarket.com/event/${match.polymarket.eventSlug}` 
    : '#';
  const kalshiUrl = match.kalshi.kalshiEventTicker 
    ? `https://kalshi.com/markets/${match.kalshi.kalshiEventTicker}`
    : '#';

  // Get the outcome labels for each side of the trade
  const yesMarket = buyYesOn === 'KALSHI' ? match.kalshi : match.polymarket;
  const noMarket = buyNoOn === 'KALSHI' ? match.kalshi : match.polymarket;
  const yesOutcomeLabel = yesMarket.sideA.label || 'Yes';
  const noOutcomeLabel = noMarket.sideB.label || 'No';

  const copyTicker = (ticker: string, platform: string) => {
    navigator.clipboard.writeText(ticker).then(() => {
      setCopiedTicker(ticker);
      toast.success(`${platform} ticker copied!`);
      setTimeout(() => setCopiedTicker(null), 2000);
    });
  };

  const copyTradePlan = () => {
    const tradePlan = `📈 ARBITRAGE TRADE PLAN
━━━━━━━━━━━━━━━━━━━━━━━

📋 POLYMARKET CONTRACT
   Name: ${match.polymarket.title}
   Slug: ${match.polymarket.marketSlug || 'N/A'}
   Link: ${polymarketUrl}

📋 KALSHI CONTRACT
   Name: ${match.kalshi.title}
   Ticker: ${match.kalshi.kalshiMarketTicker || 'N/A'}
   Link: ${kalshiUrl}

📊 STEP 1: Buy ${yesOutcomeLabel.toUpperCase()} on ${buyYesOn === 'KALSHI' ? 'Kalshi' : 'Polymarket'}
   Contract: ${buyYesOn === 'KALSHI' ? match.kalshi.title : match.polymarket.title}
   Outcome: ${yesOutcomeLabel}
   Price: ${formatCents(yesPlatformPrice)}

📊 STEP 2: Buy ${noOutcomeLabel.toUpperCase()} on ${buyNoOn === 'KALSHI' ? 'Kalshi' : 'Polymarket'}
   Contract: ${buyNoOn === 'KALSHI' ? match.kalshi.title : match.polymarket.title}
   Outcome: ${noOutcomeLabel}
   Price: ${formatCents(noPlatformPrice)}

💰 PROFIT SUMMARY
   Total Cost: ${formatCents(combinedCost)}
   Guaranteed Payout: $1.00
   Profit: +${formatProfitPercent(profitPercent)} (+$${profitPerDollar.toFixed(3)}/contract)

⏰ Expires: ${expirationDate.toLocaleString()}
`;
    
    navigator.clipboard.writeText(tradePlan).then(() => {
      setCopied(true);
      toast.success('Trade plan copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Determine profit tier for color coding
  const getProfitGradient = (percent: number) => {
    if (percent >= 5) return 'from-green-500/20 via-emerald-500/10 to-transparent';
    if (percent >= 2) return 'from-green-500/15 via-emerald-500/5 to-transparent';
    return 'from-green-500/10 to-transparent';
  };

  const getProfitBadgeStyle = (percent: number) => {
    if (percent >= 5) return 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/25';
    if (percent >= 2) return 'bg-gradient-to-r from-green-500/90 to-emerald-600/90 text-white';
    return 'bg-green-500/80 text-white';
  };
  
  return (
    <Card className={`border-chart-4/40 bg-gradient-to-br ${getProfitGradient(profitPercent)} hover:border-chart-4/60 transition-all duration-200 overflow-hidden ${isStale ? 'opacity-70' : ''}`}>
      {/* Profit Header Bar */}
      <div className={`bg-gradient-to-r ${isStale ? 'from-amber-500/20' : 'from-chart-4/10'} to-transparent px-3 sm:px-4 py-2 border-b ${isStale ? 'border-amber-500/30' : 'border-chart-4/20'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isStale && (
              <Badge variant="outline" className="border-amber-500/50 text-amber-500 text-[10px] px-1.5 py-0">
                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                STALE
              </Badge>
            )}
            <Badge className={`${getProfitBadgeStyle(profitPercent)} text-xs sm:text-sm px-2 sm:px-3 py-1`}>
              <Sparkles className="w-3 h-3 mr-1" />
              +{formatProfitPercent(profitPercent)}
            </Badge>
          </div>
          <FreshnessIndicator 
            polymarket={match.polymarket.lastPriceUpdatedAt} 
            kalshi={match.kalshi.lastPriceUpdatedAt}
            maxAgeSeconds={maxAgeSeconds}
          />
        </div>
      </div>
      
      <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
        {/* Contract Details Section */}
        <div className="space-y-2">
          {/* Polymarket Contract */}
          <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <PolymarketIcon className="w-3.5 h-3.5" />
              <span className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">Polymarket</span>
            </div>
            <p className="text-xs sm:text-sm font-medium leading-tight line-clamp-2 mb-1.5">
              {match.polymarket.title}
            </p>
            {match.polymarket.marketSlug && (
              <button 
                onClick={() => copyTicker(match.polymarket.marketSlug!, 'Polymarket')}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors bg-muted px-1.5 py-0.5 rounded"
              >
                {copiedTicker === match.polymarket.marketSlug ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                <span className="font-mono truncate max-w-[150px] sm:max-w-[200px]">{match.polymarket.marketSlug}</span>
              </button>
            )}
          </div>
          
          {/* Kalshi Contract */}
          <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <KalshiIcon className="w-3.5 h-3.5" />
              <span className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">Kalshi</span>
            </div>
            <p className="text-xs sm:text-sm font-medium leading-tight line-clamp-2 mb-1.5">
              {match.kalshi.title}
            </p>
            {match.kalshi.kalshiMarketTicker && (
              <button 
                onClick={() => copyTicker(match.kalshi.kalshiMarketTicker!, 'Kalshi')}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors bg-muted px-1.5 py-0.5 rounded"
              >
                {copiedTicker === match.kalshi.kalshiMarketTicker ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                <span className="font-mono">{match.kalshi.kalshiMarketTicker}</span>
              </button>
            )}
          </div>
        </div>
        
        {/* Trade Steps - Mobile Optimized */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          {/* Step 1 */}
          <div className="flex items-start gap-3 p-2.5 sm:p-3 rounded-xl bg-card border border-border">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-chart-4/20 flex items-center justify-center">
                <span className="text-xs sm:text-sm font-bold text-chart-4">1</span>
              </div>
              {buyYesOn === 'KALSHI' ? <KalshiIcon className="w-4 h-4 sm:w-5 sm:h-5" /> : <PolymarketIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">Buy {yesOutcomeLabel} on {buyYesOn === 'KALSHI' ? 'Kalshi' : 'Polymarket'}</p>
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mt-0.5">
                {buyYesOn === 'KALSHI' ? match.kalshi.title : match.polymarket.title}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg sm:text-2xl font-bold text-chart-4">{formatCents(yesPlatformPrice)}</p>
            </div>
          </div>
          
          {/* Step 2 */}
          <div className="flex items-start gap-3 p-2.5 sm:p-3 rounded-xl bg-card border border-border">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-chart-4/20 flex items-center justify-center">
                <span className="text-xs sm:text-sm font-bold text-chart-4">2</span>
              </div>
              {buyNoOn === 'KALSHI' ? <KalshiIcon className="w-4 h-4 sm:w-5 sm:h-5" /> : <PolymarketIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">Buy {noOutcomeLabel} on {buyNoOn === 'KALSHI' ? 'Kalshi' : 'Polymarket'}</p>
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mt-0.5">
                {buyNoOn === 'KALSHI' ? match.kalshi.title : match.polymarket.title}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg sm:text-2xl font-bold text-chart-4">{formatCents(noPlatformPrice)}</p>
            </div>
          </div>
        </div>
        
        {/* Profit Summary Visual */}
        <div className="p-3 rounded-xl bg-gradient-to-r from-muted/80 to-muted/40 border border-border/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Total Cost:</span>
              <span className="font-bold">{formatCents(combinedCost)}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-chart-4" />
              <span className="text-muted-foreground">Payout:</span>
              <span className="font-bold text-chart-4">$1.00</span>
            </div>
          </div>
          {/* Visual profit bar */}
          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-chart-4 to-emerald-400 rounded-full"
              style={{ width: `${Math.min(100, (1 - combinedCost) * 100 + 50)}%` }}
            />
          </div>
          <div className="mt-2 text-center">
            <span className="text-chart-4 font-bold text-sm sm:text-base">
              +${profitPerDollar.toFixed(3)} profit per contract
            </span>
          </div>
        </div>
        
        {/* Footer Actions - Mobile Optimized */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{format(expirationDate, "MMM d, h:mm a")}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{Math.round(match.matchScore * 100)}% match</span>
          </div>
          
          {/* Action Buttons - Stack on mobile */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="ghost" size="sm" asChild className="h-8 px-2.5 text-xs flex-1 sm:flex-none min-w-0">
              <a href={kalshiUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1">
                <KalshiIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Kalshi</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild className="h-8 px-2.5 text-xs flex-1 sm:flex-none min-w-0">
              <a href={polymarketUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1">
                <PolymarketIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Poly</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 px-2.5 text-xs"
              onClick={copyTradePlan}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </Button>
            <Button 
              variant={isWatchlisted ? "default" : "outline"}
              size="sm" 
              className={`h-8 px-2.5 text-xs ${isWatchlisted ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
              onClick={onToggleWatchlist}
            >
              <Star className={`w-3 h-3 ${isWatchlisted ? 'fill-current' : ''}`} />
            </Button>
            <Link to={`/calculator?kalshi=${Math.round(yesPlatformPrice * 100)}&poly=${Math.round(noPlatformPrice * 100)}`} className="flex-1 sm:flex-none">
              <Button variant="secondary" size="sm" className="h-8 px-3 text-xs font-medium w-full">
                <Calculator className="w-3 h-3 mr-1" />
                <span className="hidden xs:inline">Calculate</span>
                <span className="xs:hidden">Calc</span>
              </Button>
            </Link>
          </div>
          
          {/* Match Details Panel */}
          <MatchDetailsPanel match={match} />
        </div>
      </CardContent>
    </Card>
  );
}

function MatchCard({ match, maxAgeSeconds }: { match: CrossPlatformMatch; maxAgeSeconds: number }) {
  const polyYes = match.polymarket.sideA.probability ?? 0;
  const polyNo = match.polymarket.sideB.probability ?? 0;
  const kalshiYes = match.kalshi.sideA.probability ?? 0;
  const kalshiNo = match.kalshi.sideB.probability ?? 0;
  
  const polyHasRealPrice = match.polymarket.lastPriceUpdatedAt !== null;
  const kalshiHasRealPrice = match.kalshi.lastPriceUpdatedAt !== null;
  
  const cost1 = kalshiYes + polyNo;
  const cost2 = polyYes + kalshiNo;
  
  const hasArbitrage = polyHasRealPrice && kalshiHasRealPrice && (cost1 < 1 || cost2 < 1);
  const hasMissingPrices = !polyHasRealPrice || !kalshiHasRealPrice;
  
  return (
    <Card className={`transition-all ${hasArbitrage ? 'border-chart-4/50 bg-chart-4/5' : hasMissingPrices ? 'border-amber-500/30 bg-amber-500/5' : 'hover:border-border/80'}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="font-medium text-xs sm:text-sm line-clamp-2 flex-1">{match.polymarket.title}</p>
          <Badge variant="secondary" className="shrink-0 text-[10px] sm:text-xs">
            {Math.round(match.matchScore * 100)}%
          </Badge>
        </div>
        
        {hasMissingPrices && (
          <div className="mb-2.5 p-2 rounded-lg bg-amber-500/10 text-[10px] sm:text-xs text-amber-600 flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span className="line-clamp-1">
              {!polyHasRealPrice && !kalshiHasRealPrice 
                ? 'Awaiting prices'
                : !polyHasRealPrice 
                ? 'Awaiting Polymarket' 
                : 'Kalshi: no trades'}
            </span>
          </div>
        )}
        
        {!hasMissingPrices && (
          <div className="mb-2.5">
            <FreshnessIndicator 
              polymarket={match.polymarket.lastPriceUpdatedAt} 
              kalshi={match.kalshi.lastPriceUpdatedAt}
              maxAgeSeconds={maxAgeSeconds}
            />
          </div>
        )}
        
        {/* Compact price grid */}
        <div className="grid grid-cols-2 gap-2 text-[10px] sm:text-xs">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1.5 mb-1">
              <PolymarketIcon className="w-3 h-3" />
              <span className="text-muted-foreground font-medium">Polymarket</span>
            </div>
            <div className={`flex gap-2 ${!polyHasRealPrice ? 'opacity-50' : ''}`}>
              <span>Y: <span className="font-semibold">{formatCents(polyYes)}</span></span>
              <span>N: <span className="font-semibold">{formatCents(polyNo)}</span></span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1.5 mb-1">
              <KalshiIcon className="w-3 h-3" />
              <span className="text-muted-foreground font-medium">Kalshi</span>
            </div>
            <div className={`flex gap-2 ${!kalshiHasRealPrice ? 'opacity-50' : ''}`}>
              <span>Y: <span className="font-semibold">{formatCents(kalshiYes)}</span></span>
              <span>N: <span className="font-semibold">{formatCents(kalshiNo)}</span></span>
            </div>
          </div>
        </div>
        
        {polyHasRealPrice && kalshiHasRealPrice && (
          <div className="mt-2.5 pt-2.5 border-t border-border/50 flex justify-between text-[10px] sm:text-xs">
            <span className={cost1 < 1 ? 'text-chart-4 font-semibold' : 'text-muted-foreground'}>
              K+P: {formatCents(cost1)}
            </span>
            <span className={cost2 < 1 ? 'text-chart-4 font-semibold' : 'text-muted-foreground'}>
              P+K: {formatCents(cost2)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ArbitrageView() {
  const { 
    freshOpportunities, 
    staleOpportunities,
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
    updateSettings,
  } = useArbitrage();
  
  const { refreshKalshiPrices, isRefreshingKalshi, lastKalshiRefresh, summary } = useMarkets();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const [sortBy, setSortBy] = useState<SortOption>('profit');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Filter and sort opportunities
  const displayOpportunities = useMemo(() => {
    let all = settings.showStaleOpportunities 
      ? [...freshOpportunities, ...staleOpportunities]
      : freshOpportunities;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      all = all.filter(opp => 
        opp.match.polymarket.title.toLowerCase().includes(query) ||
        opp.match.kalshi.title.toLowerCase().includes(query) ||
        opp.match.polymarket.marketSlug?.toLowerCase().includes(query) ||
        opp.match.kalshi.kalshiMarketTicker?.toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    switch (sortBy) {
      case 'profit':
        return all.sort((a, b) => b.profitPercent - a.profitPercent);
      case 'expiration':
        return all.sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());
      case 'freshness':
        return all.sort((a, b) => {
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
        return all;
    }
  }, [freshOpportunities, staleOpportunities, settings.showStaleOpportunities, sortBy, searchQuery]);
  
  // Track which opportunities are stale for badge display
  const staleIds = useMemo(() => new Set(staleOpportunities.map(o => o.id)), [staleOpportunities]);
  
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
    <div className="space-y-4 sm:space-y-6">
      {/* Scan Coverage Header - More Visual */}
      <Card className="border-border bg-gradient-to-r from-muted/50 to-muted/20 overflow-hidden">
        <CardContent className="p-3 sm:py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Platform Stats */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 border border-border/50">
                <PolymarketIcon className="w-4 h-4" />
                <span className="font-mono text-sm font-semibold">{summary.polymarketCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 border border-border/50">
                <KalshiIcon className="w-4 h-4" />
                <span className="font-mono text-sm font-semibold">{summary.kalshiCount.toLocaleString()}</span>
              </div>
            </div>
            
            {/* Match Stats */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-chart-4/10 border border-chart-4/30">
                <Target className="w-4 h-4 text-chart-4" />
                <span className="font-mono text-sm font-semibold text-chart-4">{summary.matchedMarkets} matched</span>
              </div>
              {matchesAwaitingPrices > 0 && (
                <div className="flex items-center gap-1.5 text-amber-500 text-xs">
                  <Timer className="w-3.5 h-3.5 animate-pulse" />
                  <span>{matchesWithValidPrices}/{matches.length} live</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter Bar */}
      <Card className="border-border bg-card">
        <CardContent className="p-3 sm:p-4 space-y-3">
          {/* Search and Toggle Row */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search markets, tickers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                className="h-9"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-3.5 h-3.5 mr-1.5" />
                Filters
                {(settings.minProfitPercent > 0 || settings.showStaleOpportunities) && (
                  <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px] bg-chart-4/20 text-chart-4">
                    {(settings.minProfitPercent > 0 ? 1 : 0) + (settings.showStaleOpportunities ? 1 : 0)}
                  </Badge>
                )}
              </Button>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[130px] sm:w-[150px] h-9 text-xs">
                  <ArrowUpDown className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profit">Highest Profit</SelectItem>
                  <SelectItem value="expiration">Soonest Expiry</SelectItem>
                  <SelectItem value="freshness">Most Fresh</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Expandable Filters */}
          {showFilters && (
            <div className="pt-3 border-t border-border space-y-4">
              {/* Min Profit Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Minimum Profit</Label>
                  <span className="text-sm font-mono font-semibold text-chart-4">
                    {settings.minProfitPercent.toFixed(1)}%
                  </span>
                </div>
                <Slider
                  value={[settings.minProfitPercent]}
                  onValueChange={([value]) => updateSettings({ minProfitPercent: value })}
                  min={0}
                  max={10}
                  step={0.1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Only show opportunities with profit ≥ {settings.minProfitPercent}%
                  {lowProfitCount > 0 && (
                    <span className="text-amber-500"> ({lowProfitCount} hidden)</span>
                  )}
                </p>
              </div>
              
              {/* Stale Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Show Stale Opportunities</Label>
                  <p className="text-xs text-muted-foreground">
                    Include opportunities with older prices
                    {staleCount > 0 && !settings.showStaleOpportunities && (
                      <span className="text-amber-500"> ({staleCount} hidden)</span>
                    )}
                  </p>
                </div>
                <Switch
                  checked={settings.showStaleOpportunities}
                  onCheckedChange={(checked) => updateSettings({ showStaleOpportunities: checked })}
                />
              </div>
              
              {/* Max Age Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Max Price Age</Label>
                  <span className="text-sm font-mono">
                    {settings.maxAgeSeconds < 60 
                      ? `${settings.maxAgeSeconds}s`
                      : `${Math.floor(settings.maxAgeSeconds / 60)}m${settings.maxAgeSeconds % 60 > 0 ? ` ${settings.maxAgeSeconds % 60}s` : ''}`
                    }
                  </span>
                </div>
                <Slider
                  value={[settings.maxAgeSeconds]}
                  onValueChange={([value]) => updateSettings({ maxAgeSeconds: value })}
                  min={30}
                  max={600}
                  step={30}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Prices older than this are considered stale
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Stats Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* Opportunity Count with Visual */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${displayOpportunities.length > 0 ? 'bg-chart-4/20' : 'bg-muted'}`}>
              <Sparkles className={`w-4 h-4 ${displayOpportunities.length > 0 ? 'text-chart-4' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Showing</p>
              <div className="flex items-baseline gap-1">
                <p className={`text-lg font-bold leading-none ${displayOpportunities.length > 0 ? 'text-chart-4' : 'text-muted-foreground'}`}>
                  {displayOpportunities.length}
                </p>
                {searchQuery && (
                  <span className="text-xs text-muted-foreground">of {freshOpportunities.length + (settings.showStaleOpportunities ? staleOpportunities.length : 0)}</span>
                )}
                {settings.showStaleOpportunities && staleOpportunities.length > 0 && !searchQuery && (
                  <span className="text-xs text-amber-500">({staleOpportunities.length} stale)</span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={refreshKalshiPrices}
          disabled={isRefreshingKalshi}
          className="h-9 self-start sm:self-center"
        >
          <Zap className={`w-3.5 h-3.5 mr-1.5 ${isRefreshingKalshi ? 'animate-pulse text-chart-4' : ''}`} />
          Refresh Prices
          {lastKalshiRefresh && (
            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">
              {formatAge(lastKalshiRefresh)}
            </Badge>
          )}
        </Button>
      </div>
      
      {/* Arbitrage Opportunities */}
      {displayOpportunities.length > 0 ? (
        <div className="grid gap-3 sm:gap-4">
          {displayOpportunities.map(opp => (
            <ArbitrageCard 
              key={opp.id} 
              opportunity={opp} 
              maxAgeSeconds={settings.maxAgeSeconds} 
              isStale={staleIds.has(opp.id)}
              isWatchlisted={isInWatchlist(opp.match.polymarket.conditionId, opp.match.kalshi.kalshiMarketTicker)}
              onToggleWatchlist={() => toggleWatchlist(
                opp.match.polymarket.conditionId,
                opp.match.kalshi.kalshiMarketTicker,
                opp.match.matchScore,
                opp.match.polymarket.title
              )}
            />
          ))}
        </div>
      ) : staleCount > 0 && !settings.showStaleOpportunities ? (
        <Card className="border-dashed border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="py-8 sm:py-12 text-center px-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            <h3 className="text-base sm:text-lg font-semibold mb-2">Waiting for Fresh Prices</h3>
            <p className="text-muted-foreground text-xs sm:text-sm max-w-md mx-auto mb-4">
              Found {staleCount} potential {staleCount === 1 ? 'opportunity' : 'opportunities'}. Prices need refresh.
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshKalshiPrices}
              disabled={isRefreshingKalshi}
            >
              <Zap className={`w-3.5 h-3.5 mr-1.5 ${isRefreshingKalshi ? 'animate-pulse' : ''}`} />
              Refresh Now
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-muted-foreground/20 bg-gradient-to-br from-muted/30 to-transparent">
          <CardContent className="py-10 sm:py-16 text-center px-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-full bg-muted/80 flex items-center justify-center">
              <Search className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold mb-2">No Opportunities Yet</h3>
            <p className="text-muted-foreground text-xs sm:text-sm max-w-sm mx-auto mb-5">
              {summary.matchedMarkets > 0 
                ? `Monitoring ${summary.matchedMarkets} pairs for price gaps...`
                : 'Start scanning to find arbitrage opportunities.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
              <Link to="/calculator">
                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  <Calculator className="w-4 h-4 mr-2" />
                  Trade Calculator
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Matched Contracts Section */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Target className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              Matched Contracts
              <Badge variant="secondary" className="ml-1">
                {matches.length}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden sm:inline">
                {matchesWithValidPrices} priced • {matchesAwaitingPrices} awaiting
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {matches.length > 0 ? (
            <div className="grid gap-2 sm:gap-3 md:grid-cols-2 lg:grid-cols-3">
              {matches.map((match) => (
                <MatchCard 
                  key={`${match.polymarket.id}-${match.kalshi.id}`}
                  match={match} 
                  maxAgeSeconds={settings.maxAgeSeconds}
                />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                <Search className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                No matched contracts found yet. Start discovery to find cross-platform pairs.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
