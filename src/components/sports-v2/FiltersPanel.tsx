import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings2 } from 'lucide-react';

interface Settings {
  freshnessWindowSeconds: number;
  minEdgePercent: number;
  minLiquidityDollars: number;
  slippageBuffer: number;
  feesPercent: number;
}

interface FiltersPanelProps {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
}

export function FiltersPanel({ settings, onUpdate }: FiltersPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          Filters & Guardrails
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Min Edge % */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Min Edge %</Label>
            <span className="text-sm font-medium">{settings.minEdgePercent}%</span>
          </div>
          <Slider
            value={[settings.minEdgePercent]}
            onValueChange={([v]) => onUpdate({ minEdgePercent: v })}
            min={0}
            max={10}
            step={0.5}
            className="w-full"
          />
        </div>

        {/* Min Liquidity */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Min Liquidity</Label>
            <span className="text-sm font-medium">${settings.minLiquidityDollars}</span>
          </div>
          <Slider
            value={[settings.minLiquidityDollars]}
            onValueChange={([v]) => onUpdate({ minLiquidityDollars: v })}
            min={50}
            max={1000}
            step={50}
            className="w-full"
          />
        </div>

        {/* Freshness Window */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Freshness Window</Label>
            <span className="text-sm font-medium">{settings.freshnessWindowSeconds}s</span>
          </div>
          <Slider
            value={[settings.freshnessWindowSeconds]}
            onValueChange={([v]) => onUpdate({ freshnessWindowSeconds: v })}
            min={10}
            max={120}
            step={10}
            className="w-full"
          />
        </div>

        {/* Slippage Buffer */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Slippage Buffer</Label>
            <span className="text-sm font-medium">{settings.slippageBuffer}%</span>
          </div>
          <Slider
            value={[settings.slippageBuffer]}
            onValueChange={([v]) => onUpdate({ slippageBuffer: v })}
            min={0}
            max={5}
            step={0.25}
            className="w-full"
          />
        </div>

        {/* Platform Fees */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Est. Platform Fees</Label>
            <span className="text-sm font-medium">{settings.feesPercent}%</span>
          </div>
          <Slider
            value={[settings.feesPercent]}
            onValueChange={([v]) => onUpdate({ feesPercent: v })}
            min={0}
            max={5}
            step={0.5}
            className="w-full"
          />
        </div>
      </CardContent>
    </Card>
  );
}
