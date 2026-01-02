import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Timer } from 'lucide-react';

interface AutoRefreshToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  countdown: number;
  isLoading: boolean;
}

export function AutoRefreshToggle({ enabled, onToggle, countdown, isLoading }: AutoRefreshToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        id="auto-refresh"
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={isLoading}
      />
      <Label 
        htmlFor="auto-refresh" 
        className="text-xs flex items-center gap-1.5 cursor-pointer"
      >
        <Timer className="w-3 h-3" />
        Auto-refresh
        {enabled && (
          <span className="text-muted-foreground">
            ({countdown}s)
          </span>
        )}
      </Label>
    </div>
  );
}
