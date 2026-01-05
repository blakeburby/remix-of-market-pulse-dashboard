import { MatchedMarket } from '@/hooks/useSportsArbitrageV2';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  ArrowUpDown,
  Book,
  Clock,
  DollarSign,
  ExternalLink,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { format } from 'date-fns';

interface MarketCardProps {
  market: MatchedMarket;
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

function formatSpread(spread: number | null): string {
  if (spread === null) return '—';
  return `${spread}¢`;
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'orderbook':
      return <Book className="w-3 h-3" />;
    case 'market_bid_ask':
    case 'market-price':
      return <Zap className="w-3 h-3" />;
    case 'market_last_price':
      return <Clock className="w-3 h-3" />;
    default:
      return <AlertCircle className="w-3 h-3" />;
  }
}

function getSourceLabel(source: string) {
  switch (source) {
    case 'orderbook':
      return 'Orderbook';
    case 'market_bid_ask':
      return 'Market Bid/Ask';
    case 'market-price':
      return 'Market Price';
    case 'market_last_price':
      return 'Last Trade';
    default:
      return 'No Data';
  }
}

function getSourceColor(source: string) {
  switch (source) {
    case 'orderbook':
      return 'text-chart-2';
    case 'market_bid_ask':
    case 'market-price':
      return 'text-chart-3';
    case 'market_last_price':
      return 'text-chart-4';
    default:
      return 'text-muted-foreground';
  }
}

function getLiquidityBadge(depth: number | null) {
  if (depth === null || depth <= 0) return { label: 'No Liq', variant: 'destructive' as const };
  if (depth < 100) return { label: 'Low', variant: 'secondary' as const };
  if (depth < 500) return { label: 'Med', variant: 'outline' as const };
  return { label: 'High', variant: 'default' as const };
}

