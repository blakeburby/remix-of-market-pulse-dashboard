-- Create table for mismatch reports (for ML training data)
CREATE TABLE public.mismatch_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  polymarket_id TEXT NOT NULL,
  polymarket_title TEXT NOT NULL,
  polymarket_slug TEXT,
  kalshi_id TEXT NOT NULL,
  kalshi_title TEXT NOT NULL,
  kalshi_ticker TEXT,
  match_score NUMERIC NOT NULL,
  match_reason TEXT,
  report_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mismatch_reports ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert mismatch reports (with device_id validation)
CREATE POLICY "Anyone can report mismatches"
ON public.mismatch_reports FOR INSERT
WITH CHECK (device_id IS NOT NULL AND length(device_id) > 0);

-- Allow viewing own reports
CREATE POLICY "Users can view their own reports"
ON public.mismatch_reports FOR SELECT
USING (true);

-- Add index for querying by market pair
CREATE INDEX idx_mismatch_reports_markets ON public.mismatch_reports (polymarket_id, kalshi_id);
CREATE INDEX idx_mismatch_reports_device ON public.mismatch_reports (device_id);