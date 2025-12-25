import { useEffect, useRef, useState, useCallback } from 'react';
import { DomeWSEvent, DomeWSAck, DomeWSSubscription, TIER_LIMITS, DomeTier } from '@/types/dome';

type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseDomeWebSocketOptions {
  apiKey: string | null;
  tier: DomeTier;
  marketSlugs: string[];
  onPriceUpdate: (tokenId: string, price: number, timestamp: number) => void;
  enabled: boolean;
}

export function useDomeWebSocket({
  apiKey,
  tier,
  marketSlugs,
  onPriceUpdate,
  enabled,
}: UseDomeWebSocketOptions) {
  const [status, setStatus] = useState<WSStatus>('disconnected');
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionIdsRef = useRef<Set<string>>(new Set());
  const reconnectAttemptsRef = useRef(0);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    subscriptionIdsRef.current.clear();
    setSubscriptionCount(0);
    setStatus('disconnected');
  }, []);

  const subscribe = useCallback((ws: WebSocket, slugs: string[]) => {
    const limits = TIER_LIMITS[tier];
    const maxSubscriptions = limits.subscriptions;
    
    // Free tier: only 2 subscriptions allowed, so we can only track a few markets via WS
    // We'll put all markets in a single subscription if possible
    const maxMarketsPerSub = tier === 'free' ? 5 : 100;
    const maxTotalMarkets = maxSubscriptions * maxMarketsPerSub;
    const limitedSlugs = slugs.slice(0, maxTotalMarkets);
    
    // For free tier, just use 1 subscription to avoid limit issues
    const numSubs = tier === 'free' ? 1 : Math.min(Math.ceil(limitedSlugs.length / maxMarketsPerSub), maxSubscriptions);
    const chunks: string[][] = [];
    
    for (let i = 0; i < numSubs; i++) {
      const start = i * maxMarketsPerSub;
      const end = Math.min(start + maxMarketsPerSub, limitedSlugs.length);
      if (start < limitedSlugs.length) {
        chunks.push(limitedSlugs.slice(start, end));
      }
    }

    console.log(`[WS] Subscribing to ${chunks.length} chunk(s) with ${limitedSlugs.length} total markets (tier: ${tier}, max subs: ${maxSubscriptions})`);

    chunks.forEach((chunk, index) => {
      const subscription: DomeWSSubscription = {
        action: 'subscribe',
        platform: 'polymarket',
        version: 1,
        type: 'orders',
        filters: {
          market_slugs: chunk,
        },
      };

      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(subscription));
          console.log(`[WS] Sent subscription ${index + 1}/${chunks.length} for ${chunk.length} markets`);
        }
      }, index * 200); // Stagger subscriptions
    });
  }, [tier]);

  const connect = useCallback(() => {
    if (!apiKey || !enabled || marketSlugs.length === 0) {
      return;
    }

    cleanup();
    setStatus('connecting');
    console.log('[WS] Connecting to Dome WebSocket...');

    try {
      const ws = new WebSocket(`wss://ws.domeapi.io/${apiKey}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected to Dome WebSocket');
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
        
        // Subscribe to markets
        subscribe(ws, marketSlugs);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'ack') {
            const ack = data as DomeWSAck;
            subscriptionIdsRef.current.add(ack.subscription_id);
            setSubscriptionCount(subscriptionIdsRef.current.size);
            console.log(`[WS] Subscription acknowledged: ${ack.subscription_id}`);
          } else if (data.type === 'event') {
            const eventData = data as DomeWSEvent;
            // Update price from order event
            // The price in the event is the trade price
            onPriceUpdate(
              eventData.data.token_id,
              eventData.data.price,
              eventData.data.timestamp
            );
          } else if (data.type === 'error') {
            console.error('[WS] Error from server:', data);
          }
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] WebSocket error:', error);
        setStatus('error');
      };

      ws.onclose = (event) => {
        console.log(`[WS] Connection closed: ${event.code} - ${event.reason}`);
        setStatus('disconnected');
        subscriptionIdsRef.current.clear();
        setSubscriptionCount(0);

        // Auto-reconnect with exponential backoff
        if (enabled && apiKey) {
          const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          console.log(`[WS] Reconnecting in ${backoffMs}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, backoffMs);
        }
      };
    } catch (error) {
      console.error('[WS] Failed to create WebSocket:', error);
      setStatus('error');
    }
  }, [apiKey, enabled, marketSlugs, cleanup, subscribe, onPriceUpdate]);

  // Connect when enabled and we have markets
  useEffect(() => {
    if (enabled && apiKey && marketSlugs.length > 0) {
      connect();
    } else {
      cleanup();
    }

    return cleanup;
  }, [enabled, apiKey, marketSlugs.length > 0]);

  // Resubscribe when market list changes significantly
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && marketSlugs.length > 0) {
      // For simplicity, reconnect to update subscriptions
      // A more sophisticated approach would track and update subscriptions
      console.log('[WS] Market list changed, reconnecting...');
      connect();
    }
  }, [marketSlugs.join(',')]);

  return {
    status,
    subscriptionCount,
    isConnected: status === 'connected',
    reconnect: connect,
    disconnect: cleanup,
  };
}
