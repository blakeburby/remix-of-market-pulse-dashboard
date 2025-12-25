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
      return <Badge variant="secondary" className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border-0">Polymarket</Badge>;
    }
    return <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-0">Kalshi</Badge>;
  };

  if (filteredMarkets.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="p-8 text-center">
          {isDiscovering ? (
            <div className="flex flex-col items-center gap-3">
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
      <Card className="border-border overflow-hidden">
        <ScrollArea className="h-[600px]">
          <div className="min-w-[900px]">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 p-4 bg-muted/30 border-b border-border text-sm font-medium text-muted-foreground sticky top-0 z-10">
              <div className="col-span-1">Platform</div>
              <div className="col-span-4">Title</div>
              <div className="col-span-2">Expiration</div>
              <div className="col-span-2 text-center">Yes / No</div>
              <div className="col-span-2 text-center">Probability</div>
              <div className="col-span-1 text-right">Updated</div>
            </div>

            {/* Rows */}
            {filteredMarkets.map((market) => (
              <div
                key={market.id}
                className="grid grid-cols-12 gap-4 p-4 border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
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

                {/* Prices */}
                <div className="col-span-2 flex items-center justify-center gap-2">
                  <div className="flex items-center gap-1 text-sm">
                    <ChevronUp className="w-4 h-4 text-green-500" />
                    <span className="font-mono">${market.sideA.price.toFixed(2)}</span>
                  </div>
                  <span className="text-muted-foreground">/</span>
                  <div className="flex items-center gap-1 text-sm">
                    <ChevronDown className="w-4 h-4 text-red-500" />
                    <span className="font-mono">${market.sideB.price.toFixed(2)}</span>
                  </div>
                </div>

                {/* Probability */}
                <div className="col-span-2 flex items-center justify-center">
                  <div className="w-full max-w-[120px]">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-green-500">{formatProbability(market.sideA.probability)}</span>
                      <span className="text-red-500">{formatProbability(market.sideB.probability)}</span>
                    </div>
                    <div className="h-2 bg-red-500/30 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 rounded-full transition-all duration-500"
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
        <div className="p-3 bg-muted/30 border-t border-border flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filteredMarkets.length} markets
          </p>
          {isPriceUpdating && (
            <div className="flex items-center gap-2 text-xs text-primary">
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
                    <p className="text-sm text-muted-foreground">Market ID</p>
                    <p className="font-mono text-sm">{selectedMarket.marketSlug || selectedMarket.kalshiMarketTicker}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant={selectedMarket.status === 'open' ? 'default' : 'secondary'}>
                      {selectedMarket.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Start Time</p>
                    <p className="text-sm">{selectedMarket.startTime.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">End Time</p>
                    <p className="text-sm">{selectedMarket.endTime.toLocaleString()}</p>
                  </div>
                </div>

                {/* Pricing Table */}
                <div>
                  <h4 className="font-medium mb-3">Pricing</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-green-500/10 border-green-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <ChevronUp className="w-5 h-5 text-green-500" />
                          <span className="font-medium">{selectedMarket.sideA.label}</span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Price:</span>
                            <span className="font-mono">${selectedMarket.sideA.price.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Probability:</span>
                            <span className="font-mono">{formatProbability(selectedMarket.sideA.probability)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Odds:</span>
                            <span className="font-mono">{formatOdds(selectedMarket.sideA.odds)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-red-500/10 border-red-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <ChevronDown className="w-5 h-5 text-red-500" />
                          <span className="font-medium">{selectedMarket.sideB.label}</span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Price:</span>
                            <span className="font-mono">${selectedMarket.sideB.price.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Probability:</span>
                            <span className="font-mono">{formatProbability(selectedMarket.sideB.probability)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Odds:</span>
                            <span className="font-mono">{formatOdds(selectedMarket.sideB.odds)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Token IDs (for Polymarket) */}
                {selectedMarket.sideA.tokenId && (
                  <div>
                    <h4 className="font-medium mb-3">Token IDs</h4>
                    <div className="space-y-2 text-xs font-mono bg-muted/30 p-3 rounded-lg">
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
