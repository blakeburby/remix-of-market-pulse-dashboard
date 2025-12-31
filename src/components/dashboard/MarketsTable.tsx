import { useState, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useMarkets } from '@/contexts/MarketsContext';
import { UnifiedMarket } from '@/types/dome';
import { formatDistanceToNow } from 'date-fns';
import { ChevronUp, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';

const ROW_HEIGHT_DESKTOP = 72;
const ROW_HEIGHT_MOBILE = 80;

export function MarketsTable() {
  const { filteredMarkets, isDiscovering, isPriceUpdating } = useMarkets();
  const [selectedMarket, setSelectedMarket] = useState<UnifiedMarket | null>(null);
  
  // Refs for virtualization containers
  const desktopParentRef = useRef<HTMLDivElement>(null);
  const mobileParentRef = useRef<HTMLDivElement>(null);

  const formatProbability = (prob: number) => `${(prob * 100).toFixed(0)}%`;
  const formatOdds = (odds: number | null) => odds ? odds.toFixed(2) : '—';
  const formatDate = (date: Date) => {
    try {
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const formatShortDate = (date: Date) => {
    try {
      const dist = formatDistanceToNow(date, { addSuffix: false });
      return dist.replace(' minutes', 'm').replace(' minute', 'm')
        .replace(' hours', 'h').replace(' hour', 'h')
        .replace(' days', 'd').replace(' day', 'd')
        .replace(' weeks', 'w').replace(' week', 'w')
        .replace(' months', 'mo').replace(' month', 'mo')
        .replace('about ', '').replace('less than ', '<');
    } catch {
      return '—';
    }
  };

  const getPlatformBadge = useCallback((platform: string, compact = false) => {
    if (platform === 'POLYMARKET') {
      return <Badge variant="secondary" className={`bg-chart-1/10 text-chart-1 border-0 font-medium ${compact ? 'text-[10px] px-1.5 py-0' : ''}`}>{compact ? 'P' : 'Polymarket'}</Badge>;
    }
    return <Badge variant="secondary" className={`bg-chart-4/10 text-chart-4 border-0 font-medium ${compact ? 'text-[10px] px-1.5 py-0' : ''}`}>{compact ? 'K' : 'Kalshi'}</Badge>;
  }, []);

  // Desktop virtualizer
  const desktopVirtualizer = useVirtualizer({
    count: filteredMarkets.length,
    getScrollElement: () => desktopParentRef.current,
    estimateSize: () => ROW_HEIGHT_DESKTOP,
    overscan: 10,
  });

  // Mobile virtualizer
  const mobileVirtualizer = useVirtualizer({
    count: filteredMarkets.length,
    getScrollElement: () => mobileParentRef.current,
    estimateSize: () => ROW_HEIGHT_MOBILE,
    overscan: 5,
  });

  if (filteredMarkets.length === 0) {
    return (
      <Card className="border-border shadow-sm">
        <CardContent className="p-8 sm:p-12 text-center">
          {isDiscovering ? (
            <div className="flex flex-col items-center gap-3 sm:gap-4">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-primary" />
              <p className="text-sm sm:text-base text-muted-foreground">Discovering markets...</p>
            </div>
          ) : (
            <p className="text-sm sm:text-base text-muted-foreground">No markets found. Try adjusting your filters.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border shadow-sm overflow-hidden">
        {/* Mobile Card View - Virtualized */}
        <div className="sm:hidden">
          <div
            ref={mobileParentRef}
            className="h-[calc(100vh-380px)] min-h-[300px] overflow-auto"
          >
            <div
              style={{
                height: `${mobileVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {mobileVirtualizer.getVirtualItems().map((virtualRow) => {
                const market = filteredMarkets[virtualRow.index];
                return (
                  <div
                    key={market.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      className="p-3 active:bg-muted/50 cursor-pointer transition-colors border-b border-border h-full"
                      onClick={() => setSelectedMarket(market)}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        {getPlatformBadge(market.platform, true)}
                        <p className="font-medium text-foreground text-sm leading-tight flex-1 line-clamp-2">
                          {market.title}
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <ChevronUp className="w-3 h-3 text-chart-4" />
                            <span className="font-mono text-xs font-medium">{(market.sideA.price * 100).toFixed(0)}¢</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <ChevronDown className="w-3 h-3 text-chart-5" />
                            <span className="font-mono text-xs font-medium">{(market.sideB.price * 100).toFixed(0)}¢</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{formatShortDate(market.endTime)}</span>
                          <div className="w-12 h-1 bg-chart-5/20 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-chart-4 rounded-full"
                              style={{ width: `${market.sideA.probability * 100}%` }}
                            />
                          </div>
                          <span className="font-medium text-chart-4">{formatProbability(market.sideA.probability)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Desktop Table View - Virtualized */}
        <div className="hidden sm:block">
          <div className="min-w-[900px]">
            {/* Header - sticky */}
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <div className="col-span-1">Platform</div>
              <div className="col-span-4">Market</div>
              <div className="col-span-2">Expiration</div>
              <div className="col-span-2 text-center">Price</div>
              <div className="col-span-2 text-center">Probability</div>
              <div className="col-span-1 text-right">Updated</div>
            </div>

            {/* Virtualized Rows */}
            <div
              ref={desktopParentRef}
              className="h-[552px] overflow-auto"
            >
              <div
                style={{
                  height: `${desktopVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {desktopVirtualizer.getVirtualItems().map((virtualRow) => {
                  const market = filteredMarkets[virtualRow.index];
                  return (
                    <div
                      key={market.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-border hover:bg-muted/30 cursor-pointer transition-colors h-full items-center"
                        onClick={() => setSelectedMarket(market)}
                      >
                        {/* Platform */}
                        <div className="col-span-1 flex items-center">
                          {getPlatformBadge(market.platform)}
                        </div>

                        {/* Title */}
                        <div className="col-span-4">
                          <p className="font-medium text-foreground line-clamp-2 text-sm">{market.title}</p>
                          {market.volume !== undefined && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Vol: ${market.volume.toLocaleString()}
                            </p>
                          )}
                        </div>

                        {/* Expiration */}
                        <div className="col-span-2 flex items-center">
                          <span className="text-sm text-foreground">{formatDate(market.endTime)}</span>
                        </div>

                        {/* Prices - show in cents */}
                        <div className="col-span-2 flex items-center justify-center gap-2">
                          <div className="flex items-center gap-1 text-sm">
                            <ChevronUp className="w-4 h-4 text-chart-4" />
                            <span className="font-mono font-medium">{(market.sideA.price * 100).toFixed(1)}¢</span>
                          </div>
                          <span className="text-muted-foreground">/</span>
                          <div className="flex items-center gap-1 text-sm">
                            <ChevronDown className="w-4 h-4 text-chart-5" />
                            <span className="font-mono font-medium">{(market.sideB.price * 100).toFixed(1)}¢</span>
                          </div>
                        </div>

                        {/* Probability */}
                        <div className="col-span-2 flex items-center justify-center">
                          <div className="w-full max-w-[120px]">
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="font-medium text-chart-4">{formatProbability(market.sideA.probability)}</span>
                              <span className="font-medium text-chart-5">{formatProbability(market.sideB.probability)}</span>
                            </div>
                            <div className="h-1.5 bg-chart-5/20 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-chart-4 rounded-full transition-all duration-500"
                                style={{ width: `${market.sideA.probability * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Last Updated */}
                        <div className="col-span-1 flex items-center justify-end">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(market.lastUpdated)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 bg-muted/30 border-t border-border flex items-center justify-between">
          <p className="text-xs sm:text-sm text-muted-foreground font-medium">
            {filteredMarkets.length} markets
          </p>
          {isPriceUpdating && (
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-primary font-medium">
              <Loader2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" />
              <span>Live</span>
            </div>
          )}
        </div>
      </Card>

      {/* Market Detail Modal */}
      <Dialog open={!!selectedMarket} onOpenChange={() => setSelectedMarket(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto mx-4 sm:mx-auto p-4 sm:p-6">
          {selectedMarket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-start gap-2 sm:gap-3 text-left">
                  {getPlatformBadge(selectedMarket.platform)}
                  <span className="text-sm sm:text-lg leading-tight">{selectedMarket.title}</span>
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  Market details and current pricing
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 sm:space-y-6 mt-3 sm:mt-4">
                {/* Market Info */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <p className="text-[10px] sm:text-sm text-muted-foreground font-medium">Market ID</p>
                    <p className="font-mono text-xs sm:text-sm truncate">{selectedMarket.marketSlug || selectedMarket.kalshiMarketTicker}</p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-sm text-muted-foreground font-medium">Status</p>
                    <Badge variant={selectedMarket.status === 'open' ? 'default' : 'secondary'} className="text-[10px] sm:text-xs">
                      {selectedMarket.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-sm text-muted-foreground font-medium">Start</p>
                    <p className="text-xs sm:text-sm">{selectedMarket.startTime.toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-sm text-muted-foreground font-medium">End</p>
                    <p className="text-xs sm:text-sm">{selectedMarket.endTime.toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Pricing Table */}
                <div>
                  <h4 className="font-semibold text-sm sm:text-base mb-2 sm:mb-3">Pricing</h4>
                  <div className="grid grid-cols-2 gap-2 sm:gap-4">
                    <Card className="bg-chart-4/5 border-chart-4/20">
                      <CardContent className="p-2.5 sm:p-4">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                          <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-chart-4" />
                          <span className="font-semibold text-xs sm:text-base truncate">{selectedMarket.sideA.label}</span>
                        </div>
                        <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Price:</span>
                            <span className="font-mono font-medium">{(selectedMarket.sideA.price * 100).toFixed(1)}¢</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Prob:</span>
                            <span className="font-mono font-medium">{formatProbability(selectedMarket.sideA.probability)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Odds:</span>
                            <span className="font-mono font-medium">{formatOdds(selectedMarket.sideA.odds)}x</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-chart-5/5 border-chart-5/20">
                      <CardContent className="p-2.5 sm:p-4">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                          <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-chart-5" />
                          <span className="font-semibold text-xs sm:text-base truncate">{selectedMarket.sideB.label}</span>
                        </div>
                        <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Price:</span>
                            <span className="font-mono font-medium">{(selectedMarket.sideB.price * 100).toFixed(1)}¢</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Prob:</span>
                            <span className="font-mono font-medium">{formatProbability(selectedMarket.sideB.probability)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Odds:</span>
                            <span className="font-mono font-medium">{formatOdds(selectedMarket.sideB.odds)}x</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Token IDs (for Polymarket) - Hidden on mobile for cleaner UI */}
                {selectedMarket.sideA.tokenId && (
                  <div className="hidden sm:block">
                    <h4 className="font-semibold mb-3">Token IDs</h4>
                    <div className="space-y-2 text-xs font-mono bg-muted/50 p-4 rounded-lg">
                      <div>
                        <span className="text-muted-foreground">Side A: </span>
                        <span className="break-all">{selectedMarket.sideA.tokenId}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Side B: </span>
                        <span className="break-all">{selectedMarket.sideB.tokenId}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Links */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  {selectedMarket.platform === 'POLYMARKET' && selectedMarket.marketSlug && (
                    <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs sm:text-sm" asChild>
                      <a 
                        href={`https://polymarket.com/event/${selectedMarket.marketSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                        View on Polymarket
                      </a>
                    </Button>
                  )}
                  {selectedMarket.platform === 'KALSHI' && selectedMarket.kalshiMarketTicker && (
                    <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs sm:text-sm" asChild>
                      <a 
                        href={`https://kalshi.com/markets/${selectedMarket.kalshiMarketTicker}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                        View on Kalshi
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
