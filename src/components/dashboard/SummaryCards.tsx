import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DashboardSummary, Platform, SyncState } from '@/types/dome';
import { 
  BarChart3, 
  CircleDot, 
  Clock, 
  Activity, 
  Zap,
  AlertCircle,
  Loader2,
  TrendingUp,
  Search,
  Link2,
  FileStack,
  CheckCircle2
} from 'lucide-react';
import { ScanStatusWidget } from './ScanStatusWidget';

interface SummaryCardsProps {
  summary: DashboardSummary;
  syncState: Record<Platform, SyncState>;
}

export function SummaryCards({ summary, syncState }: SummaryCardsProps) {
  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString();
  };

  const hasErrors = syncState.POLYMARKET.lastError || syncState.KALSHI.lastError;
  const isRunning = syncState.POLYMARKET.isRunning || syncState.KALSHI.isRunning;

  const priceUpdateProgress = summary.totalMarkets > 0 
    ? Math.round((summary.marketsWithPrices / summary.totalMarkets) * 100) 
    : 0;

  const { discoveryProgress, liveRpm } = summary;
  const isDiscovering = discoveryProgress?.status === 'running' && Boolean(
    discoveryProgress?.polymarket?.hasMore || discoveryProgress?.kalshi?.hasMore
  );
  const isDiscoveryComplete = discoveryProgress?.status === 'completed';
  
  // Calculate duration if completed
  const discoveryDuration = discoveryProgress?.startedAt && discoveryProgress?.completedAt
    ? Math.round((discoveryProgress.completedAt.getTime() - discoveryProgress.startedAt.getTime()) / 1000)
    : 0;
  const durationStr = discoveryDuration > 60 
    ? `${Math.floor(discoveryDuration / 60)}m ${discoveryDuration % 60}s`
    : `${discoveryDuration}s`;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Auto-scan Status Widget */}
      <ScanStatusWidget />

      {/* Discovery Progress */}
      {isDiscovering && (
        <Card className="border-border shadow-sm bg-chart-4/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-1.5 sm:p-2 rounded-lg bg-chart-4/10">
                <Search className="w-4 h-4 sm:w-5 sm:h-5 text-chart-4 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                    Discovering markets...
                  </p>
                  <p className="text-xs sm:text-sm font-mono text-chart-4 ml-2">
                    {liveRpm} RPM
                  </p>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CircleDot className="w-3 h-3 text-chart-1" />
                    Poly: {discoveryProgress?.polymarket?.found?.toLocaleString() ?? 0}
                    {discoveryProgress?.polymarket?.hasMore && <Loader2 className="w-3 h-3 animate-spin" />}
                  </span>
                  <span className="flex items-center gap-1">
                    <CircleDot className="w-3 h-3 text-chart-2" />
                    Kalshi: {discoveryProgress?.kalshi?.found?.toLocaleString() ?? 0}
                    {discoveryProgress?.kalshi?.hasMore && <Loader2 className="w-3 h-3 animate-spin" />}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Discovery Complete */}
      {isDiscoveryComplete && (
        <Card className="border-chart-4/30 shadow-sm bg-chart-4/10">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-1.5 sm:p-2 rounded-lg bg-chart-4/20">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-chart-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs sm:text-sm font-medium text-chart-4">
                    Discovery complete!
                  </p>
                  <p className="text-xs font-mono text-muted-foreground ml-2">
                    {durationStr}
                  </p>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CircleDot className="w-3 h-3 text-chart-1" />
                    Poly: {discoveryProgress?.polymarket?.found?.toLocaleString() ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <CircleDot className="w-3 h-3 text-chart-2" />
                    Kalshi: {discoveryProgress?.kalshi?.found?.toLocaleString() ?? 0}
                  </span>
                  <span className="flex items-center gap-1 text-chart-4">
                    Total: {((discoveryProgress?.polymarket?.found ?? 0) + (discoveryProgress?.kalshi?.found ?? 0)).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Price Update Progress */}
      {summary.totalMarkets > 0 && priceUpdateProgress < 100 && !isDiscovering && (
        <Card className="border-border shadow-sm bg-primary/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                    Fetching live prices...
                  </p>
                  <div className="flex items-center gap-2 ml-2">
                    <p className="text-xs sm:text-sm font-mono text-muted-foreground">
                      {summary.marketsWithPrices}/{summary.totalMarkets}
                    </p>
                    <p className="text-xs font-mono text-chart-4">
                      {liveRpm} RPM
                    </p>
                  </div>
                </div>
                <Progress value={priceUpdateProgress} className="h-1.5 sm:h-2" />
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5">
                  {priceUpdateProgress}% complete
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compact Stats Grid - Mobile First */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {/* Total Markets */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
                <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm sm:text-lg font-semibold text-foreground leading-none">{summary.totalMarkets.toLocaleString()}</p>
                <p className="text-[9px] sm:text-xs text-muted-foreground">Markets</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Contracts */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-chart-3/10 shrink-0">
                <FileStack className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chart-3" />
              </div>
              <div className="min-w-0">
                <p className="text-sm sm:text-lg font-semibold text-foreground leading-none">{summary.totalContracts.toLocaleString()}</p>
                <p className="text-[9px] sm:text-xs text-muted-foreground">Contracts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Polymarket Count */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500/20 to-indigo-600/10 shrink-0">
                <CircleDot className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500" />
              </div>
              <div>
                <p className="text-sm sm:text-lg font-semibold text-foreground leading-none">{summary.polymarketCount.toLocaleString()}</p>
                <p className="text-[9px] sm:text-xs text-muted-foreground">Poly</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kalshi Count */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/10 shrink-0">
                <CircleDot className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
              </div>
              <div>
                <p className="text-sm sm:text-lg font-semibold text-foreground leading-none">{summary.kalshiCount.toLocaleString()}</p>
                <p className="text-[9px] sm:text-xs text-muted-foreground">Kalshi</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Matched Pairs */}
        <Card className="border-chart-4/30 shadow-sm bg-chart-4/5">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-chart-4/20 shrink-0">
                <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chart-4" />
              </div>
              <div>
                <p className="text-sm sm:text-lg font-semibold text-chart-4 leading-none">{summary.matchedMarkets}</p>
                <p className="text-[9px] sm:text-xs text-muted-foreground">Matched</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Last Discovery */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-muted shrink-0">
                {isRunning ? (
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary animate-spin" />
                ) : (
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-sm font-semibold text-foreground truncate leading-none">
                  {isRunning ? 'Syncing' : formatTime(summary.lastDiscoveryTime)}
                </p>
                <p className="text-[9px] sm:text-xs text-muted-foreground">Sync</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connection Mode */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg shrink-0 ${
                summary.connectionMode === 'polling' 
                  ? 'bg-chart-1/10' 
                  : summary.connectionMode === 'websocket' 
                  ? 'bg-chart-4/10' 
                  : 'bg-destructive/10'
              }`}>
                <Activity className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                  summary.connectionMode === 'polling' 
                    ? 'text-chart-1' 
                    : summary.connectionMode === 'websocket' 
                    ? 'text-chart-4' 
                    : 'text-destructive'
                }`} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-sm font-semibold text-foreground capitalize truncate leading-none">
                  {summary.connectionMode}
                </p>
                <p className="text-[9px] sm:text-xs text-muted-foreground">Mode</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requests Per Minute */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg shrink-0 ${hasErrors ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                {hasErrors ? (
                  <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive" />
                ) : (
                  <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-sm font-semibold text-foreground truncate leading-none">
                  {hasErrors ? 'Err' : `${liveRpm || summary.requestsPerMinute}`}
                </p>
                <p className="text-[9px] sm:text-xs text-muted-foreground">RPM</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}