import { useEffect, useRef, useState, useCallback } from 'react';
import { kalshiOrderbookManager, KalshiPrices, OrderbookSnapshot, OrderbookDelta } from '@/lib/kalshi-orderbook';

export type KalshiWSStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error';

interface UseKalshiWebSocketOptions {
  marketTickers: string[];
  onPriceUpdate: (marketTicker: string, prices: KalshiPrices) => void;
  enabled: boolean;
}

interface KalshiMessage {
  id?: number;
  type?: string;
  msg?: {
    type: string;
    sid?: number;
    seq?: number;
    [key: string]: unknown;
  };
  error?: {
    code: string;
    msg: string;
  };
}

// Supabase project URL for edge function
const SUPABASE_PROJECT_ID = 'rpmzzscuboxcnadovgth';
const WS_PROXY_URL = `wss://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/kalshi-ws-proxy`;

export function useKalshiWebSocket({
  marketTickers,
  onPriceUpdate,
  enabled,
}: UseKalshiWebSocketOptions) {
  const [status, setStatus] = useState<KalshiWSStatus>('disconnected');
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const subscribedTickersRef = useRef<Set<string>>(new Set());
  const pendingSubscriptionsRef = useRef<string[]>([]);
  const isAuthenticatedRef = useRef(false);
  const commandIdRef = useRef(2); // Start at 2 since 1 is used for login

  // Get next command ID
  const getNextCommandId = useCallback(() => {
    return commandIdRef.current++;
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    subscribedTickersRef.current.clear();
    pendingSubscriptionsRef.current = [];
    isAuthenticatedRef.current = false;
    setSubscriptionCount(0);
    setStatus('disconnected');
    setError(null);
    kalshiOrderbookManager.clear();
  }, []);

  // Subscribe to market orderbook
  const subscribeToMarket = useCallback((ws: WebSocket, ticker: string) => {
    if (subscribedTickersRef.current.has(ticker)) {
      return;
    }

    const subscribeMsg = {
      id: getNextCommandId(),
      cmd: 'subscribe',
      params: {
        channels: ['orderbook_delta'],
        market_ticker: ticker,
      },
    };

    console.log(`[Kalshi WS] Subscribing to orderbook for ${ticker}`);
    ws.send(JSON.stringify(subscribeMsg));
    subscribedTickersRef.current.add(ticker);
    setSubscriptionCount(subscribedTickersRef.current.size);
  }, [getNextCommandId]);

  // Subscribe to all pending markets
  const subscribeToPendingMarkets = useCallback((ws: WebSocket) => {
    const pending = [...pendingSubscriptionsRef.current];
    pendingSubscriptionsRef.current = [];

    // Batch subscriptions with small delay to avoid rate limiting
    pending.forEach((ticker, index) => {
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          subscribeToMarket(ws, ticker);
        }
      }, index * 100); // 100ms between subscriptions
    });
  }, [subscribeToMarket]);

  // Handle incoming messages
  const handleMessage = useCallback((data: KalshiMessage) => {
    // Handle proxy status messages
    if (data.type === 'connected') {
      console.log('[Kalshi WS] Proxy connected, awaiting authentication');
      setStatus('authenticating');
      return;
    }

    if (data.type === 'error') {
      console.error('[Kalshi WS] Proxy error:', data);
      setError(data.error?.msg || 'Unknown error');
      setStatus('error');
      return;
    }

    if (data.type === 'disconnected') {
      console.log('[Kalshi WS] Proxy disconnected');
      setStatus('disconnected');
      return;
    }

    // Handle Kalshi responses
    if (data.id === 1 && !data.error) {
      // Login success
      console.log('[Kalshi WS] Authentication successful');
      isAuthenticatedRef.current = true;
      setStatus('connected');
      
      // Subscribe to pending markets
      if (wsRef.current) {
        subscribeToPendingMarkets(wsRef.current);
      }
      return;
    }

    if (data.error) {
      console.error('[Kalshi WS] Kalshi error:', data.error);
      if (data.id === 1) {
        // Auth failed
        setError(`Authentication failed: ${data.error.msg}`);
        setStatus('error');
      }
      return;
    }

    // Handle subscription acknowledgments
    if (data.id && data.id > 1 && !data.error) {
      console.log(`[Kalshi WS] Subscription ${data.id} acknowledged`);
      return;
    }

    // Handle orderbook messages
    if (data.msg) {
      const msg = data.msg;
      
      if (msg.type === 'orderbook_snapshot') {
        const snapshot: OrderbookSnapshot = {
          market_ticker: msg.market_ticker as string,
          yes: msg.yes as [number, number][],
          no: msg.no as [number, number][],
          seq: msg.seq as number,
        };
        
        kalshiOrderbookManager.applySnapshot(snapshot);
        
        // Notify of price update
        const prices = kalshiOrderbookManager.getBestPrices(snapshot.market_ticker);
        if (prices) {
          onPriceUpdate(snapshot.market_ticker, prices);
        }
      } else if (msg.type === 'orderbook_delta') {
        const delta: OrderbookDelta = {
          market_ticker: msg.market_ticker as string,
          price: msg.price as number,
          delta: msg.delta as number,
          side: msg.side as 'yes' | 'no',
          seq: msg.seq as number,
        };
        
        kalshiOrderbookManager.applyDelta(delta);
        
        // Notify of price update
        const prices = kalshiOrderbookManager.getBestPrices(delta.market_ticker);
        if (prices) {
          onPriceUpdate(delta.market_ticker, prices);
        }
      }
    }
  }, [onPriceUpdate, subscribeToPendingMarkets]);

  // Connect to WebSocket proxy
  const connect = useCallback(() => {
    if (!enabled || marketTickers.length === 0) {
      return;
    }

    cleanup();
    setStatus('connecting');
    console.log('[Kalshi WS] Connecting to Kalshi WebSocket proxy...');

    try {
      const ws = new WebSocket(WS_PROXY_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Kalshi WS] WebSocket connection opened');
        reconnectAttemptsRef.current = 0;
        
        // Queue markets for subscription after auth
        pendingSubscriptionsRef.current = [...marketTickers];
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          console.error('[Kalshi WS] Failed to parse message:', error, event.data);
        }
      };

      ws.onerror = (error) => {
        console.error('[Kalshi WS] WebSocket error:', error);
        setError('WebSocket connection error');
        setStatus('error');
      };

      ws.onclose = (event) => {
        console.log(`[Kalshi WS] Connection closed: ${event.code} - ${event.reason}`);
        setStatus('disconnected');
        isAuthenticatedRef.current = false;
        subscribedTickersRef.current.clear();
        setSubscriptionCount(0);

        // Auto-reconnect with exponential backoff
        if (enabled && marketTickers.length > 0) {
          const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          console.log(`[Kalshi WS] Reconnecting in ${backoffMs}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, backoffMs);
        }
      };
    } catch (error) {
      console.error('[Kalshi WS] Failed to create WebSocket:', error);
      setError(`Connection failed: ${error}`);
      setStatus('error');
    }
  }, [enabled, marketTickers, cleanup, handleMessage]);

  // Connect when enabled and we have markets
  useEffect(() => {
    if (enabled && marketTickers.length > 0) {
      connect();
    } else {
      cleanup();
    }

    return cleanup;
  }, [enabled, marketTickers.length > 0]);

  // Handle market ticker changes - subscribe to new markets
  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !isAuthenticatedRef.current) {
      // Queue for later when connected
      if (enabled) {
        pendingSubscriptionsRef.current = marketTickers.filter(
          t => !subscribedTickersRef.current.has(t)
        );
      }
      return;
    }

    // Subscribe to new markets
    const newTickers = marketTickers.filter(t => !subscribedTickersRef.current.has(t));
    newTickers.forEach((ticker, index) => {
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          subscribeToMarket(wsRef.current, ticker);
        }
      }, index * 100);
    });

    // Unsubscribe from removed markets
    const removedTickers = Array.from(subscribedTickersRef.current).filter(
      t => !marketTickers.includes(t)
    );
    removedTickers.forEach(ticker => {
      subscribedTickersRef.current.delete(ticker);
      kalshiOrderbookManager.removeMarket(ticker);
    });
    setSubscriptionCount(subscribedTickersRef.current.size);
  }, [marketTickers, enabled, subscribeToMarket]);

  return {
    status,
    subscriptionCount,
    error,
    isConnected: status === 'connected',
    isAuthenticated: isAuthenticatedRef.current,
    reconnect: connect,
    disconnect: cleanup,
    getOrderbookStats: () => kalshiOrderbookManager.getStats(),
  };
}
