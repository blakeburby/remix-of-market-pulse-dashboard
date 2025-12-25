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
      case 'connected': return 'bg-chart-4/10 text-chart-4';
      case 'connecting': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      case 'error': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card className="border-border shadow-sm w-full lg:w-80">
      <CardHeader className="p-3 sm:p-5 pb-2 sm:pb-3">
        <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-2">
          <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-5 pt-0 space-y-3 sm:space-y-5">
        {/* Mobile: Compact grid layout */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-1 sm:gap-5">
          {/* Tier Selection */}
          <div className="space-y-1.5 sm:space-y-2">
            <label className="text-[10px] sm:text-xs font-medium text-muted-foreground">API Tier</label>
            <Select value={tier} onValueChange={(v) => setTier(v as DomeTier)}>
              <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="dev">Dev</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
              {limits.qps} QPS • {limits.qp10s} per 10s • {limits.subscriptions} WS subs
            </p>
          </div>

          {/* WebSocket Status */}
          <div className="space-y-1.5 sm:space-y-2">
            <label className="text-[10px] sm:text-xs font-medium text-muted-foreground">WebSocket</label>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <Badge variant="secondary" className={`${getWsStatusColor()} border-0 font-medium text-[10px] sm:text-xs px-1.5 sm:px-2`}>
                {wsStatus === 'connected' ? (
                  <Wifi className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                ) : (
                  <WifiOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                )}
                {wsStatus}
              </Badge>
              {wsStatus === 'connected' && wsSubscriptionCount > 0 && (
                <span className="text-[10px] sm:text-xs text-muted-foreground">
                  {wsSubscriptionCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-1.5 sm:space-y-2">
          <label className="text-[10px] sm:text-xs font-medium text-muted-foreground">Data Sync</label>
          <div className="flex gap-2">
            <Button
              variant={isDiscovering ? 'secondary' : 'default'}
              size="sm"
              className="flex-1 font-medium h-8 sm:h-9 text-xs sm:text-sm"
              onClick={isDiscovering ? stopDiscovery : startDiscovery}
            >
              {isDiscovering ? (
                <>
                  <Pause className="w-3 h-3 mr-1 sm:mr-1.5" />
                  <span className="hidden xs:inline">Stop</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-1 sm:mr-1.5" />
                  <span className="hidden xs:inline">Discover</span>
                </>
              )}
            </Button>
            <Button
              variant={isPriceUpdating ? 'secondary' : 'outline'}
              size="sm"
              className="flex-1 font-medium h-8 sm:h-9 text-xs sm:text-sm"
              onClick={isPriceUpdating ? stopPriceUpdates : startPriceUpdates}
            >
              {isPriceUpdating ? (
                <>
                  <Pause className="w-3 h-3 mr-1 sm:mr-1.5" />
                  <span className="hidden xs:inline">Stop</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3 mr-1 sm:mr-1.5" />
                  <span className="hidden xs:inline">Prices</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Status - Compact on mobile */}
        <div className="space-y-1 sm:space-y-2 text-[10px] sm:text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground font-medium">Polymarket:</span>
            <span className={`font-medium ${syncState.POLYMARKET.lastError ? 'text-destructive' : 'text-foreground'}`}>
              {syncState.POLYMARKET.lastError ? 'Error' : syncState.POLYMARKET.isRunning ? 'Syncing' : 'Ready'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground font-medium">Kalshi:</span>
            <span className={`font-medium ${syncState.KALSHI.lastError ? 'text-destructive' : 'text-foreground'}`}>
              {syncState.KALSHI.lastError ? 'Error' : syncState.KALSHI.isRunning ? 'Syncing' : 'Ready'}
            </span>
          </div>
        </div>

        {/* Errors */}
        {(syncState.POLYMARKET.lastError || syncState.KALSHI.lastError) && (
          <div className="text-[10px] sm:text-xs text-destructive bg-destructive/10 p-2 sm:p-3 rounded-lg font-medium">
            {syncState.POLYMARKET.lastError || syncState.KALSHI.lastError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}