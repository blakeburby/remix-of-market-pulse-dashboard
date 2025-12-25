import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useMarkets } from '@/contexts/MarketsContext';
import { GroupedEvent, UnifiedMarket } from '@/types/dome';
import { formatDistanceToNow } from 'date-fns';
import { ChevronUp, ChevronDown, ChevronRight, ChevronLeft, ExternalLink, Loader2, Layers } from 'lucide-react';

const EVENTS_PER_PAGE = 100;

export function EventsView() {
  const { groupedEvents, isDiscovering, isPriceUpdating } = useMarkets();
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [selectedMarket, setSelectedMarket] = useState<UnifiedMarket | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(groupedEvents.length / EVENTS_PER_PAGE));
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * EVENTS_PER_PAGE;
    return groupedEvents.slice(start, start + EVENTS_PER_PAGE);
  }, [groupedEvents, currentPage]);

  // Reset to page 1 when events change significantly
  useMemo(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

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

  const getPlatformBadge = (platform: string, compact = false) => {
    if (platform === 'POLYMARKET') {
      return <Badge variant="secondary" className={`bg-chart-1/10 text-chart-1 border-0 font-medium ${compact ? 'text-[10px] px-1.5 py-0' : ''}`}>{compact ? 'P' : 'Poly'}</Badge>;
    }
    return <Badge variant="secondary" className={`bg-chart-4/10 text-chart-4 border-0 font-medium ${compact ? 'text-[10px] px-1.5 py-0' : ''}`}>{compact ? 'K' : 'Kalshi'}</Badge>;
  };

  const toggleEvent = (eventSlug: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventSlug)) {
        next.delete(eventSlug);
      } else {
        next.add(eventSlug);
      }
      return next;
    });
  };

  if (groupedEvents.length === 0) {
    return (
      <Card className="border-border shadow-sm">
        <CardContent className="p-8 sm:p-12 text-center">
          {isDiscovering ? (
            <div className="flex flex-col items-center gap-3 sm:gap-4">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-primary" />
              <p className="text-sm sm:text-base text-muted-foreground">Discovering markets...</p>
            </div>
          ) : (
            <p className="text-sm sm:text-base text-muted-foreground">No events found. Try adjusting your filters.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border shadow-sm overflow-hidden">
        <ScrollArea className="h-[calc(100vh-420px)] min-h-[300px] sm:h-[550px]">
          <div className="divide-y divide-border">
            {paginatedEvents.map((event) => (
              <EventCard
                key={`${event.platform}_${event.eventSlug}`}
                event={event}
                isExpanded={expandedEvents.has(event.eventSlug)}
                onToggle={() => toggleEvent(event.eventSlug)}
                onSelectMarket={setSelectedMarket}
                formatShortDate={formatShortDate}
                formatProbability={formatProbability}
                getPlatformBadge={getPlatformBadge}
              />
            ))}
          </div>
        </ScrollArea>

        {/* Footer with Pagination */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 bg-muted/30 border-t border-border flex items-center justify-between">
          <p className="text-xs sm:text-sm text-muted-foreground font-medium">
            {groupedEvents.length} events • {groupedEvents.reduce((sum, e) => sum + e.markets.length, 0)} markets
          </p>
          
          <div className="flex items-center gap-2">
            {isPriceUpdating && (
              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-primary font-medium mr-2">
                <Loader2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" />
                <span>Live</span>
              </div>
            )}
            
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2 min-w-[60px] text-center">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
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
                    <p className="text-[10px] sm:text-sm text-muted-foreground font-medium">End</p>
                    <p className="text-xs sm:text-sm">{formatDate(selectedMarket.endTime)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-sm text-muted-foreground font-medium">Updated</p>
                    <p className="text-xs sm:text-sm">{formatDate(selectedMarket.lastUpdated)}</p>
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

interface EventCardProps {
  event: GroupedEvent;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectMarket: (market: UnifiedMarket) => void;
  formatShortDate: (date: Date) => string;
  formatProbability: (prob: number) => string;
  getPlatformBadge: (platform: string, compact?: boolean) => React.ReactNode;
}

function EventCard({ 
  event, 
  isExpanded, 
  onToggle, 
  onSelectMarket,
  formatShortDate,
  formatProbability,
  getPlatformBadge 
}: EventCardProps) {
  const hasMultipleMarkets = event.markets.length > 1;
  const firstMarket = event.markets[0];

  // For single-market events, show directly
  if (!hasMultipleMarkets) {
    return (
      <div
        className="p-3 sm:p-4 hover:bg-muted/30 active:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => onSelectMarket(firstMarket)}
      >
        <div className="flex items-start gap-2 sm:gap-3">
          {getPlatformBadge(event.platform, true)}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground text-sm leading-tight line-clamp-2">
              {firstMarket.title}
            </p>
            <div className="flex items-center gap-2 sm:gap-3 mt-2">
              <div className="flex items-center gap-1">
                <ChevronUp className="w-3 h-3 text-chart-4" />
                <span className="font-mono text-xs font-medium">{(firstMarket.sideA.price * 100).toFixed(0)}¢</span>
              </div>
              <div className="w-12 sm:w-16 h-1.5 bg-chart-5/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-chart-4 rounded-full"
                  style={{ width: `${firstMarket.sideA.probability * 100}%` }}
                />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">{formatShortDate(firstMarket.endTime)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // For multi-market events, show collapsible
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="w-full p-3 sm:p-4 hover:bg-muted/30 active:bg-muted/50 cursor-pointer transition-colors text-left">
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5">
            {getPlatformBadge(event.platform, true)}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border">
              <Layers className="w-2.5 h-2.5 mr-0.5" />
              {event.markets.length}
            </Badge>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground text-sm leading-tight line-clamp-2">
              {event.eventTitle}
            </p>
            <div className="flex items-center gap-2 sm:gap-3 mt-2">
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {event.markets.length} markets
              </span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">•</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">{formatShortDate(event.earliestEnd)}</span>
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="bg-muted/20 border-t border-border">
          {event.markets.map((market) => (
            <div
              key={market.id}
              className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 active:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => onSelectMarket(market)}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm text-foreground line-clamp-1 flex-1">
                  {market.title}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1">
                    <ChevronUp className="w-3 h-3 text-chart-4" />
                    <span className="font-mono text-[10px] sm:text-xs font-medium">{(market.sideA.price * 100).toFixed(0)}¢</span>
                  </div>
                  <div className="w-8 sm:w-12 h-1 bg-chart-5/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-chart-4 rounded-full"
                      style={{ width: `${market.sideA.probability * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">{formatShortDate(market.endTime)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}