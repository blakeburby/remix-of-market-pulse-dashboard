import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deno edge runtime global
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Timeout buffer - exit gracefully before edge function limit (150s)
const TIMEOUT_MS = 140000;
const START_TIME = Date.now();

// Only fetch markets ending within the next 30 days
const END_TIME_WINDOW_DAYS = 30;

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
const polyRateLimiter = new CloudRateLimiter(640);
const kalshiRateLimiter = new CloudRateLimiter(640);

function isTimedOut(): boolean {
  return Date.now() - START_TIME > TIMEOUT_MS;
}

async function fetchWithRetry(
  url: string,
  apiKey: string,
  rateLimiter: CloudRateLimiter,
  retries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (isTimedOut()) {
      throw new Error("TIMEOUT");
    }
    
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
      if (error instanceof Error && error.message === "TIMEOUT") throw error;
      if (attempt === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt + 1) * 1000));
    }
  }
  throw new Error("Max retries exceeded");
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

// Delete all existing markets for a platform before inserting fresh data
async function clearPlatformMarkets(
  platform: "POLYMARKET" | "KALSHI",
  supabase: any
): Promise<void> {
  console.log(`[${platform}] Clearing existing markets...`);
  const { error } = await supabase
    .from("markets")
    .delete()
    .eq("platform", platform);
  
  if (error) {
    console.error(`[${platform}] Delete error:`, error);
    throw error;
  }
  console.log(`[${platform}] Cleared existing markets`);
}

