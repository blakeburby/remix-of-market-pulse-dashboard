-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table for arbitrage notification preferences
CREATE TABLE public.arbitrage_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    profit_threshold NUMERIC NOT NULL DEFAULT 1.0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_notified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.arbitrage_notifications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to manage notifications (public feature)
CREATE POLICY "Anyone can insert notifications"
ON public.arbitrage_notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view notifications"
ON public.arbitrage_notifications FOR SELECT USING (true);

CREATE POLICY "Anyone can update notifications"
ON public.arbitrage_notifications FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete notifications"
ON public.arbitrage_notifications FOR DELETE USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_arbitrage_notifications_updated_at
BEFORE UPDATE ON public.arbitrage_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();