export function MarketCard({ market }: MarketCardProps) {
  const aLabel = market.outcomeA ?? 'Outcome A';
  const bLabel = market.outcomeB ?? 'Outcome B';

  const kYes = market.kalshiPrice?.yesAsk ?? null;
  const kNo = market.kalshiPrice?.noAsk ?? null;
  const pYes = market.polymarketPrice?.yesAsk ?? null;
  const pNo = market.polymarketPrice?.noAsk ?? null;

  const expiryText = market.expiresAt ? format(new Date(market.expiresAt), 'MMM d, HH:mm') : null;

  const kalshiLiquidity = getLiquidityBadge(market.kalshiPrice?.depth ?? null);
  const polyLiquidity = getLiquidityBadge(market.polymarketPrice?.depth ?? null);

  // Calculate price difference (potential edge indicator)
  const priceDiffA = kYes !== null && pYes !== null ? Math.abs(kYes - pYes) * 100 : null;
  const priceDiffB = kNo !== null && pNo !== null ? Math.abs(kNo - pNo) * 100 : null;
  const maxDiff = Math.max(priceDiffA ?? 0, priceDiffB ?? 0);

  // Market URLs
  const kalshiUrl = `https://kalshi.com/markets/${market.kalshi.event_ticker.toLowerCase()}`;
  const polymarketUrl = market.polymarket 
    ? `https://polymarket.com/event/${market.polymarket.market_slug}`
    : null;

  const title = market.title ?? market.kalshi.event_ticker.replace(/^KX[A-Z]+GAME-/, '').replace(/-/g, ' ');

  return (
    <TooltipProvider>
      <Card
        className={cn(
          'transition-all hover:shadow-md',
          market.polymarket ? 'border-chart-2/30' : 'border-muted',
          maxDiff > 3 && 'ring-2 ring-chart-2/30'
        )}
      >
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{title}</p>
              {expiryText && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {expiryText} UTC
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {maxDiff > 3 && (
                <Badge variant="default" className="text-[10px] gap-0.5 bg-chart-2 hover:bg-chart-2">
                  <TrendingUp className="w-3 h-3" />
                  {maxDiff.toFixed(1)}¢
                </Badge>
              )}
              <Badge variant={market.polymarket ? 'default' : 'secondary'} className="text-xs">
                {market.polymarket ? 'Matched' : 'Kalshi Only'}
              </Badge>
            </div>
          </div>

          {/* Prices Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Kalshi */}
            <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Kalshi</span>
                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn('flex items-center gap-0.5', getSourceColor(market.kalshiPrice?.source ?? 'none'))}>
                        {getSourceIcon(market.kalshiPrice?.source ?? 'none')}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Source: {getSourceLabel(market.kalshiPrice?.source ?? 'none')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <Badge variant={kalshiLiquidity.variant} className="text-[9px] px-1 h-4">
                    {kalshiLiquidity.label}
                  </Badge>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground truncate max-w-[60px]">{aLabel}</span>
                  <span className="font-semibold">{formatCents(kYes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground truncate max-w-[60px]">{bLabel}</span>
                  <span className="font-semibold">{formatCents(kNo)}</span>
                </div>
              </div>

              <div className="pt-1 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Odds: {formatDecimalOdds(kYes)} / {formatDecimalOdds(kNo)}</span>
                {market.kalshiPrice?.spread !== null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-0.5">
                        <ArrowUpDown className="w-2.5 h-2.5" />
                        {formatSpread(market.kalshiPrice.spread)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Bid-Ask Spread</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full h-6 text-[10px] gap-1"
                onClick={() => window.open(kalshiUrl, '_blank')}
              >
                <ExternalLink className="w-2.5 h-2.5" />
                Open Kalshi
              </Button>
            </div>

            {/* Polymarket */}
            <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Polymarket</span>
                <div className="flex items-center gap-1.5">
                  {market.polymarket && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn('flex items-center gap-0.5', getSourceColor(market.polymarketPrice?.source ?? 'none'))}>
                            {getSourceIcon(market.polymarketPrice?.source ?? 'none')}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Source: {getSourceLabel(market.polymarketPrice?.source ?? 'none')}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Badge variant={polyLiquidity.variant} className="text-[9px] px-1 h-4">
                        {polyLiquidity.label}
                      </Badge>
                    </>
                  )}
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground truncate max-w-[60px]">{aLabel}</span>
                  <span className="font-semibold">{formatCents(pYes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground truncate max-w-[60px]">{bLabel}</span>
                  <span className="font-semibold">{formatCents(pNo)}</span>
                </div>
              </div>

              <div className="pt-1 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Odds: {formatDecimalOdds(pYes)} / {formatDecimalOdds(pNo)}</span>
                {market.polymarketPrice?.spread !== null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-0.5">
                        <ArrowUpDown className="w-2.5 h-2.5" />
                        {formatSpread(market.polymarketPrice.spread)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Bid-Ask Spread</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {polymarketUrl ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-6 text-[10px] gap-1"
                  onClick={() => window.open(polymarketUrl, '_blank')}
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  Open Poly
                </Button>
              ) : (
                <div className="h-6 flex items-center justify-center text-[10px] text-muted-foreground">
                  Not matched
                </div>
              )}
            </div>
          </div>

          {/* Implied Probabilities Summary */}
          {kYes !== null && pYes !== null && (
            <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground bg-muted/30 rounded-md py-1.5">
              <span>
                {aLabel}: K {formatImplied(kYes)} vs P {formatImplied(pYes)}
                {priceDiffA !== null && priceDiffA > 1 && (
                  <span className={cn('ml-1', priceDiffA > 3 ? 'text-chart-2 font-medium' : '')}>
                    (Δ{priceDiffA.toFixed(1)}¢)
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Errors */}
          {(market.kalshiError || market.polymarketError) && (
            <div className="space-y-1 text-xs">
              {market.kalshiError && (
                <div className="flex items-start gap-1.5 text-destructive">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span className="break-words">Kalshi: {market.kalshiError}</span>
                </div>
              )}
              {market.polymarketError && (
                <div className="flex items-start gap-1.5 text-destructive">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span className="break-words">Polymarket: {market.polymarketError}</span>
                </div>
              )}
            </div>
          )}

          {/* Loading state */}
          {!market.pricesFetched && market.polymarket && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}