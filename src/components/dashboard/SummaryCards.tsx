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
  TrendingUp
} from 'lucide-react';

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

  return (
    <div className="space-y-4">
      {/* Price Update Progress */}
      {summary.totalMarkets > 0 && priceUpdateProgress < 100 && (
        <Card className="border-border shadow-sm bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">
                    Fetching live prices...
                  </p>
                  <p className="text-sm font-mono text-muted-foreground">
                    {summary.marketsWithPrices} / {summary.totalMarkets}
                  </p>
                </div>
                <Progress value={priceUpdateProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1.5">
                  {priceUpdateProgress}% of markets have real-time prices
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Markets */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{summary.totalMarkets}</p>
                <p className="text-xs text-muted-foreground font-medium">Total Markets</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Polymarket Count */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-chart-1/10">
                <CircleDot className="w-5 h-5 text-chart-1" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{summary.polymarketCount}</p>
                <p className="text-xs text-muted-foreground font-medium">Polymarket</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kalshi Count */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-chart-2/10">
                <CircleDot className="w-5 h-5 text-chart-2" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{summary.kalshiCount}</p>
                <p className="text-xs text-muted-foreground font-medium">Kalshi</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Last Discovery */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-muted">
                {isRunning ? (
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                ) : (
                  <Clock className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {isRunning ? 'Syncing...' : formatTime(summary.lastDiscoveryTime)}
                </p>
                <p className="text-xs text-muted-foreground font-medium">Last Sync</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connection Mode */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className={`p-2.5 rounded-lg ${
                summary.connectionMode === 'polling' 
                  ? 'bg-chart-1/10' 
                  : summary.connectionMode === 'websocket' 
                  ? 'bg-chart-4/10' 
                  : 'bg-destructive/10'
              }`}>
                <Activity className={`w-5 h-5 ${
                  summary.connectionMode === 'polling' 
                    ? 'text-chart-1' 
                    : summary.connectionMode === 'websocket' 
                    ? 'text-chart-4' 
                    : 'text-destructive'
                }`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground capitalize">
                  {summary.connectionMode}
                </p>
                <p className="text-xs text-muted-foreground font-medium">Mode</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requests Per Minute */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className={`p-2.5 rounded-lg ${hasErrors ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                {hasErrors ? (
                  <AlertCircle className="w-5 h-5 text-destructive" />
                ) : (
                  <Zap className="w-5 h-5 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {hasErrors ? 'Error' : `${summary.requestsPerMinute}/min`}
                </p>
                <p className="text-xs text-muted-foreground font-medium">
                  {hasErrors ? 'Check settings' : 'Requests'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}