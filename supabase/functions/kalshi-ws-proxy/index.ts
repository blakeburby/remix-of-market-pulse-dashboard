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

// PKCS#1 to PKCS#8 wrapper: wraps an RSA private key in PKCS#8 ASN.1 structure
// This allows crypto.subtle.importKey('pkcs8', ...) to accept PKCS#1 keys
function wrapPkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  // PKCS#8 header for RSA (OID 1.2.840.113549.1.1.1 with NULL params)
  // SEQUENCE { INTEGER(0), SEQUENCE { OID, NULL }, OCTET STRING { pkcs1Key } }
  const oid = new Uint8Array([
    0x30, 0x0d,             // SEQUENCE (13 bytes)
    0x06, 0x09,             // OID (9 bytes)
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // rsaEncryption
    0x05, 0x00              // NULL
  ]);
  
  // Build length bytes for OCTET STRING containing PKCS#1 key
  const octetStringContent = pkcs1Der;
  const octetStringHeader = buildAsn1LengthBytes(0x04, octetStringContent.length);
  
  // Version INTEGER(0)
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  
  // Inner content: version + algorithm OID + octet string with key
  const innerLength = version.length + oid.length + octetStringHeader.length + octetStringContent.length;
  const outerHeader = buildAsn1LengthBytes(0x30, innerLength);
  
  // Assemble final PKCS#8 structure
  const result = new Uint8Array(outerHeader.length + version.length + oid.length + octetStringHeader.length + octetStringContent.length);
  let offset = 0;
  result.set(outerHeader, offset); offset += outerHeader.length;
  result.set(version, offset); offset += version.length;
  result.set(oid, offset); offset += oid.length;
  result.set(octetStringHeader, offset); offset += octetStringHeader.length;
  result.set(octetStringContent, offset);
  
  return result;
}

// Build ASN.1 tag + length prefix
function buildAsn1LengthBytes(tag: number, length: number): Uint8Array {
  if (length < 128) {
    return new Uint8Array([tag, length]);
  } else if (length < 256) {
    return new Uint8Array([tag, 0x81, length]);
  } else if (length < 65536) {
    return new Uint8Array([tag, 0x82, (length >> 8) & 0xff, length & 0xff]);
  } else {
    return new Uint8Array([tag, 0x83, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
  }
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

  // Handle escaped newlines (common when storing PEM in env vars)
  let normalizedKey = privateKeyPem.replace(/\\n/g, '\n');
  
  // Detect key format
  const isPkcs8 = normalizedKey.includes('-----BEGIN PRIVATE KEY-----');
  const isPkcs1 = normalizedKey.includes('-----BEGIN RSA PRIVATE KEY-----');
  
  console.log('[Kalshi WS Proxy] Key format detected:', isPkcs8 ? 'PKCS#8' : isPkcs1 ? 'PKCS#1' : 'Unknown');

  if (!isPkcs8 && !isPkcs1) {
    throw new Error('Private key must be in PEM format (PKCS#8 or PKCS#1). Please check your key starts with -----BEGIN PRIVATE KEY----- or -----BEGIN RSA PRIVATE KEY-----');
  }

  // Parse PEM private key - strip headers and whitespace
  const pemContents = normalizedKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
    .replace(/-----END RSA PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  // Validate base64 content before attempting decode
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(pemContents)) {
    console.error('[Kalshi WS Proxy] Invalid base64 in private key.');
    console.error('[Kalshi WS Proxy] First 50 chars after stripping headers:', pemContents.substring(0, 50));
    throw new Error('Private key contains invalid base64 characters. Please re-enter the key with proper PEM format.');
  }

  console.log('[Kalshi WS Proxy] Private key parsed successfully, base64 length:', pemContents.length);

  let binaryKey: Uint8Array = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  // If PKCS#1, wrap to PKCS#8 for crypto.subtle compatibility
  if (isPkcs1) {
    console.log('[Kalshi WS Proxy] Wrapping PKCS#1 key to PKCS#8 format...');
    const wrapped = wrapPkcs1ToPkcs8(binaryKey);
    binaryKey = new Uint8Array(wrapped);
    console.log('[Kalshi WS Proxy] PKCS#8 wrapped key size:', binaryKey.length);
  }

  // Import the private key (always as PKCS#8 now)
  let cryptoKey: CryptoKey;
  try {
    // Create a fresh ArrayBuffer copy for crypto.subtle compatibility
    const keyBuffer = new ArrayBuffer(binaryKey.length);
    new Uint8Array(keyBuffer).set(binaryKey);
    
    cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      keyBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
    console.log('[Kalshi WS Proxy] Key imported successfully');
  } catch (importError) {
    console.error('[Kalshi WS Proxy] Key import failed:', importError);
    throw new Error(`Failed to import private key: ${importError instanceof Error ? importError.message : String(importError)}. Please verify your KALSHI_PRIVATE_KEY is a valid RSA private key in PEM format.`);
  }

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
    return new Response(JSON.stringify({ 
      type: 'error', 
      message: 'Kalshi credentials not configured. Please add KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY secrets.' 
    }), { 
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
      kalshiSocket = new WebSocket('wss://api.kalshi.com/trade-api/ws/v2');

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
        clientSocket.send(JSON.stringify({ type: 'error', message: errorMessage }));
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
