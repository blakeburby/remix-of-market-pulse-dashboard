import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { useArbitrage } from '@/hooks/useArbitrage';
import { useMarkets } from '@/contexts/MarketsContext';
import { useWatchlist } from '@/hooks/useWatchlist';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious,
  PaginationEllipsis 
} from '@/components/ui/pagination';
import { ArbitrageOpportunity, CrossPlatformMatch } from '@/types/dome';
import { formatCents, formatProfitPercent } from '@/lib/arbitrage-matcher';
import { MatchDetailsPanel } from './MatchDetailsPanel';
import { PriceFlash } from './PriceFlash';
import { TradeFlowDiagram } from './TradeFlowDiagram';
import { OutcomeScenarios } from './OutcomeScenarios';
import { MiniCalculator } from './MiniCalculator';
import { ExternalLink, TrendingUp, AlertCircle, Target, Clock, RefreshCw, Zap, Timer, ArrowUpDown, Calculator, Search, CheckCircle2, ArrowRight, DollarSign, Percent, Sparkles, AlertTriangle, Copy, Check, Star, Filter, X, ChevronDown, ChevronUp, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

type SortOption = 'profit' | 'expiration' | 'freshness';

// Platform icon components with forwardRef for tooltip compatibility
const PolymarketIcon = React.forwardRef<HTMLDivElement, { className?: string }>(
  ({ className = "w-4 h-4" }, ref) => (
    <div 
      ref={ref}
      className={`${className} rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-[8px]`}
    >
      P
    </div>
  )
);
PolymarketIcon.displayName = 'PolymarketIcon';

const KalshiIcon = React.forwardRef<HTMLDivElement, { className?: string }>(
  ({ className = "w-4 h-4" }, ref) => (
    <div 
      ref={ref}
      className={`${className} rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-[8px]`}
    >
      K
    </div>
  )
);
KalshiIcon.displayName = 'KalshiIcon';

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

// Freshness indicator with dots - memoized to prevent re-renders
const FreshnessIndicator = memo(function FreshnessIndicator({ 
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
});

// Isolated countdown component - only this re-renders every second
const RefreshCountdown = memo(function RefreshCountdown({ 
  enabled, 
  intervalSeconds,
  matchCount
}: { 
  enabled: boolean; 
  intervalSeconds: number;
  matchCount: number;
}) {
  const [countdown, setCountdown] = useState(intervalSeconds);
  
  useEffect(() => {
    if (!enabled || matchCount === 0) {
      setCountdown(0);
      return;
    }
    
    setCountdown(intervalSeconds);
    const timer = setInterval(() => {
      setCountdown(prev => prev <= 1 ? intervalSeconds : prev - 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [enabled, intervalSeconds, matchCount]);
  
  if (!enabled || countdown <= 0) return null;
  
  return (
    <Badge variant="secondary" className="text-xs px-2 py-1">
      <RefreshCw className="w-3 h-3 mr-1" />
      {countdown}s
    </Badge>
  );
});

// Get profit tier label and icon
function getProfitTier(percent: number): { label: string; icon: React.ReactNode; className: string } {
  if (percent >= 5) return { 
    label: 'High Yield', 
    icon: <Flame className="w-3 h-3" />, 
    className: 'text-chart-4 bg-chart-4/10 border-chart-4/30' 
  };
  if (percent >= 2) return { 
    label: 'Good', 
    icon: <CheckCircle2 className="w-3 h-3" />, 
    className: 'text-chart-4 bg-chart-4/10 border-chart-4/20' 
  };
  return { 
    label: 'Marginal', 
    icon: <TrendingUp className="w-3 h-3" />, 
    className: 'text-muted-foreground bg-muted/50 border-border/50' 
  };
}

// Memoized ArbitrageCard - only re-renders when its specific data changes
interface ArbitrageCardProps {
  opportunity: ArbitrageOpportunity;
  maxAgeSeconds: number;
  isStale?: boolean;
  isWatchlisted?: boolean;
  onToggleWatchlist?: () => void;
}

const ArbitrageCard = memo(function ArbitrageCard({ 
  opportunity, 
  maxAgeSeconds, 
  isStale = false,
  isWatchlisted = false,
  onToggleWatchlist
}: ArbitrageCardProps) {
  const [copied, setCopied] = useState(false);
  const [copiedTicker, setCopiedTicker] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
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
  
  const profitTier = getProfitTier(profitPercent);

  const copyTicker = useCallback((ticker: string, platform: string) => {
    navigator.clipboard.writeText(ticker).then(() => {
      setCopiedTicker(ticker);
      toast.success(`${platform} ticker copied!`);
      setTimeout(() => setCopiedTicker(null), 2000);
    });
  }, []);

  // Enhanced markdown trade plan
  const copyTradePlan = useCallback(() => {
    const tradePlan = `## 🎯 Arbitrage Opportunity

**Event:** ${match.polymarket.title}

---

### Trade Instructions

| Platform | Action | Outcome | Price |
|----------|--------|---------|-------|
| ${buyYesOn === 'POLYMARKET' ? 'Polymarket' : 'Kalshi'} | Buy | "${yesOutcomeLabel}" | ${formatCents(yesPlatformPrice)} |
| ${buyNoOn === 'POLYMARKET' ? 'Polymarket' : 'Kalshi'} | Buy | "${noOutcomeLabel}" | ${formatCents(noPlatformPrice)} |

---

### Profit Breakdown

- **Combined cost:** ${formatCents(combinedCost)}
- **Guaranteed payout:** $1.00
- **Net profit:** +${formatProfitPercent(profitPercent)} (+$${profitPerDollar.toFixed(3)} per contract)

---

### Why This Works

Regardless of outcome:
- If "${yesOutcomeLabel}" wins → Your Yes position pays $1.00, No expires worthless
- If "${noOutcomeLabel}" wins → Your No position pays $1.00, Yes expires worthless

Either way, you collect $1.00 for ${formatCents(combinedCost)} invested = **${formatProfitPercent(profitPercent)} profit**

---

### Quick Links

- [Open Polymarket](${polymarketUrl})
- [Open Kalshi](${kalshiUrl})

---

### Contract Details

**Polymarket:**
- Title: ${match.polymarket.title}
- Slug: \`${match.polymarket.marketSlug || 'N/A'}\`

**Kalshi:**
- Title: ${match.kalshi.title}
- Ticker: \`${match.kalshi.kalshiMarketTicker || 'N/A'}\`

**Expiration:** ${format(expirationDate, "MMMM d, yyyy 'at' h:mm a")}
**Match Confidence:** ${Math.round(match.matchScore * 100)}%

---

*Generated by Dome Watch*
`;
    
    navigator.clipboard.writeText(tradePlan).then(() => {
      setCopied(true);
      toast.success('Trade plan copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [match, polymarketUrl, kalshiUrl, yesOutcomeLabel, noOutcomeLabel, buyYesOn, buyNoOn, yesPlatformPrice, noPlatformPrice, combinedCost, profitPercent, profitPerDollar, expirationDate]);

  // Open both platforms simultaneously
  const openBothPlatforms = useCallback(() => {
    window.open(polymarketUrl, '_blank');
    window.open(kalshiUrl, '_blank');
  }, [polymarketUrl, kalshiUrl]);

  // Determine profit tier for color coding
  const getProfitGradient = (percent: number) => {
    if (percent >= 5) return 'from-chart-4/20 via-emerald-500/10 to-transparent';
    if (percent >= 2) return 'from-chart-4/15 via-emerald-500/5 to-transparent';
    return 'from-chart-4/10 to-transparent';
  };

  const getProfitBadgeStyle = (percent: number) => {
    if (percent >= 5) return 'bg-gradient-to-r from-chart-4 to-emerald-600 text-white shadow-lg shadow-chart-4/25';
    if (percent >= 2) return 'bg-gradient-to-r from-chart-4/90 to-emerald-600/90 text-white';
    return 'bg-chart-4/80 text-white';
  };
  
  return (
    <Card className={`border-chart-4/40 bg-gradient-to-br ${getProfitGradient(profitPercent)} hover:border-chart-4/60 transition-all duration-200 overflow-hidden ${isStale ? 'opacity-70' : ''}`}>
      {/* Profit Header Bar */}
      <div className={`bg-gradient-to-r ${isStale ? 'from-amber-500/20' : 'from-chart-4/10'} to-transparent px-3 sm:px-4 py-2.5 border-b ${isStale ? 'border-amber-500/30' : 'border-chart-4/20'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
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
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${profitTier.className}`}>
              {profitTier.icon}
              <span className="ml-1">{profitTier.label}</span>
            </Badge>
          </div>
          <FreshnessIndicator 
            polymarket={match.polymarket.lastPriceUpdatedAt} 
            kalshi={match.kalshi.lastPriceUpdatedAt}
            maxAgeSeconds={maxAgeSeconds}
          />
        </div>
      </div>
      
      <CardContent className="p-3 sm:p-4 space-y-4">
        {/* Event Title */}
        <div className="space-y-1">
          <p className="text-sm sm:text-base font-semibold leading-tight line-clamp-2">
            {match.polymarket.title}
          </p>
          <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Expires {format(expirationDate, "MMM d, yyyy")}</span>
            <span className="text-border">•</span>
            <span>{Math.round(match.matchScore * 100)}% match confidence</span>
          </div>
        </div>

        {/* Visual Trade Flow Diagram */}
        <TradeFlowDiagram opportunity={opportunity} />
        
        {/* Quick Action Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="default" 
            size="sm" 
            className="h-8 px-3 text-xs font-medium bg-chart-4 hover:bg-chart-4/90"
            onClick={openBothPlatforms}
          >
            <ExternalLink className="w-3 h-3 mr-1.5" />
            Open Both
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 px-3 text-xs"
            onClick={copyTradePlan}
          >
            {copied ? <Check className="w-3 h-3 mr-1.5" /> : <Copy className="w-3 h-3 mr-1.5" />}
            {copied ? 'Copied!' : 'Copy Plan'}
          </Button>
          <Button 
            variant={isWatchlisted ? "default" : "outline"}
            size="sm" 
            className={`h-8 px-3 text-xs ${isWatchlisted ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
            onClick={onToggleWatchlist}
          >
            <Star className={`w-3 h-3 mr-1.5 ${isWatchlisted ? 'fill-current' : ''}`} />
            {isWatchlisted ? 'Saved' : 'Save'}
          </Button>
        </div>
        
        {/* Expandable Details Section */}
        <Collapsible open={showDetails} onOpenChange={setShowDetails}>
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50">
              <span className="text-xs font-medium text-muted-foreground">
                {showDetails ? 'Hide Details' : 'Show Calculator & Scenarios'}
              </span>
              {showDetails ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="mt-3 space-y-4">
              {/* Mini Calculator */}
              <MiniCalculator opportunity={opportunity} />
              
              {/* Outcome Scenarios */}
              <OutcomeScenarios opportunity={opportunity} />
              
              {/* Contract Details */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contract Details</span>
                
                {/* Polymarket Contract */}
                <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <PolymarketIcon className="w-3.5 h-3.5" />
                    <span className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">Polymarket</span>
                  </div>
                  <p className="text-xs sm:text-sm font-medium leading-tight line-clamp-2 mb-1.5">
                    {match.polymarket.title}
                  </p>
                  <div className="flex items-center gap-2">
                    {match.polymarket.marketSlug && (
                      <button 
                        onClick={() => copyTicker(match.polymarket.marketSlug!, 'Polymarket')}
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors bg-muted px-1.5 py-0.5 rounded"
                      >
                        {copiedTicker === match.polymarket.marketSlug ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                        <span className="font-mono truncate max-w-[150px] sm:max-w-[200px]">{match.polymarket.marketSlug}</span>
                      </button>
                    )}
                    <a 
                      href={polymarketUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] text-chart-4 hover:underline flex items-center gap-0.5"
                    >
                      Open <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
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
                  <div className="flex items-center gap-2">
                    {match.kalshi.kalshiMarketTicker && (
                      <button 
                        onClick={() => copyTicker(match.kalshi.kalshiMarketTicker!, 'Kalshi')}
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors bg-muted px-1.5 py-0.5 rounded"
                      >
                        {copiedTicker === match.kalshi.kalshiMarketTicker ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                        <span className="font-mono">{match.kalshi.kalshiMarketTicker}</span>
                      </button>
                    )}
                    <a 
                      href={kalshiUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] text-chart-4 hover:underline flex items-center gap-0.5"
                    >
                      Open <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              </div>
              
              {/* Match Details Panel */}
              <MatchDetailsPanel match={match} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
});

// Memoized MatchCard - only re-renders when its specific data changes
interface MatchCardProps {
  match: CrossPlatformMatch;
  maxAgeSeconds: number;
  fetchingPriceIds: Set<string>;
}

const MatchCard = memo(function MatchCard({ match, maxAgeSeconds, fetchingPriceIds }: MatchCardProps) {
  const polyYes = match.polymarket.sideA.probability ?? 0;
  const polyNo = match.polymarket.sideB.probability ?? 0;
  const kalshiYes = match.kalshi.sideA.probability ?? 0;
  const kalshiNo = match.kalshi.sideB.probability ?? 0;
  
  const polyHasRealPrice = match.polymarket.lastPriceUpdatedAt !== null;
  const kalshiHasRealPrice = match.kalshi.lastPriceUpdatedAt !== null;
  
  const polyIsFetching = fetchingPriceIds.has(match.polymarket.id);
  const kalshiIsFetching = fetchingPriceIds.has(match.kalshi.id);
  const isFetching = polyIsFetching || kalshiIsFetching;
  
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
          <div className={`mb-2.5 p-2 rounded-lg text-[10px] sm:text-xs flex items-center gap-1.5 ${isFetching ? 'bg-blue-500/10 text-blue-600' : 'bg-amber-500/10 text-amber-600'}`}>
            {isFetching ? (
              <>
                <RefreshCw className="w-3 h-3 shrink-0 animate-spin" />
                <span className="line-clamp-1">
                  Fetching {!polyHasRealPrice && polyIsFetching && 'Polymarket'}
                  {!polyHasRealPrice && polyIsFetching && !kalshiHasRealPrice && kalshiIsFetching && ' & '}
                  {!kalshiHasRealPrice && kalshiIsFetching && 'Kalshi'}
                  {!polyHasRealPrice && !polyIsFetching && 'Polymarket'}
                  {!kalshiHasRealPrice && !kalshiIsFetching && 'Kalshi'}...
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span className="line-clamp-1">
                  {!polyHasRealPrice && !kalshiHasRealPrice 
                    ? 'Awaiting prices'
                    : !polyHasRealPrice 
                    ? 'Awaiting Polymarket' 
                    : 'Kalshi: no trades'}
                </span>
              </>
            )}
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
              {polyIsFetching && <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-500" />}
            </div>
            {polyIsFetching && !polyHasRealPrice ? (
              <div className="flex gap-2">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
              </div>
            ) : (
              <div className={`flex gap-2 ${!polyHasRealPrice ? 'opacity-50' : ''}`}>
                <span>Y: <span className="font-semibold">{formatCents(polyYes)}</span></span>
                <span>N: <span className="font-semibold">{formatCents(polyNo)}</span></span>
              </div>
            )}
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1.5 mb-1">
              <KalshiIcon className="w-3 h-3" />
              <span className="text-muted-foreground font-medium">Kalshi</span>
              {kalshiIsFetching && <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-500" />}
            </div>
            {kalshiIsFetching && !kalshiHasRealPrice ? (
              <div className="flex gap-2">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
              </div>
            ) : (
              <div className={`flex gap-2 ${!kalshiHasRealPrice ? 'opacity-50' : ''}`}>
                <span>Y: <span className="font-semibold">{formatCents(kalshiYes)}</span></span>
                <span>N: <span className="font-semibold">{formatCents(kalshiNo)}</span></span>
              </div>
            )}
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
});

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
  
  const { refreshAllMatchedPrices, isRefreshingAllPrices, refreshKalshiPrices, isRefreshingKalshi, lastKalshiRefresh, summary, wsStatus, kalshiWsStatus, kalshiWsSubscriptionCount, fetchingPriceIds } = useMarkets();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const [sortBy, setSortBy] = useState<SortOption>('profit');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [matchesPage, setMatchesPage] = useState(1);
  const MATCHES_PER_PAGE = 30;
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh logic - simplified, countdown is now isolated
  useEffect(() => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    if (settings.autoRefreshEnabled && matches.length > 0) {
      const intervalMs = settings.autoRefreshIntervalSeconds * 1000;

      // Auto-refresh timer
      autoRefreshTimerRef.current = setInterval(() => {
        if (!isRefreshingAllPrices) {
          refreshAllMatchedPrices();
        }
      }, intervalMs);

      // Initial refresh if enabled
      if (!isRefreshingAllPrices) {
        refreshAllMatchedPrices();
      }
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [settings.autoRefreshEnabled, settings.autoRefreshIntervalSeconds, matches.length, refreshAllMatchedPrices, isRefreshingAllPrices]);

  // Filter and sort opportunities - memoized
  const displayOpportunities = useMemo(() => {
    let all = [...freshOpportunities, ...staleOpportunities];
    
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
  }, [freshOpportunities, staleOpportunities, sortBy, searchQuery]);
  
  // Track which opportunities are stale for badge display
  const staleIds = useMemo(() => new Set(staleOpportunities.map(o => o.id)), [staleOpportunities]);
  
  // Memoize callbacks to prevent re-renders
  const handleToggleWatchlist = useCallback((opp: ArbitrageOpportunity) => {
    toggleWatchlist(
      opp.match.polymarket.conditionId,
      opp.match.kalshi.kalshiMarketTicker,
      opp.match.matchScore,
      opp.match.polymarket.title
    );
  }, [toggleWatchlist]);
  
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
                {kalshiWsStatus === 'connected' && (
                  <span className="flex items-center gap-1 text-[10px] text-chart-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-chart-4" />
                    WS
                  </span>
                )}
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
                  <Timer className="w-3.5 h-3.5" />
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
                {settings.minProfitPercent > 0 && (
                  <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px] bg-chart-4/20 text-chart-4">
                    1
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
        
        <div className="flex items-center gap-2">
          <RefreshCountdown 
            enabled={settings.autoRefreshEnabled}
            intervalSeconds={settings.autoRefreshIntervalSeconds}
            matchCount={matches.length}
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshAllMatchedPrices}
            disabled={isRefreshingAllPrices}
            className="h-9"
          >
            <Zap className={`w-3.5 h-3.5 mr-1.5 ${isRefreshingAllPrices ? 'text-chart-4' : ''}`} />
            {isRefreshingAllPrices ? 'Refreshing...' : 'Refresh All Prices'}
          </Button>
        </div>
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
              onToggleWatchlist={() => handleToggleWatchlist(opp)}
            />
          ))}
        </div>
      ) : staleCount > 0 && !settings.showStaleOpportunities ? (
        <Card className="border-dashed border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="py-8 sm:py-12 text-center px-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold mb-2">Waiting for Fresh Prices</h3>
            <p className="text-muted-foreground text-xs sm:text-sm max-w-md mx-auto mb-4">
              Found {staleCount} potential {staleCount === 1 ? 'opportunity' : 'opportunities'}. Prices need refresh.
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshAllMatchedPrices}
              disabled={isRefreshingAllPrices}
            >
              <Zap className={`w-3.5 h-3.5 mr-1.5 ${isRefreshingAllPrices ? 'animate-pulse' : ''}`} />
              {isRefreshingAllPrices ? 'Refreshing...' : 'Refresh Now'}
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
      
      {/* Matched Contracts Section with Pagination */}
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
        <CardContent className="pt-0 space-y-4">
          {matches.length > 0 ? (
            <>
              <div className="grid gap-2 sm:gap-3 md:grid-cols-2 lg:grid-cols-3">
                {matches
                  .slice((matchesPage - 1) * MATCHES_PER_PAGE, matchesPage * MATCHES_PER_PAGE)
                  .map((match) => (
                    <MatchCard 
                      key={`${match.polymarket.id}-${match.kalshi.id}`}
                      match={match} 
                      maxAgeSeconds={settings.maxAgeSeconds}
                      fetchingPriceIds={fetchingPriceIds}
                    />
                  ))}
              </div>
              
              {/* Pagination */}
              {matches.length > MATCHES_PER_PAGE && (
                <div className="pt-4 border-t border-border">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Showing {((matchesPage - 1) * MATCHES_PER_PAGE) + 1}-{Math.min(matchesPage * MATCHES_PER_PAGE, matches.length)} of {matches.length}
                    </p>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious 
                            onClick={() => setMatchesPage(p => Math.max(1, p - 1))}
                            className={matchesPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                        
                        {(() => {
                          const totalPages = Math.ceil(matches.length / MATCHES_PER_PAGE);
                          const pages: (number | 'ellipsis')[] = [];
                          
                          // Always show first page
                          pages.push(1);
                          
                          // Show ellipsis if needed
                          if (matchesPage > 3) pages.push('ellipsis');
                          
                          // Show pages around current
                          for (let i = Math.max(2, matchesPage - 1); i <= Math.min(totalPages - 1, matchesPage + 1); i++) {
                            if (!pages.includes(i)) pages.push(i);
                          }
                          
                          // Show ellipsis if needed
                          if (matchesPage < totalPages - 2) pages.push('ellipsis');
                          
                          // Always show last page
                          if (totalPages > 1 && !pages.includes(totalPages)) pages.push(totalPages);
                          
                          return pages.map((page, idx) => (
                            <PaginationItem key={idx}>
                              {page === 'ellipsis' ? (
                                <PaginationEllipsis />
                              ) : (
                                <PaginationLink
                                  onClick={() => setMatchesPage(page)}
                                  isActive={matchesPage === page}
                                  className="cursor-pointer"
                                >
                                  {page}
                                </PaginationLink>
                              )}
                            </PaginationItem>
                          ));
                        })()}
                        
                        <PaginationItem>
                          <PaginationNext 
                            onClick={() => setMatchesPage(p => Math.min(Math.ceil(matches.length / MATCHES_PER_PAGE), p + 1))}
                            className={matchesPage >= Math.ceil(matches.length / MATCHES_PER_PAGE) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                </div>
              )}
            </>
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
