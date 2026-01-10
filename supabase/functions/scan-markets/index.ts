import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deno edge runtime global
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PolymarketMarket {
  market_slug: string;
  condition_id: string;
  title: string;
  start_time: number;
  end_time: number;
  status: string;
  side_a: { id?: string; token_id?: string; label: string };
  side_b: { id?: string; token_id?: string; label: string };
}

interface KalshiMarket {
  event_ticker: string;
  market_ticker: string;
  title: string;
  start_time: number;
  end_time: number;
  close_time: number;
  status: string;
  last_price: number;
  volume: number;
  volume_24h: number;
}

// Rate limiter for cloud-side API calls
class CloudRateLimiter {
  private requestTimestamps: number[] = [];
  private qp10s: number;
  
  constructor(qp10s: number) {
    this.qp10s = qp10s;
  }
  
  private cleanup() {
    const cutoff = Date.now() - 10000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > cutoff);
  }
  
  async waitAndAcquire(): Promise<void> {
    this.cleanup();
    while (this.requestTimestamps.length >= this.qp10s) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = (oldestTimestamp + 10000) - Date.now() + 50;
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      this.cleanup();
    }
    this.requestTimestamps.push(Date.now());
  }
}

// Shared rate limiters - 80% of actual limits for safety
const polyRateLimiter = new CloudRateLimiter(640); // 80 QPS * 10s * 80%
const kalshiRateLimiter = new CloudRateLimiter(640);

