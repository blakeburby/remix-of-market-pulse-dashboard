import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useMarkets } from '@/contexts/MarketsContext';
import { DomeTier, TIER_LIMITS } from '@/types/dome';
import { Settings, Play, Pause, RefreshCw } from 'lucide-react';

export function SettingsPanel() {
  const { tier, setTier } = useAuth();
  const { 
    isDiscovering, 
    isPriceUpdating, 
    startDiscovery, 
    stopDiscovery,
    startPriceUpdates,
    stopPriceUpdates,
    syncState 
  } = useMarkets();

  const limits = TIER_LIMITS[tier];

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
            {limits.qps} QPS • {limits.qp10s} per 10s
          </p>
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
