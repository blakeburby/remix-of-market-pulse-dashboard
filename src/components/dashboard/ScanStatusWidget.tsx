import { Card, CardContent } from '@/components/ui/card';
import { Clock, Timer, Loader2 } from 'lucide-react';
import { useScanStatus } from '@/hooks/useScanStatus';
import { useEffect, useState } from 'react';

export function ScanStatusWidget() {
  const { lastScanAt, nextScanAt, isLoading } = useScanStatus();
  const [now, setNow] = useState(new Date());

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatRelativeTime = (date: Date | null, reference: Date) => {
    if (!date) return 'Never';
    const diffMs = date.getTime() - reference.getTime();
    const diffSec = Math.floor(Math.abs(diffMs) / 1000);
    const isPast = diffMs < 0;

    if (diffSec < 60) return isPast ? `${diffSec}s ago` : `in ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return isPast ? `${diffMin}m ago` : `in ${diffMin}m`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatAbsoluteTime = (date: Date | null) => {
    if (!date) return '--:--';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <Card className="border-border shadow-sm">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading scan status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border shadow-sm bg-muted/30">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last auto-scan</p>
              <p className="text-sm font-medium">
                {formatRelativeTime(lastScanAt, now)}
                {lastScanAt && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({formatAbsoluteTime(lastScanAt)})
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-chart-4/10">
              <Timer className="w-4 h-4 text-chart-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Next scan</p>
              <p className="text-sm font-medium text-chart-4">
                {nextScanAt && nextScanAt > now 
                  ? formatRelativeTime(nextScanAt, now)
                  : 'Soon'}
                {nextScanAt && nextScanAt > now && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({formatAbsoluteTime(nextScanAt)})
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