async function fetchWithRetry(
  url: string,
  apiKey: string,
  rateLimiter: CloudRateLimiter,
  retries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    await rateLimiter.waitAndAcquire();
    
    try {
      const response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });
      
      if (response.status === 429) {
        const data = await response.json().catch(() => ({}));
        const retryAfter = data.retry_after || (Math.pow(2, attempt + 1) * 2);
        console.log(`Rate limited (429), waiting ${retryAfter}s...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      return response;
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt + 1) * 1000));
    }
  }
  throw new Error("Max retries exceeded");
}

async function fetchPlatformMarkets(
  platform: "POLYMARKET" | "KALSHI",
  apiKey: string,
  onProgress: (found: number) => void
): Promise<any[]> {
  const limit = 100;
  const rateLimiter = platform === "POLYMARKET" ? polyRateLimiter : kalshiRateLimiter;
  const baseUrl = platform === "POLYMARKET"
    ? "https://api.domeapi.io/v1/polymarket/markets"
    : "https://api.domeapi.io/v1/kalshi/markets";
  
  // Probe for total
  const probeResp = await fetchWithRetry(`${baseUrl}?status=open&limit=1`, apiKey, rateLimiter);
  const probeData = await probeResp.json();
  const total = probeData.pagination?.total || (platform === "POLYMARKET" ? 4000 : 14000);
  const totalPages = Math.ceil(total / limit);
  
  console.log(`[${platform}] Total markets: ${total}, pages: ${totalPages}`);
  
  const allMarkets: any[] = [];
  const offsets = Array.from({ length: totalPages }, (_, i) => i * limit);
  
  // Fetch in batches of 10 concurrent requests
  const BATCH_SIZE = 10;
  for (let i = 0; i < offsets.length; i += BATCH_SIZE) {
    const batch = offsets.slice(i, i + BATCH_SIZE);
    
    const promises = batch.map(async (offset) => {
      try {
        const response = await fetchWithRetry(
          `${baseUrl}?status=open&limit=${limit}&offset=${offset}`,
          apiKey,
          rateLimiter
        );
        const data = await response.json();
        return data.markets || [];
      } catch (error) {
        console.error(`[${platform}] Page ${offset / limit} error:`, error);
        return [];
      }
    });
    
    const results = await Promise.all(promises);
    for (const markets of results) {
      allMarkets.push(...markets);
    }
    
    onProgress(allMarkets.length);
    console.log(`[${platform}] Progress: ${allMarkets.length}/${total}`);
  }
  
  return allMarkets;
}

function convertPolymarketMarket(market: PolymarketMarket) {
  const sideATokenId = market.side_a?.token_id ?? market.side_a?.id;
  const sideBTokenId = market.side_b?.token_id ?? market.side_b?.id;
  
  const aLabel = market.side_a.label.toLowerCase();
  const bLabel = market.side_b.label.toLowerCase();
  const aIsYes = aLabel.includes("yes");
  const aIsNo = aLabel.includes("no");
  const bIsYes = bLabel.includes("yes");
  const bIsNo = bLabel.includes("no");
  const isYesNoMarket = (aIsYes && bIsNo) || (aIsNo && bIsYes);
  
  const yesTokenId = isYesNoMarket
    ? (aIsYes ? sideATokenId : sideBTokenId)
    : sideATokenId;
  const noTokenId = isYesNoMarket
    ? (aIsNo ? sideATokenId : sideBTokenId)
    : sideBTokenId;

  return {
    id: `poly_${market.condition_id}`,
    platform: "POLYMARKET",
    title: market.title,
    event_slug: market.market_slug?.split("-").slice(0, 4).join("-"),
    market_slug: market.market_slug,
    condition_id: market.condition_id,
    start_time: new Date(market.start_time * 1000).toISOString(),
    end_time: new Date(market.end_time * 1000).toISOString(),
    status: market.status,
    side_a_token_id: yesTokenId,
    side_a_label: isYesNoMarket ? "Yes" : market.side_a.label,
    side_b_token_id: noTokenId,
    side_b_label: isYesNoMarket ? "No" : market.side_b.label,
    last_updated: new Date().toISOString(),
  };
}

function convertKalshiMarket(market: KalshiMarket) {
  return {
    id: `kalshi_${market.market_ticker}`,
    platform: "KALSHI",
    title: market.title,
    event_slug: market.event_ticker,
    kalshi_ticker: market.market_ticker,
    kalshi_event_ticker: market.event_ticker,
    start_time: new Date(market.start_time * 1000).toISOString(),
    end_time: new Date(market.end_time * 1000).toISOString(),
    close_time: new Date(market.close_time * 1000).toISOString(),
    status: market.status,
    side_a_label: "Yes",
    side_b_label: "No",
    volume: market.volume,
    volume_24h: market.volume_24h,
    last_updated: new Date().toISOString(),
  };
}

async function runDiscovery(supabase: any, jobId: string, domeApiKey: string) {
  console.log(`[Discovery] Starting job ${jobId}`);
  
  try {
    // Update job to running
    await supabase.from("scan_jobs").update({
      status: "running",
      started_at: new Date().toISOString(),
    }).eq("id", jobId);
    
    let polyFound = 0;
    let kalshiFound = 0;
    
    // Fetch both platforms in parallel
    const [polyMarkets, kalshiMarkets] = await Promise.all([
      fetchPlatformMarkets("POLYMARKET", domeApiKey, (found) => {
        polyFound = found;
      }),
      fetchPlatformMarkets("KALSHI", domeApiKey, (found) => {
        kalshiFound = found;
      }),
    ]);
    
    console.log(`[Discovery] Fetched ${polyMarkets.length} Polymarket, ${kalshiMarkets.length} Kalshi`);
    
    // Convert and upsert in batches
    const BATCH_SIZE = 100;
    
    // Polymarket upserts
    const polyRecords = polyMarkets.map(convertPolymarketMarket);
    for (let i = 0; i < polyRecords.length; i += BATCH_SIZE) {
      const batch = polyRecords.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("markets").upsert(batch, {
        onConflict: "id",
        ignoreDuplicates: false,
      });
      if (error) {
        console.error(`[Discovery] Polymarket upsert error:`, error);
      }
    }
    
    // Kalshi upserts
    const kalshiRecords = kalshiMarkets.map(convertKalshiMarket);
    for (let i = 0; i < kalshiRecords.length; i += BATCH_SIZE) {
      const batch = kalshiRecords.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("markets").upsert(batch, {
        onConflict: "id",
        ignoreDuplicates: false,
      });
      if (error) {
        console.error(`[Discovery] Kalshi upsert error:`, error);
      }
    }
    
    // Mark job as completed
    await supabase.from("scan_jobs").update({
      status: "completed",
      polymarket_found: polyRecords.length,
      kalshi_found: kalshiRecords.length,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
    
    console.log(`[Discovery] Completed job ${jobId}`);
  } catch (error) {
    console.error(`[Discovery] Error:`, error);
    await supabase.from("scan_jobs").update({
      status: "error",
      error_message: error instanceof Error ? error.message : "Unknown error",
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Get Dome API key from request body
    const body = await req.json().catch(() => ({}));
    const domeApiKey = body.dome_api_key;
    
    if (!domeApiKey) {
      return new Response(
        JSON.stringify({ error: "dome_api_key is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create scan job
    const { data: job, error: jobError } = await supabase
      .from("scan_jobs")
      .insert({ status: "pending" })
      .select()
      .single();
    
    if (jobError) {
      throw new Error(`Failed to create job: ${jobError.message}`);
    }
    
    console.log(`[Discovery] Created job ${job.id}`);
    
    // Run discovery in background
    EdgeRuntime.waitUntil(runDiscovery(supabase, job.id, domeApiKey));
    
    // Return immediately with job ID
    return new Response(
      JSON.stringify({ jobId: job.id, status: "started" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[scan-markets] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
