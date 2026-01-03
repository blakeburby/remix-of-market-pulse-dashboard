CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: arbitrage_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arbitrage_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    profit_threshold numeric DEFAULT 1.0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_notified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: watchlist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_id text NOT NULL,
    polymarket_id text NOT NULL,
    kalshi_ticker text NOT NULL,
    match_score numeric DEFAULT 0 NOT NULL,
    display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: arbitrage_notifications arbitrage_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arbitrage_notifications
    ADD CONSTRAINT arbitrage_notifications_pkey PRIMARY KEY (id);


--
-- Name: watchlist_items watchlist_items_device_id_polymarket_id_kalshi_ticker_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist_items
    ADD CONSTRAINT watchlist_items_device_id_polymarket_id_kalshi_ticker_key UNIQUE (device_id, polymarket_id, kalshi_ticker);


--
-- Name: watchlist_items watchlist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist_items
    ADD CONSTRAINT watchlist_items_pkey PRIMARY KEY (id);


--
-- Name: idx_watchlist_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_watchlist_device_id ON public.watchlist_items USING btree (device_id);


--
-- Name: arbitrage_notifications update_arbitrage_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_arbitrage_notifications_updated_at BEFORE UPDATE ON public.arbitrage_notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: arbitrage_notifications Users can delete notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete notifications" ON public.arbitrage_notifications FOR DELETE USING (true);


--
-- Name: watchlist_items Users can delete their own watchlist items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own watchlist items" ON public.watchlist_items FOR DELETE USING (true);


--
-- Name: arbitrage_notifications Users can insert their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own notifications" ON public.arbitrage_notifications FOR INSERT WITH CHECK (((email IS NOT NULL) AND (length(email) > 0) AND (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)));


--
-- Name: watchlist_items Users can insert their own watchlist items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own watchlist items" ON public.watchlist_items FOR INSERT WITH CHECK (((device_id IS NOT NULL) AND (length(device_id) > 0)));


--
-- Name: arbitrage_notifications Users can update notifications by email; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update notifications by email" ON public.arbitrage_notifications FOR UPDATE USING (true) WITH CHECK (((email IS NOT NULL) AND (length(email) > 0) AND (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)));


--
-- Name: arbitrage_notifications Users can view notifications by email lookup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view notifications by email lookup" ON public.arbitrage_notifications FOR SELECT USING (true);


--
-- Name: watchlist_items Users can view their own watchlist items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own watchlist items" ON public.watchlist_items FOR SELECT USING (true);


--
-- Name: arbitrage_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.arbitrage_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: watchlist_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;