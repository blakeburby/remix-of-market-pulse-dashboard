import { Settings, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useArbitrageSettings, ArbitrageSettings } from '@/hooks/useArbitrageSettings';

interface ArbitrageSettingsPanelProps {
  settings: ArbitrageSettings;
  updateSettings: (updates: Partial<ArbitrageSettings>) => void;
  resetSettings: () => void;
  defaults: ArbitrageSettings;
}

export function ArbitrageSettingsPanel({
  settings,
  updateSettings,
  resetSettings,
  defaults,
}: ArbitrageSettingsPanelProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-popover border border-border" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-foreground">Arbitrage Settings</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetSettings}
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset
            </Button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="maxAge" className="text-sm text-foreground">
                Max Price Age (seconds)
              </Label>
              <Input
                id="maxAge"
                type="number"
                min={10}
                max={3600}
                value={settings.maxAgeSeconds}
                onChange={(e) =>
                  updateSettings({ maxAgeSeconds: Math.max(10, parseInt(e.target.value) || defaults.maxAgeSeconds) })
                }
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                Prices older than this are stale (default: {defaults.maxAgeSeconds}s)
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maxDrift" className="text-sm text-foreground">
                Max Price Drift (seconds)
              </Label>
              <Input
                id="maxDrift"
                type="number"
                min={5}
                max={300}
                value={settings.maxDriftSeconds}
                onChange={(e) =>
                  updateSettings({ maxDriftSeconds: Math.max(5, parseInt(e.target.value) || defaults.maxDriftSeconds) })
                }
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                Max time between platform updates (default: {defaults.maxDriftSeconds}s)
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maxSkew" className="text-sm text-foreground">
                Max Time Skew (seconds)
              </Label>
              <Input
                id="maxSkew"
                type="number"
                min={10}
                max={3600}
                value={settings.maxSkewSeconds}
                onChange={(e) =>
                  updateSettings({ maxSkewSeconds: Math.max(10, parseInt(e.target.value) || defaults.maxSkewSeconds) })
                }
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                Legacy skew for UI display (default: {defaults.maxSkewSeconds}s)
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="minProfit" className="text-sm text-foreground">
                Min Profit (%)
              </Label>
              <Input
                id="minProfit"
                type="number"
                min={0}
                max={50}
                step={0.1}
                value={settings.minProfitPercent}
                onChange={(e) =>
                  updateSettings({ minProfitPercent: Math.max(0, parseFloat(e.target.value) || defaults.minProfitPercent) })
                }
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                Minimum profit to show (default: {defaults.minProfitPercent}%)
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="space-y-0.5">
                <Label htmlFor="showStale" className="text-sm text-foreground">
                  Show Stale Opportunities
                </Label>
                <p className="text-xs text-muted-foreground">
                  Display expired with warning badge
                </p>
              </div>
              <Switch
                id="showStale"
                checked={settings.showStaleOpportunities}
                onCheckedChange={(checked) =>
                  updateSettings({ showStaleOpportunities: checked })
                }
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
