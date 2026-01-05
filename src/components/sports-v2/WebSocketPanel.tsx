import { DomeWSOrderEvent } from '@/hooks/useDomeWebSocketV2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { 
  ChevronDown, 
  ChevronUp, 
  Radio, 
  Loader2, 
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Zap,
  WifiOff
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';

interface WebSocketPanelProps {
  isConnected: boolean;
  isConnecting: boolean;
  subscriptionCount: number;
  recentOrders: DomeWSOrderEvent[];
  lastEventTime: number | null;
  wsEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function WebSocketPanel({
  isConnected,
  isConnecting,
  subscriptionCount,
  recentOrders,
  lastEventTime,
  wsEnabled,
  onToggle,
  onConnect,
  onDisconnect,
}: WebSocketPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="border-muted">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <Radio className="w-4 h-4 text-chart-2" />
                ) : isConnecting ? (
                  <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                ) : (
                  <WifiOff className="w-4 h-4 text-muted-foreground" />
                )}
                <CardTitle className="text-sm font-medium">WebSocket Stream</CardTitle>
                <Badge 
                  variant={isConnected ? 'default' : 'secondary'} 
                  className={cn("text-xs", isConnected && "bg-chart-2 hover:bg-chart-2")}
                >
                  {isConnected ? 'Live' : isConnecting ? 'Connecting...' : 'Offline'}
                </Badge>
                {subscriptionCount > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {subscriptionCount} sub{subscriptionCount !== 1 ? 's' : ''}
                  </Badge>
                )}
                {recentOrders.length > 0 && (
                  <Badge variant="outline" className="text-xs gap-1 text-chart-4">
                    <Activity className="w-3 h-3" />
                    {recentOrders.length} orders
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {lastEventTime && (
                  <span className="text-xs text-muted-foreground">
                    Last: {format(lastEventTime, 'HH:mm:ss')}
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
            {/* Controls */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <Switch
                  checked={wsEnabled}
                  onCheckedChange={onToggle}
                  id="ws-enabled"
                />
                <Label htmlFor="ws-enabled" className="text-sm">
                  Enable WebSocket
                </Label>
              </div>
              <div className="flex gap-2">
                {!isConnected && wsEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="h-7"
                  >
                    {isConnecting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      'Connect'
                    )}
                  </Button>
                )}
                {isConnected && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onDisconnect}
                    className="h-7"
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            </div>

            {/* Connection Info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                <span className="font-medium">Status:</span>{' '}
                {isConnected 
                  ? 'Connected to wss://ws.domeapi.io' 
                  : isConnecting 
                    ? 'Establishing connection...'
                    : 'Disconnected'}
              </p>
              <p>
                <span className="font-medium">Mode:</span>{' '}
                Polymarket order stream (triggers price refresh on activity)
              </p>
            </div>

            {/* Recent Orders */}
            {recentOrders.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Recent Order Activity</p>
                <ScrollArea className="h-[160px] rounded border border-border">
                  <div className="p-2 space-y-1 text-xs font-mono">
                    {recentOrders.slice(0, 20).map((order, i) => (
                      <div
                        key={`${order.data.order_hash}-${i}`}
                        className={cn(
                          'flex items-center gap-2 p-1.5 rounded',
                          order.data.side === 'BUY' ? 'bg-chart-2/5' : 'bg-chart-5/5'
                        )}
                      >
                        {order.data.side === 'BUY' ? (
                          <ArrowUpRight className="w-3 h-3 text-chart-2 shrink-0" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3 text-chart-5 shrink-0" />
                        )}
                        <span className="truncate flex-1">
                          {order.data.market_slug?.slice(0, 30) || 'Unknown market'}
                        </span>
                        <span className={cn(
                          'font-semibold',
                          order.data.side === 'BUY' ? 'text-chart-2' : 'text-chart-5'
                        )}>
                          {order.data.side}
                        </span>
                        <span>{order.data.shares_normalized?.toFixed(1) || '?'}</span>
                        <span>@ {(order.data.price * 100).toFixed(0)}¢</span>
                        <span className="text-muted-foreground">
                          {format(order.data.timestamp * 1000, 'HH:mm:ss')}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Empty state */}
            {isConnected && recentOrders.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Waiting for order activity...</p>
                <p className="text-xs">Orders for subscribed markets will appear here</p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}