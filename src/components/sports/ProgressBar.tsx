import { Progress } from '@/components/ui/progress';
import { RefreshCw } from 'lucide-react';
import { PriceProgress } from '@/hooks/useSportsArbitrage';

interface ProgressBarProps {
  progress: PriceProgress;
  isFetching: boolean;
}

export function PriceProgressBar({ progress, isFetching }: ProgressBarProps) {
  if (!isFetching || progress.total === 0) return null;
  
  const percentage = Math.round((progress.completed / progress.total) * 100);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Fetching prices...</span>
        </div>
        <span className="text-xs font-medium">
          {progress.completed} / {progress.total}
        </span>
      </div>
      <Progress value={percentage} className="h-2" />
      {progress.current && (
        <p className="text-xs text-muted-foreground truncate">
          Current: {progress.current}
        </p>
      )}
    </div>
  );
}
