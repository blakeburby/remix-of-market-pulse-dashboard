-- Create a table for storing watchlist items
-- Uses a device_id since we don't have user auth
CREATE TABLE public.watchlist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  polymarket_id TEXT NOT NULL,
  kalshi_ticker TEXT NOT NULL,
  match_score NUMERIC NOT NULL DEFAULT 0,
  display_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(device_id, polymarket_id, kalshi_ticker)
);

-- Enable Row Level Security
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since we're using device_id, not user auth)
CREATE POLICY "Anyone can view their watchlist items" 
ON public.watchlist_items 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert watchlist items" 
ON public.watchlist_items 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can delete watchlist items" 
ON public.watchlist_items 
FOR DELETE 
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_watchlist_device_id ON public.watchlist_items(device_id);