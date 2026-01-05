import { TradePlan } from '@/hooks/useSportsArbitrageV2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Check,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  Shield,
  Target,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TradePlanCardProps {
  plan: TradePlan;
  onOpenDrawer: () => void;
}

function formatPrice(price: number): string {
  return `${Math.round(price * 100)}¢`;
}

function formatPercent(percent: number): string {
  return `${percent.toFixed(2)}%`;
}

function impliedProb(price: number): string {
  return `${(price * 100).toFixed(1)}%`;
}

function decimalOdds(price: number): string {
  if (price <= 0) return '—';
  return (1 / price).toFixed(2);
}

function confidenceClasses(confidence: TradePlan['confidence']): string {
  switch (confidence) {
    case 'HIGH':
      return 'border-chart-2/40 text-chart-2 bg-chart-2/10';
    case 'MEDIUM':
      return 'border-chart-4/40 text-chart-4 bg-chart-4/10';
    case 'LOW':
      return 'border-chart-5/40 text-chart-5 bg-chart-5/10';
  }
}

function edgeTextClass(percent: number): string {
  if (percent >= 5) return 'text-chart-2';
  if (percent >= 3) return 'text-chart-3';
  if (percent >= 1) return 'text-chart-4';
  return 'text-chart-5';
}

export function TradePlanCard({ plan }: TradePlanCardProps) {
  const copyTradePlan = async () => {
    const text = `
LOCKED ARBITRAGE OPPORTUNITY
Event: ${plan.event}

Leg 1: ${plan.leg1.action} "${plan.leg1.outcome}"
Platform: ${plan.leg1.platform}
Price: ${formatPrice(plan.leg1.price)} (Implied ${impliedProb(plan.leg1.price)} | Dec ${decimalOdds(plan.leg1.price)})
Order Type: ${plan.leg1.orderType}

Leg 2: ${plan.leg2.action} "${plan.leg2.outcome}"
Platform: ${plan.leg2.platform}
Price: ${formatPrice(plan.leg2.price)} (Implied ${impliedProb(plan.leg2.price)} | Dec ${decimalOdds(plan.leg2.price)})
Order Type: ${plan.leg2.orderType}

Max Size: $${plan.maxSize.toLocaleString()}
Locked Edge: ${formatPercent(plan.lockedEdge.percent)} → $${plan.lockedEdge.dollars.toFixed(2)} profit

Kalshi: ${plan.kalshiUrl}
Polymarket: ${plan.polymarketUrl}
    `.trim();

    await navigator.clipboard.writeText(text);
    toast.success('Trade plan copied');
  };

  const openBoth = () => {
    window.open(plan.kalshiUrl, '_blank');
    setTimeout(() => window.open(plan.polymarketUrl, '_blank'), 100);
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-primary/2 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <Badge variant="default">LOCKED</Badge>
            <Badge variant="outline" className={confidenceClasses(plan.confidence)}>
              {plan.confidence}
            </Badge>
          </div>
          <div className={cn('text-2xl font-bold', edgeTextClass(plan.lockedEdge.percent))}>
            +{formatPercent(plan.lockedEdge.percent)}
          </div>
        </div>
        <CardTitle className="text-lg leading-tight mt-2">{plan.event}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Legs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground font-medium mb-2">LEG 1</p>
            <div className="space-y-1">
              <p className="font-semibold text-primary">{plan.leg1.action}</p>
              <p className="text-sm">"{plan.leg1.outcome}"</p>
              <p className="text-sm text-muted-foreground">
                Platform: <span className="font-medium text-foreground">{plan.leg1.platform}</span>
              </p>
              <p className="text-lg font-bold">{formatPrice(plan.leg1.price)}</p>
              <p className="text-xs text-muted-foreground">Implied {impliedProb(plan.leg1.price)} • Dec {decimalOdds(plan.leg1.price)}</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground font-medium mb-2">LEG 2</p>
            <div className="space-y-1">
              <p className="font-semibold text-primary">{plan.leg2.action}</p>
              <p className="text-sm">"{plan.leg2.outcome}"</p>
              <p className="text-sm text-muted-foreground">
                Platform: <span className="font-medium text-foreground">{plan.leg2.platform}</span>
              </p>
              <p className="text-lg font-bold">{formatPrice(plan.leg2.price)}</p>
              <p className="text-xs text-muted-foreground">Implied {impliedProb(plan.leg2.price)} • Dec {decimalOdds(plan.leg2.price)}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs">Max Size</span>
            </div>
            <p className="font-bold">${plan.maxSize.toLocaleString()}</p>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Shield className="w-4 h-4" />
              <span className="text-xs">Guardrails</span>
            </div>
            <p className="font-bold">{Object.values(plan.guardrails).every(Boolean) ? 'PASS' : 'CHECK'}</p>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs">Profit</span>
            </div>
            <p className="font-bold text-chart-2">${plan.lockedEdge.dollars.toFixed(2)}</p>
          </div>
        </div>

        {/* Guardrails badges */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(plan.guardrails).map(([key, passed]) => (
            <Badge
              key={key}
              variant="outline"
              className={cn(
                'text-xs gap-1',
                passed
                  ? 'border-chart-2/40 text-chart-2'
                  : 'border-destructive/40 text-destructive'
              )}
            >
              {passed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </Badge>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={openBoth} className="gap-1">
              <ExternalLink className="w-3 h-3" />
              Open Both
            </Button>
            <Button variant="outline" size="sm" onClick={copyTradePlan} className="gap-1">
              <Copy className="w-3 h-3" />
              Copy
            </Button>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Updated {new Date(plan.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
