import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ScanStatus {
  lastScanAt: Date | null;
  nextScanAt: Date | null;
  isLoading: boolean;
}

const CRON_INTERVAL_MINUTES = 5;

export function useScanStatus(): ScanStatus {
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLastScan = async () => {
      const { data, error } = await supabase
        .from('scan_jobs')
        .select('completed_at')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data?.completed_at) {
        setLastScanAt(new Date(data.completed_at));
      }
      setIsLoading(false);
    };

    fetchLastScan();

    // Subscribe to real-time updates for scan_jobs
    const channel = supabase
      .channel('scan-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scan_jobs',
        },
        (payload) => {
          if (payload.new.status === 'completed' && payload.new.completed_at) {
            setLastScanAt(new Date(payload.new.completed_at));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Calculate next scan time
  const nextScanAt = lastScanAt
    ? new Date(lastScanAt.getTime() + CRON_INTERVAL_MINUTES * 60 * 1000)
    : null;

  return { lastScanAt, nextScanAt, isLoading };
}