async function fetchAndInsertPlatformMarkets(
  platform: "POLYMARKET" | "KALSHI",
  apiKey: string,
  supabase: any,
  jobId: string,
  updateField: "polymarket_found" | "kalshi_found"
): Promise<{ found: number; timedOut: boolean }> {
  const limit = 100;
  const rateLimiter = platform === "POLYMARKET" ? polyRateLimiter : kalshiRateLimiter;
  const baseUrl = platform === "POLYMARKET"
    ? "https://api.domeapi.io/v1/polymarket/markets"
    : "https://api.domeapi.io/v1/kalshi/markets";
  
  // Calculate end time filter (markets ending within 30 days)
  const endTimeFilter = Math.floor((Date.now() + END_TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000);
  
  try {
    // Delete all existing markets for this platform FIRST
    await clearPlatformMarkets(platform, supabase);
    
    // Probe for total with end_time filter
    const probeUrl = `${baseUrl}?status=open&end_time_lte=${endTimeFilter}&limit=1`;
    console.log(`[${platform}] Probing: ${probeUrl}`);
    
    const probeResp = await fetchWithRetry(probeUrl, apiKey, rateLimiter);
    const probeData = await probeResp.json();
    const total = probeData.pagination?.total || 0;
    const totalPages = Math.ceil(total / limit);
    
    console.log(`[${platform}] Filtered total: ${total} markets (ending within ${END_TIME_WINDOW_DAYS} days), ${totalPages} pages`);
    
    if (total === 0) {
      return { found: 0, timedOut: false };
    }
    
    let totalInserted = 0;
    const offsets = Array.from({ length: totalPages }, (_, i) => i * limit);
    
    // Fetch and insert in batches of 5 concurrent requests (reduced for stability)
    const FETCH_BATCH_SIZE = 5;
    
    for (let i = 0; i < offsets.length; i += FETCH_BATCH_SIZE) {
      // Check timeout before each batch
      if (isTimedOut()) {
        console.log(`[${platform}] Timeout reached at batch ${i / FETCH_BATCH_SIZE}, inserted ${totalInserted} so far`);
        return { found: totalInserted, timedOut: true };
      }
      
      const batch = offsets.slice(i, i + FETCH_BATCH_SIZE);
      
      const promises = batch.map(async (offset) => {
        try {
          const url = `${baseUrl}?status=open&end_time_lte=${endTimeFilter}&limit=${limit}&offset=${offset}`;
          const response = await fetchWithRetry(url, apiKey, rateLimiter);
          const data = await response.json();
          return data.markets || [];
        } catch (error) {
          if (error instanceof Error && error.message === "TIMEOUT") throw error;
          console.error(`[${platform}] Page ${offset / limit} error:`, error);
          return [];
        }
      });
      
      const results = await Promise.all(promises);
      const markets = results.flat();
      
      if (markets.length === 0) continue;
      
      // Convert and insert immediately (using insert instead of upsert since we deleted first)
      const records = platform === "POLYMARKET"
        ? markets.map(convertPolymarketMarket)
        : markets.map(convertKalshiMarket);
      
      // Insert this batch (no conflict handling needed since we deleted first)
      const { error } = await supabase.from("markets").insert(records);
      
      if (error) {
        console.error(`[${platform}] Insert error:`, error);
      } else {
        totalInserted += records.length;
      }
      
      // Update progress in scan_jobs for real-time feedback
      await supabase.from("scan_jobs").update({
        [updateField]: totalInserted,
      }).eq("id", jobId);
      
      console.log(`[${platform}] Batch ${Math.floor(i / FETCH_BATCH_SIZE) + 1}/${Math.ceil(offsets.length / FETCH_BATCH_SIZE)}: inserted ${records.length}, total ${totalInserted}/${total}`);
    }
    
    return { found: totalInserted, timedOut: false };
  } catch (error) {
    if (error instanceof Error && error.message === "TIMEOUT") {
      return { found: 0, timedOut: true };
    }
    throw error;
  }
}

async function runDiscovery(supabase: any, jobId: string, domeApiKey: string) {
  console.log(`[Discovery] Starting job ${jobId}`);
  
  try {
    // Update job to running
    await supabase.from("scan_jobs").update({
      status: "running",
      started_at: new Date().toISOString(),
    }).eq("id", jobId);
    
    // Fetch and insert both platforms (sequentially to avoid overwhelming the DB)
    console.log(`[Discovery] Fetching Polymarket markets...`);
    const polyResult = await fetchAndInsertPlatformMarkets(
      "POLYMARKET",
      domeApiKey,
      supabase,
      jobId,
      "polymarket_found"
    );
    
    console.log(`[Discovery] Fetching Kalshi markets...`);
    const kalshiResult = await fetchAndInsertPlatformMarkets(
      "KALSHI",
      domeApiKey,
      supabase,
      jobId,
      "kalshi_found"
    );
    
    const timedOut = polyResult.timedOut || kalshiResult.timedOut;
    
    // Mark job as completed (or partial if timed out)
    await supabase.from("scan_jobs").update({
      status: timedOut ? "partial" : "completed",
      polymarket_found: polyResult.found,
      kalshi_found: kalshiResult.found,
      completed_at: new Date().toISOString(),
      error_message: timedOut ? "Scan timed out, partial results saved" : null,
    }).eq("id", jobId);
    
    console.log(`[Discovery] ${timedOut ? "Partial" : "Completed"} job ${jobId}: ${polyResult.found} Polymarket, ${kalshiResult.found} Kalshi`);
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
    // Get Dome API key from request body OR environment variable (for cron jobs)
    const body = await req.json().catch(() => ({}));
    const domeApiKey = body.dome_api_key || Deno.env.get("DOME_API_KEY");
    
    if (!domeApiKey) {
      return new Response(
        JSON.stringify({ error: "dome_api_key is required (body or DOME_API_KEY env)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[scan-markets] API key source: ${body.dome_api_key ? "request body" : "environment variable"}`);
    
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check for running scans (started within last 5 minutes) - overlap prevention
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: runningJobs } = await supabase
      .from("scan_jobs")
      .select("id, started_at")
      .eq("status", "running")
      .gte("started_at", fiveMinutesAgo);

    if (runningJobs && runningJobs.length > 0) {
      console.log(`[scan-markets] Skipping - scan already running: ${runningJobs[0].id}`);
      return new Response(
        JSON.stringify({ status: "skipped", reason: "Scan already in progress", runningJobId: runningJobs[0].id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Clean up stale running jobs (running for more than 5 minutes)
    const { data: staleJobs } = await supabase
      .from("scan_jobs")
      .select("id")
      .eq("status", "running")
      .lt("started_at", fiveMinutesAgo);
    
    if (staleJobs && staleJobs.length > 0) {
      console.log(`[scan-markets] Cleaning up ${staleJobs.length} stale running jobs`);
      await supabase
        .from("scan_jobs")
        .update({ 
          status: "failed", 
          error_message: "Marked stale - exceeded timeout",
          completed_at: new Date().toISOString()
        })
        .eq("status", "running")
        .lt("started_at", fiveMinutesAgo);
    }
    
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
