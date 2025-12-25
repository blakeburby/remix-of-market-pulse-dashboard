import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useMarkets } from '@/contexts/MarketsContext';
import { DomeTier, TIER_LIMITS } from '@/types/dome';
import { Settings, Play, Pause, RefreshCw, Wifi, WifiOff } from 'lucide-react';

export function SettingsPanel() {
  const { tier, setTier } = useAuth();
  const { 
    isDiscovering, 
    isPriceUpdating, 
    startDiscovery, 
    stopDiscovery,
    startPriceUpdates,
    stopPriceUpdates,
    syncState,
    wsStatus,
    wsSubscriptionCount,
  } = useMarkets();

  const limits = TIER_LIMITS[tier];

  const getWsStatusColor = () => {
    switch (wsStatus) {
      case 'connected': return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400';
      case 'connecting': return 'bg-amber-500/20 text-amber-600 dark:text-amber-400';
      case 'error': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card className="border-border w-full lg:w-80">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-4">
        {/* Tier Selection */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">API Tier</label>
          <Select value={tier} onValueChange={(v) => setTier(v as DomeTier)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="dev">Dev</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {limits.qps} QPS • {limits.qp10s} per 10s • {limits.subscriptions} WS subs
          </p>
        </div>

        {/* WebSocket Status */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">WebSocket</label>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={`${getWsStatusColor()} border-0`}>
              {wsStatus === 'connected' ? (
                <Wifi className="w-3 h-3 mr-1" />
              ) : (
                <WifiOff className="w-3 h-3 mr-1" />
              )}
              {wsStatus}
            </Badge>
            {wsStatus === 'connected' && wsSubscriptionCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {wsSubscriptionCount} sub{wsSubscriptionCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Data Sync</label>
          <div className="flex gap-2">
            <Button
              variant={isDiscovering ? 'secondary' : 'default'}
              size="sm"
              className="flex-1"
              onClick={isDiscovering ? stopDiscovery : startDiscovery}
            >
              {isDiscovering ? (
                <>
                  <Pause className="w-3 h-3 mr-1" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-1" />
                  Discover
                </>
              )}
            </Button>
            <Button
              variant={isPriceUpdating ? 'secondary' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={isPriceUpdating ? stopPriceUpdates : startPriceUpdates}
            >
              {isPriceUpdating ? (
                <>
                  <Pause className="w-3 h-3 mr-1" />
                  Stop
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Prices
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Status */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Polymarket:</span>
            <span className={syncState.POLYMARKET.lastError ? 'text-destructive' : 'text-foreground'}>
              {syncState.POLYMARKET.lastError ? 'Error' : syncState.POLYMARKET.isRunning ? 'Syncing...' : 'Ready'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Kalshi:</span>
            <span className={syncState.KALSHI.lastError ? 'text-destructive' : 'text-foreground'}>
              {syncState.KALSHI.lastError ? 'Error' : syncState.KALSHI.isRunning ? 'Syncing...' : 'Ready'}
            </span>
          </div>
        </div>

        {/* Errors */}
        {(syncState.POLYMARKET.lastError || syncState.KALSHI.lastError) && (
          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
            {syncState.POLYMARKET.lastError || syncState.KALSHI.lastError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
