import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMarkets } from '@/contexts/MarketsContext';
import { UnifiedMarket } from '@/types/dome';
import { formatDistanceToNow } from 'date-fns';
import { ChevronUp, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';

export function MarketsTable() {
  const { filteredMarkets, isDiscovering, isPriceUpdating } = useMarkets();
  const [selectedMarket, setSelectedMarket] = useState<UnifiedMarket | null>(null);

  const formatProbability = (prob: number) => `${(prob * 100).toFixed(1)}%`;
  const formatOdds = (odds: number | null) => odds ? odds.toFixed(2) : '—';
  const formatDate = (date: Date) => {
    try {
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const getPlatformBadge = (platform: string) => {
    if (platform === 'POLYMARKET') {
      return <Badge variant="secondary" className="bg-chart-1/10 text-chart-1 border-0 font-medium">Polymarket</Badge>;
    }
    return <Badge variant="secondary" className="bg-chart-4/10 text-chart-4 border-0 font-medium">Kalshi</Badge>;
  };

  if (filteredMarkets.length === 0) {
    return (
      <Card className="border-border shadow-sm">
        <CardContent className="p-12 text-center">
          {isDiscovering ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Discovering markets...</p>
            </div>
          ) : (
            <p className="text-muted-foreground">No markets found. Try adjusting your filters.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border shadow-sm overflow-hidden">
        <ScrollArea className="h-[600px]">
          <div className="min-w-[900px]">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 z-10">
              <div className="col-span-1">Platform</div>
              <div className="col-span-4">Market</div>
              <div className="col-span-2">Expiration</div>
              <div className="col-span-2 text-center">Price</div>
              <div className="col-span-2 text-center">Probability</div>
              <div className="col-span-1 text-right">Updated</div>
            </div>

            {/* Rows */}
            {filteredMarkets.map((market) => (
              <div
                key={market.id}
                className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
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
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-4 bg-muted/30 border-t border-border flex items-center justify-between">
          <p className="text-sm text-muted-foreground font-medium">
            {filteredMarkets.length} markets
          </p>
          {isPriceUpdating && (
            <div className="flex items-center gap-2 text-xs text-primary font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Live updates active</span>
            </div>
          )}
        </div>
      </Card>

      {/* Market Detail Modal */}
      <Dialog open={!!selectedMarket} onOpenChange={() => setSelectedMarket(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          {selectedMarket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {getPlatformBadge(selectedMarket.platform)}
                  <span className="text-lg">{selectedMarket.title}</span>
                </DialogTitle>
                <DialogDescription>
                  Market details and current pricing
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Market Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">Market ID</p>
                    <p className="font-mono text-sm">{selectedMarket.marketSlug || selectedMarket.kalshiMarketTicker}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">Status</p>
                    <Badge variant={selectedMarket.status === 'open' ? 'default' : 'secondary'}>
                      {selectedMarket.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">Start Time</p>
                    <p className="text-sm">{selectedMarket.startTime.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">End Time</p>
                    <p className="text-sm">{selectedMarket.endTime.toLocaleString()}</p>
                  </div>
                </div>

                {/* Pricing Table */}
                <div>
                  <h4 className="font-semibold mb-3">Pricing</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-chart-4/5 border-chart-4/20">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <ChevronUp className="w-5 h-5 text-chart-4" />
                          <span className="font-semibold">{selectedMarket.sideA.label}</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Price:</span>
                            <span className="font-mono font-medium">{(selectedMarket.sideA.price * 100).toFixed(1)}¢</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Probability:</span>
                            <span className="font-mono font-medium">{formatProbability(selectedMarket.sideA.probability)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Decimal Odds:</span>
                            <span className="font-mono font-medium">{formatOdds(selectedMarket.sideA.odds)}x</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-chart-5/5 border-chart-5/20">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <ChevronDown className="w-5 h-5 text-chart-5" />
                          <span className="font-semibold">{selectedMarket.sideB.label}</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Price:</span>
                            <span className="font-mono font-medium">{(selectedMarket.sideB.price * 100).toFixed(1)}¢</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Probability:</span>
                            <span className="font-mono font-medium">{formatProbability(selectedMarket.sideB.probability)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Decimal Odds:</span>
                            <span className="font-mono font-medium">{formatOdds(selectedMarket.sideB.odds)}x</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Token IDs (for Polymarket) */}
                {selectedMarket.sideA.tokenId && (
                  <div>
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
                <div className="flex gap-3">
                  {selectedMarket.platform === 'POLYMARKET' && selectedMarket.marketSlug && (
                    <Button variant="outline" size="sm" asChild>
                      <a 
                        href={`https://polymarket.com/event/${selectedMarket.marketSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View on Polymarket
                      </a>
                    </Button>
                  )}
                  {selectedMarket.platform === 'KALSHI' && selectedMarket.kalshiMarketTicker && (
                    <Button variant="outline" size="sm" asChild>
                      <a 
                        href={`https://kalshi.com/markets/${selectedMarket.kalshiMarketTicker}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
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