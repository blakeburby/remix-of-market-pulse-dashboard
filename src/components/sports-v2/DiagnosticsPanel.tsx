import { useState } from 'react';
import { DiagnosticEntry } from '@/hooks/useSportsArbitrageV2';
import { RateLimiterStats } from '@/lib/rate-limiter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Activity, ChevronDown, ChevronUp, Trash2, AlertCircle, CheckCircle2, Gauge, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

// Build stamp for cache debugging
const BUILD_STAMP = new Date().toISOString().slice(0, 19).replace('T', ' ');

interface DiagnosticsPanelProps {
  diagnostics: DiagnosticEntry[];
  onClear: () => void;
  rateLimiterStats?: RateLimiterStats;
}

export function DiagnosticsPanel({ diagnostics, onClear, rateLimiterStats }: DiagnosticsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const successCount = diagnostics.filter((d) => d.ok).length;
  const errorCount = diagnostics.filter((d) => !d.ok).length;
  const rateLimitedCount = diagnostics.filter((d) => d.status === 429).length;

  const matchingMarketsCalls = diagnostics.filter((d) => d.type === 'matching-markets');
  const lastMatchingMarkets = matchingMarketsCalls[0] ?? null;

  const tokenUsagePercent = rateLimiterStats
    ? ((rateLimiterStats.requestsIn10s / rateLimiterStats.maxPer10s) * 100)
    : 0;

  return (
    <Card className="border-muted">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">API Diagnostics</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {diagnostics.length} calls
                </Badge>
                {successCount > 0 && (
                  <Badge variant="outline" className="text-xs text-chart-2 border-chart-2">
                    {successCount} ok
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="outline" className="text-xs text-destructive border-destructive">
                    {errorCount} errors
                  </Badge>
                )}
                {rateLimitedCount > 0 && (
                  <Badge variant="outline" className="text-xs text-warning border-warning">
                    {rateLimitedCount} throttled
                  </Badge>
                )}
                {rateLimiterStats && (
                  <Badge variant="outline" className="text-xs">
                    {rateLimiterStats.requestsPerMinute} RPM
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Build: {BUILD_STAMP}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {lastMatchingMarkets && (
                  <span className="text-xs text-muted-foreground">
                    Last: {lastMatchingMarkets.durationMs}ms
                  </span>
                )}
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 space-y-3">
            {/* Rate Limiter Stats */}
            {rateLimiterStats && (
              <div className="p-3 rounded-lg bg-muted/50 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5" />
                    Rate Limiter ({rateLimiterStats.tier.toUpperCase()})
                  </span>
                  {rateLimiterStats.isRateLimited && (
                    <Badge variant="destructive" className="text-[10px] gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Throttled
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Tokens used (10s window)</span>
                    <span>{rateLimiterStats.requestsIn10s} / {rateLimiterStats.maxPer10s}</span>
                  </div>
                  <Progress value={tokenUsagePercent} className="h-1.5" />
                </div>
                <div className="flex items-center gap-4 text-muted-foreground">
                  <span>RPM: {rateLimiterStats.requestsPerMinute}</span>
                  <span>Available: {rateLimiterStats.availableTokens}</span>
                </div>
              </div>
            )}

            {/* Summary */}
            {lastMatchingMarkets && (
              <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-xs">
                <p className="font-medium">Last Matching Markets Request</p>
                <p className="text-muted-foreground break-all">{lastMatchingMarkets.url}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span>
                    Status:{' '}
                    <Badge
                      variant={lastMatchingMarkets.ok ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      {lastMatchingMarkets.status ?? 'Network Error'}
                    </Badge>
                  </span>
                  <span>Duration: {lastMatchingMarkets.durationMs}ms</span>
                  <span>{format(lastMatchingMarkets.timestamp, 'HH:mm:ss')}</span>
                </div>
                {lastMatchingMarkets.error && (
                  <p className="text-destructive">{lastMatchingMarkets.error}</p>
                )}
                {lastMatchingMarkets.responseSnippet && (
                  <p className="text-destructive/80 text-[10px] break-all mt-1">
                    Response: {lastMatchingMarkets.responseSnippet}
                  </p>
                )}
              </div>
            )}

            {/* Clear + Scroll */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Recent API calls (max 100)</span>
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={onClear}>
                <Trash2 className="w-3 h-3" />
                Clear
              </Button>
            </div>

            {/* Log List */}
            <ScrollArea className="h-[240px] rounded border border-border">
              <div className="p-2 space-y-1 text-xs font-mono">
                {diagnostics.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No API calls recorded yet</p>
                )}
                {diagnostics.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      'flex items-start gap-2 p-2 rounded hover:bg-muted/50',
                      !entry.ok && 'bg-destructive/5'
                    )}
                  >
                    {entry.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-chart-2 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1">
                          {entry.type}
                        </Badge>
                        <span className="text-muted-foreground">
                          {entry.status ?? 'ERR'} · {entry.durationMs}ms
                        </span>
                        <span className="text-muted-foreground">
                          {format(entry.timestamp, 'HH:mm:ss.SSS')}
                        </span>
                      </div>
                      <p className="text-muted-foreground truncate">{entry.url}</p>
                      {entry.ticker && (
                        <p className="text-muted-foreground">Ticker: {entry.ticker}</p>
                      )}
                      {entry.parsedParams && (
                        <div className="text-muted-foreground text-[10px] space-x-2">
                          {entry.parsedParams.start_time && (
                            <span>
                              start_time: {entry.parsedParams.start_time} ({entry.parsedParams.start_time_unit})
                            </span>
                          )}
                          {entry.parsedParams.end_time && (
                            <span>
                              end_time: {entry.parsedParams.end_time} ({entry.parsedParams.end_time_unit})
                            </span>
                          )}
                        </div>
                      )}
                      {entry.error && <p className="text-destructive">{entry.error}</p>}
                      {entry.responseSnippet && (
                        <p className="text-destructive/80 text-[10px] break-all">
                          Response: {entry.responseSnippet}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}