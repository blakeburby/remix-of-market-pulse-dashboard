import { Card, CardContent } from '@/components/ui/card';
import { DashboardSummary, Platform, SyncState } from '@/types/dome';
import { 
  BarChart3, 
  Coins, 
  Clock, 
  Activity, 
  Zap,
  AlertCircle,
  Loader2
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

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {/* Total Markets */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{summary.totalMarkets}</p>
              <p className="text-xs text-muted-foreground">Total Markets</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Polymarket Count */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-chart-1/20">
              <Coins className="w-5 h-5 text-chart-1" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{summary.polymarketCount}</p>
              <p className="text-xs text-muted-foreground">Polymarket</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kalshi Count */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-chart-2/20">
              <Coins className="w-5 h-5 text-chart-2" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{summary.kalshiCount}</p>
              <p className="text-xs text-muted-foreground">Kalshi</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last Discovery */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent">
              {isRunning ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : (
                <Clock className="w-5 h-5 text-accent-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {isRunning ? 'Syncing...' : formatTime(summary.lastDiscoveryTime)}
              </p>
              <p className="text-xs text-muted-foreground">Last Discovery</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Mode */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              summary.connectionMode === 'polling' 
                ? 'bg-chart-1/20' 
                : summary.connectionMode === 'websocket' 
                ? 'bg-green-500/20' 
                : 'bg-destructive/20'
            }`}>
              <Activity className={`w-5 h-5 ${
                summary.connectionMode === 'polling' 
                  ? 'text-chart-1' 
                  : summary.connectionMode === 'websocket' 
                  ? 'text-green-500' 
                  : 'text-destructive'
              }`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground capitalize">
                {summary.connectionMode}
              </p>
              <p className="text-xs text-muted-foreground">Update Mode</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests Per Minute */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${hasErrors ? 'bg-destructive/20' : 'bg-primary/10'}`}>
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
              <p className="text-xs text-muted-foreground">
                {hasErrors ? 'Check settings' : 'API Requests'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
