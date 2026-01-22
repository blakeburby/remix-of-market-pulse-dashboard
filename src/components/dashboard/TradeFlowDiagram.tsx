import React from 'react';
import { ArbitrageOpportunity } from '@/types/dome';
import { formatCents, formatProfitPercent } from '@/lib/arbitrage-matcher';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';

// Platform icon components
const PolymarketIcon = React.forwardRef<HTMLDivElement, { className?: string }>(
  ({ className = "w-4 h-4" }, ref) => (
    <div 
      ref={ref}
      className={`${className} rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-[8px]`}
    >
      P
    </div>
  )
);
PolymarketIcon.displayName = 'PolymarketIcon';

const KalshiIcon = React.forwardRef<HTMLDivElement, { className?: string }>(
  ({ className = "w-4 h-4" }, ref) => (
    <div 
      ref={ref}
      className={`${className} rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-[8px]`}
    >
      K
    </div>
  )
);
KalshiIcon.displayName = 'KalshiIcon';

interface TradeFlowDiagramProps {
  opportunity: ArbitrageOpportunity;
}

export function TradeFlowDiagram({ opportunity }: TradeFlowDiagramProps) {
  const { 
    match, 
    buyYesOn, 
    buyNoOn, 
    yesPlatformPrice, 
    noPlatformPrice, 
    combinedCost, 
    profitPercent 
  } = opportunity;

  // Get the outcome labels for each side
  const yesMarket = buyYesOn === 'KALSHI' ? match.kalshi : match.polymarket;
  const noMarket = buyNoOn === 'KALSHI' ? match.kalshi : match.polymarket;
  const yesOutcomeLabel = yesMarket.sideA.label || 'Yes';
  const noOutcomeLabel = noMarket.sideB.label || 'No';

  return (
    <div className="relative p-4 rounded-xl bg-gradient-to-br from-muted/60 to-muted/20 border border-border/50 overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-32 h-32 bg-chart-4/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-32 h-32 bg-chart-4/5 rounded-full blur-3xl" />
      </div>

      <div className="relative">
        {/* Title */}
        <div className="text-center mb-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Trade Flow</span>
        </div>

        {/* Flow diagram */}
        <div className="flex items-stretch justify-between gap-2">
          {/* Left Platform Box */}
          <div className="flex-1 p-3 rounded-lg bg-card border border-border/70 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-2">
              {buyYesOn === 'POLYMARKET' ? (
                <PolymarketIcon className="w-5 h-5" />
              ) : (
                <KalshiIcon className="w-5 h-5" />
              )}
              <span className="text-xs font-semibold uppercase">
                {buyYesOn === 'POLYMARKET' ? 'Polymarket' : 'Kalshi'}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground mb-1">Buy</div>
            <div className="text-sm font-medium text-foreground mb-1 line-clamp-1">
              "{yesOutcomeLabel}"
            </div>
            <div className="text-xl font-bold text-foreground">
              {formatCents(yesPlatformPrice)}
            </div>
          </div>

          {/* Center Arrow + Profit */}
          <div className="flex flex-col items-center justify-center px-1 min-w-[60px]">
            <div className="relative">
              {/* Animated dashed line */}
              <div className="absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-chart-4/40" 
                style={{ 
                  backgroundImage: 'linear-gradient(90deg, transparent 50%, hsl(var(--chart-4)) 50%)',
                  backgroundSize: '8px 1px',
                  animation: 'flowRight 1s linear infinite'
                }} 
              />
              <div className="relative z-10 bg-chart-4/10 border border-chart-4/30 rounded-full p-2">
                <Sparkles className="w-4 h-4 text-chart-4" />
              </div>
            </div>
            <div className="mt-1 text-center">
              <div className="text-lg font-bold text-chart-4">$1.00</div>
              <div className="text-[10px] text-chart-4/80">Payout</div>
            </div>
          </div>

          {/* Right Platform Box */}
          <div className="flex-1 p-3 rounded-lg bg-card border border-border/70 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-2">
              {buyNoOn === 'POLYMARKET' ? (
                <PolymarketIcon className="w-5 h-5" />
              ) : (
                <KalshiIcon className="w-5 h-5" />
              )}
              <span className="text-xs font-semibold uppercase">
                {buyNoOn === 'POLYMARKET' ? 'Polymarket' : 'Kalshi'}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground mb-1">Buy</div>
            <div className="text-sm font-medium text-foreground mb-1 line-clamp-1">
              "{noOutcomeLabel}"
            </div>
            <div className="text-xl font-bold text-foreground">
              {formatCents(noPlatformPrice)}
            </div>
          </div>
        </div>

        {/* Bottom Summary */}
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Cost:</span>
            <span className="font-semibold">{formatCents(combinedCost)}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-chart-4" />
            <span className="font-bold text-chart-4">+{formatProfitPercent(profitPercent)}</span>
          </div>
        </div>
      </div>

      {/* CSS for animation */}
      <style>{`
        @keyframes flowRight {
          from { background-position: 0 0; }
          to { background-position: 16px 0; }
        }
      `}</style>
    </div>
  );
}
