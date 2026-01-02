import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WatchlistItem {
  id: string;
  polymarket_id: string;
  kalshi_ticker: string;
  match_score: number;
  display_name: string;
  created_at: string;
}

// Generate or retrieve a unique device ID
function getDeviceId(): string {
  const storageKey = 'arbitrage_device_id';
  let deviceId = localStorage.getItem(storageKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(storageKey, deviceId);
  }
  return deviceId;
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const deviceId = getDeviceId();

  // Fetch watchlist items
  const fetchWatchlist = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('watchlist_items')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWatchlist(data || []);
    } catch (error) {
      console.error('Failed to fetch watchlist:', error);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  // Check if a pair is in the watchlist
  const isInWatchlist = useCallback(
    (polymarketId: string, kalshiTicker: string): boolean => {
      return watchlist.some(
        (item) =>
          item.polymarket_id === polymarketId &&
          item.kalshi_ticker === kalshiTicker
      );
    },
    [watchlist]
  );

  // Add to watchlist
  const addToWatchlist = useCallback(
    async (
      polymarketId: string,
      kalshiTicker: string,
      matchScore: number,
      displayName: string
    ) => {
      try {
        const { error } = await supabase.from('watchlist_items').insert({
          device_id: deviceId,
          polymarket_id: polymarketId,
          kalshi_ticker: kalshiTicker,
          match_score: matchScore,
          display_name: displayName,
        });

        if (error) throw error;

        toast.success('Added to watchlist');
        await fetchWatchlist();
      } catch (error) {
        console.error('Failed to add to watchlist:', error);
        toast.error('Failed to add to watchlist');
      }
    },
    [deviceId, fetchWatchlist]
  );

  // Remove from watchlist
  const removeFromWatchlist = useCallback(
    async (polymarketId: string, kalshiTicker: string) => {
      try {
        const { error } = await supabase
          .from('watchlist_items')
          .delete()
          .eq('device_id', deviceId)
          .eq('polymarket_id', polymarketId)
          .eq('kalshi_ticker', kalshiTicker);

        if (error) throw error;

        toast.success('Removed from watchlist');
        await fetchWatchlist();
      } catch (error) {
        console.error('Failed to remove from watchlist:', error);
        toast.error('Failed to remove from watchlist');
      }
    },
    [deviceId, fetchWatchlist]
  );

  // Toggle watchlist
  const toggleWatchlist = useCallback(
    async (
      polymarketId: string,
      kalshiTicker: string,
      matchScore: number,
      displayName: string
    ) => {
      if (isInWatchlist(polymarketId, kalshiTicker)) {
        await removeFromWatchlist(polymarketId, kalshiTicker);
      } else {
        await addToWatchlist(polymarketId, kalshiTicker, matchScore, displayName);
      }
    },
    [isInWatchlist, addToWatchlist, removeFromWatchlist]
  );

  return {
    watchlist,
    isLoading,
    isInWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
    refetch: fetchWatchlist,
  };
}
