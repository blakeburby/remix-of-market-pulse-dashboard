import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Kalshi WebSocket proxy for authenticated orderbook streaming
// This edge function handles RSA key authentication with Kalshi's API

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base64URL encoding (no padding, URL-safe chars)
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Create JWT for Kalshi authentication
async function createKalshiJWT(apiKeyId: string, privateKeyPem: string): Promise<string> {
  // JWT Header
  const header = { alg: 'RS256', typ: 'JWT' };
  
  // JWT Payload - Kalshi requires specific claims
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: apiKeyId,
    iat: now,
    exp: now + 3600, // 1 hour expiry
  };

  // Encode header and payload
  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const message = `${headerB64}.${payloadB64}`;

  // Parse PEM private key
  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
    .replace(/-----END RSA PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  // Import the private key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign the message
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(message)
  );

  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${message}.${signatureB64}`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  // Get Kalshi credentials from environment
  const apiKeyId = Deno.env.get('KALSHI_API_KEY_ID');
  const privateKey = Deno.env.get('KALSHI_PRIVATE_KEY');

  if (!apiKeyId || !privateKey) {
    console.error('[Kalshi WS Proxy] Missing KALSHI_API_KEY_ID or KALSHI_PRIVATE_KEY');
    return new Response(JSON.stringify({ error: 'Kalshi credentials not configured' }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Non-WebSocket request - return status
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response(JSON.stringify({ 
      status: 'ok', 
      message: 'Kalshi WebSocket proxy ready. Connect via WebSocket.' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Upgrade to WebSocket
  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
  
  let kalshiSocket: WebSocket | null = null;
  let isClosing = false;

  // Connect to Kalshi WebSocket
  const connectToKalshi = async () => {
    try {
      // Create JWT for authentication
      const jwt = await createKalshiJWT(apiKeyId, privateKey);
      console.log('[Kalshi WS Proxy] JWT created successfully');

      // Connect to Kalshi's production WebSocket with auth
      // Kalshi uses bearer token in Authorization header for WS
      kalshiSocket = new WebSocket('wss://api.elections.kalshi.com/trade-api/ws/v2');

      kalshiSocket.onopen = () => {
        console.log('[Kalshi WS Proxy] Connected to Kalshi WebSocket');
        
        // Send authentication message
        const authMessage = {
          id: 1,
          cmd: 'login',
          params: {
            token: jwt
          }
        };
        kalshiSocket?.send(JSON.stringify(authMessage));
        
        // Notify client we're connected
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify({ type: 'connected', message: 'Connected to Kalshi' }));
        }
      };

      kalshiSocket.onmessage = (event) => {
        // Forward Kalshi messages to client
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(event.data);
        }
      };

      kalshiSocket.onerror = (error) => {
        console.error('[Kalshi WS Proxy] Kalshi WebSocket error:', error);
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify({ type: 'error', message: 'Kalshi connection error' }));
        }
      };

      kalshiSocket.onclose = (event) => {
        console.log(`[Kalshi WS Proxy] Kalshi connection closed: ${event.code} - ${event.reason}`);
        if (!isClosing && clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify({ type: 'disconnected', code: event.code, reason: event.reason }));
          // Attempt reconnection after a delay
          setTimeout(() => {
            if (!isClosing && clientSocket.readyState === WebSocket.OPEN) {
              console.log('[Kalshi WS Proxy] Attempting reconnection...');
              connectToKalshi();
            }
          }, 5000);
        }
      };

    } catch (error) {
      console.error('[Kalshi WS Proxy] Failed to connect to Kalshi:', error);
      if (clientSocket.readyState === WebSocket.OPEN) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        clientSocket.send(JSON.stringify({ type: 'error', message: `Connection failed: ${errorMessage}` }));
      }
    }
  };

  // Client socket handlers
  clientSocket.onopen = () => {
    console.log('[Kalshi WS Proxy] Client connected');
    connectToKalshi();
  };

  clientSocket.onmessage = (event) => {
    // Forward client commands to Kalshi
    if (kalshiSocket?.readyState === WebSocket.OPEN) {
      console.log('[Kalshi WS Proxy] Forwarding client message to Kalshi:', event.data);
      kalshiSocket.send(event.data);
    } else {
      console.log('[Kalshi WS Proxy] Cannot forward, Kalshi socket not ready');
    }
  };

  clientSocket.onerror = (error) => {
    console.error('[Kalshi WS Proxy] Client socket error:', error);
  };

  clientSocket.onclose = () => {
    console.log('[Kalshi WS Proxy] Client disconnected');
    isClosing = true;
    if (kalshiSocket) {
      kalshiSocket.close();
      kalshiSocket = null;
    }
  };

  return response;
});
