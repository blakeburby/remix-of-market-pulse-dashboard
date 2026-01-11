import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RunningJob {
  id: string;
  polymarketFound: number;
  kalshiFound: number;
  startedAt: Date;
}

interface ScanStatus {
  lastScanAt: Date | null;
  nextScanAt: Date | null;
  lastScanStatus: 'completed' | 'partial' | null;
  runningJob: RunningJob | null;
  isLoading: boolean;
}

const CRON_INTERVAL_MINUTES = 5;

export function useScanStatus(): ScanStatus {
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [lastScanStatus, setLastScanStatus] = useState<'completed' | 'partial' | null>(null);
  const [runningJob, setRunningJob] = useState<RunningJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      // Fetch last completed scan
      const { data: lastScan } = await supabase
        .from('scan_jobs')
        .select('completed_at, status')
        .in('status', ['completed', 'partial'])
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastScan?.completed_at) {
        setLastScanAt(new Date(lastScan.completed_at));
        setLastScanStatus(lastScan.status as 'completed' | 'partial');
      }

      // Fetch currently running scan
      const { data: running } = await supabase
        .from('scan_jobs')
        .select('id, polymarket_found, kalshi_found, started_at')
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (running) {
        setRunningJob({
          id: running.id,
          polymarketFound: running.polymarket_found || 0,
          kalshiFound: running.kalshi_found || 0,
          startedAt: new Date(running.started_at),
        });
      }

      setIsLoading(false);
    };

    fetchStatus();

    // Subscribe to real-time updates for scan_jobs
    const channel = supabase
      .channel('scan-status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scan_jobs',
        },
        (payload) => {
          const newData = payload.new as any;
          
          if (payload.eventType === 'INSERT' && newData.status === 'pending') {
            // New scan starting
            return;
          }
          
          if (newData.status === 'running') {
            // Update running job progress
            setRunningJob({
              id: newData.id,
              polymarketFound: newData.polymarket_found || 0,
              kalshiFound: newData.kalshi_found || 0,
              startedAt: new Date(newData.started_at),
            });
          } else if (newData.status === 'completed' || newData.status === 'partial') {
            // Scan finished
            setRunningJob(null);
            if (newData.completed_at) {
              setLastScanAt(new Date(newData.completed_at));
              setLastScanStatus(newData.status);
            }
          } else if (newData.status === 'failed' || newData.status === 'error') {
            // Scan failed
            setRunningJob(null);
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

  return { lastScanAt, nextScanAt, lastScanStatus, runningJob, isLoading };
}
