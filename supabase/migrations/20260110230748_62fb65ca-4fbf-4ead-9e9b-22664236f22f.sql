-- Create markets table for storing unified market data
CREATE TABLE public.markets (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  event_slug TEXT,
  market_slug TEXT,
  condition_id TEXT,
  kalshi_ticker TEXT,
  kalshi_event_ticker TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  close_time TIMESTAMPTZ,
  status TEXT DEFAULT 'open',
  
  -- Side A (YES)
  side_a_token_id TEXT,
  side_a_label TEXT DEFAULT 'Yes',
  side_a_price NUMERIC,
  side_a_probability NUMERIC,
  
  -- Side B (NO)
  side_b_token_id TEXT,
  side_b_label TEXT DEFAULT 'No',
  side_b_price NUMERIC,
  side_b_probability NUMERIC,
  
  volume NUMERIC,
  volume_24h NUMERIC,
  
  last_updated TIMESTAMPTZ DEFAULT now(),
  last_price_updated_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create scan_jobs table for tracking scan status
CREATE TABLE public.scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'pending',
  polymarket_found INT DEFAULT 0,
  kalshi_found INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;

-- Public read access (markets are public data)
CREATE POLICY "Anyone can read markets" ON public.markets FOR SELECT USING (true);
CREATE POLICY "Anyone can read scan jobs" ON public.scan_jobs FOR SELECT USING (true);

-- Service role can write (edge functions use service role)
CREATE POLICY "Service role can insert markets" ON public.markets FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update markets" ON public.markets FOR UPDATE USING (true);
CREATE POLICY "Service role can delete markets" ON public.markets FOR DELETE USING (true);

CREATE POLICY "Service role can insert scan jobs" ON public.scan_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update scan jobs" ON public.scan_jobs FOR UPDATE USING (true);

-- Indexes for common queries
CREATE INDEX idx_markets_platform ON public.markets(platform);
CREATE INDEX idx_markets_status ON public.markets(status);
CREATE INDEX idx_markets_end_time ON public.markets(end_time);
CREATE INDEX idx_markets_kalshi_ticker ON public.markets(kalshi_ticker);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.markets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_jobs;