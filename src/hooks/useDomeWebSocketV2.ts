import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface DomeWSOrderEvent {
  subscription_id: string;
  data: {
    token_id: string;
    token_label: string;
    side: 'BUY' | 'SELL';
    market_slug: string;
    condition_id: string;
    shares: number;
    shares_normalized: number;
    price: number;
    tx_hash: string;
    timestamp: number;
    order_hash: string;
    user: string;
    taker: string;
  };
}

export interface DomeWSAck {
  type: 'ack';
  subscription_id: string;
}

export interface DomeWSMessage {
  type: 'ack' | 'event' | 'error';
  subscription_id?: string;
  data?: DomeWSOrderEvent['data'];
  message?: string;
}

interface UseDomeWebSocketOptions {
  marketSlugs?: string[];
  conditionIds?: string[];
  onOrderEvent?: (event: DomeWSOrderEvent) => void;
  enabled?: boolean;
}

interface UseDomeWebSocketResult {
  isConnected: boolean;
  isConnecting: boolean;
  subscriptionCount: number;
  recentOrders: DomeWSOrderEvent[];
  connect: () => void;
  disconnect: () => void;
  lastEventTime: number | null;
}

export function useDomeWebSocketV2(options: UseDomeWebSocketOptions = {}): UseDomeWebSocketResult {
  const { marketSlugs = [], conditionIds = [], onOrderEvent, enabled = true } = options;
  const { getApiKey } = useAuth();
  
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [recentOrders, setRecentOrders] = useState<DomeWSOrderEvent[]>([]);
  const [lastEventTime, setLastEventTime] = useState<number | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionIdsRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    const apiKey = getApiKey();
    if (!apiKey) {
      console.warn('[DomeWS] No API key available');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[DomeWS] Already connected');
      return;
    }

    setIsConnecting(true);
    console.log('[DomeWS] Connecting to wss://ws.domeapi.io');

    try {
      const ws = new WebSocket(`wss://ws.domeapi.io/${apiKey}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[DomeWS] Connected');
        setIsConnected(true);
        setIsConnecting(false);
        reconnectAttempts.current = 0;

        // Subscribe to markets if we have any
        if (marketSlugs.length > 0 || conditionIds.length > 0) {
          const subscribePayload: any = {
            action: 'subscribe',
            platform: 'polymarket',
            version: 1,
            type: 'orders',
            filters: {},
          };

          if (marketSlugs.length > 0) {
            subscribePayload.filters.market_slugs = marketSlugs;
          }
          if (conditionIds.length > 0) {
            subscribePayload.filters.condition_ids = conditionIds;
          }

          console.log('[DomeWS] Subscribing with filters:', subscribePayload.filters);
          ws.send(JSON.stringify(subscribePayload));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: DomeWSMessage = JSON.parse(event.data);
          console.log('[DomeWS] Received:', message.type);

          if (message.type === 'ack' && message.subscription_id) {
            subscriptionIdsRef.current.add(message.subscription_id);
            setSubscriptionCount(subscriptionIdsRef.current.size);
            console.log('[DomeWS] Subscription confirmed:', message.subscription_id);
          } else if (message.type === 'event' && message.data) {
            const orderEvent: DomeWSOrderEvent = {
              subscription_id: message.subscription_id || '',
              data: message.data,
            };
            
            setLastEventTime(Date.now());
            setRecentOrders(prev => [orderEvent, ...prev].slice(0, 50));
            
            console.log('[DomeWS] Order event:', {
              market: message.data.market_slug,
              side: message.data.side,
              price: message.data.price,
              shares: message.data.shares_normalized,
            });

            onOrderEvent?.(orderEvent);
          } else if (message.type === 'error') {
            console.error('[DomeWS] Error:', message.message);
          }
        } catch (err) {
          console.error('[DomeWS] Failed to parse message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('[DomeWS] Error:', error);
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        console.log('[DomeWS] Disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        subscriptionIdsRef.current.clear();
        setSubscriptionCount(0);
        wsRef.current = null;

        // Attempt reconnect if enabled and not manually disconnected
        if (enabled && event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`[DomeWS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };
    } catch (err) {
      console.error('[DomeWS] Failed to create WebSocket:', err);
      setIsConnecting(false);
    }
  }, [getApiKey, marketSlugs, conditionIds, onOrderEvent, enabled]);

  const disconnect = useCallback(() => {
    console.log('[DomeWS] Disconnecting');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Unsubscribe from all subscriptions
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      subscriptionIdsRef.current.forEach(subId => {
        wsRef.current?.send(JSON.stringify({
          action: 'unsubscribe',
          version: 1,
          subscription_id: subId,
        }));
      });
    }

    wsRef.current?.close(1000, 'User disconnected');
    wsRef.current = null;
    subscriptionIdsRef.current.clear();
    setIsConnected(false);
    setSubscriptionCount(0);
  }, []);

  // Auto-connect when enabled and we have markets to subscribe to
  useEffect(() => {
    if (enabled && (marketSlugs.length > 0 || conditionIds.length > 0)) {
      connect();
    } else if (!enabled) {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled]);

  // Update subscriptions when markets change
  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (marketSlugs.length === 0 && conditionIds.length === 0) return;

    // Unsubscribe from old subscriptions
    subscriptionIdsRef.current.forEach(subId => {
      wsRef.current?.send(JSON.stringify({
        action: 'unsubscribe',
        version: 1,
        subscription_id: subId,
      }));
    });
    subscriptionIdsRef.current.clear();
    setSubscriptionCount(0);

    // Subscribe with new filters
    const subscribePayload: any = {
      action: 'subscribe',
      platform: 'polymarket',
      version: 1,
      type: 'orders',
      filters: {},
    };

    if (marketSlugs.length > 0) {
      subscribePayload.filters.market_slugs = marketSlugs;
    }
    if (conditionIds.length > 0) {
      subscribePayload.filters.condition_ids = conditionIds;
    }

    console.log('[DomeWS] Updating subscriptions with filters:', subscribePayload.filters);
    wsRef.current.send(JSON.stringify(subscribePayload));
  }, [marketSlugs.join(','), conditionIds.join(',')]);

  return {
    isConnected,
    isConnecting,
    subscriptionCount,
    recentOrders,
    connect,
    disconnect,
    lastEventTime,
  };
}