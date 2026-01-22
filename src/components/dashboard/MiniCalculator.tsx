import React, { useState, useMemo } from 'react';
import { ArbitrageOpportunity } from '@/types/dome';
import { Input } from '@/components/ui/input';
import { DollarSign, Calculator, ArrowRight } from 'lucide-react';

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

interface MiniCalculatorProps {
  opportunity: ArbitrageOpportunity;
}

export function MiniCalculator({ opportunity }: MiniCalculatorProps) {
  const [investment, setInvestment] = useState<string>('100');
  const { 
    buyYesOn, 
    buyNoOn, 
    yesPlatformPrice, 
    noPlatformPrice, 
    combinedCost
  } = opportunity;

  const calculation = useMemo(() => {
    const investmentNum = parseFloat(investment) || 0;
    if (investmentNum <= 0 || combinedCost <= 0) return null;

    // Number of complete arbitrage "pairs" we can buy
    const contractPairs = Math.floor(investmentNum / combinedCost);
    
    // Amount spent on Yes side
    const yesAmount = contractPairs * yesPlatformPrice;
    // Amount spent on No side
    const noAmount = contractPairs * noPlatformPrice;
    
    // Total spent
    const totalSpent = yesAmount + noAmount;
    
    // Guaranteed payout
    const payout = contractPairs * 1.00;
    
    // Guaranteed profit
    const profit = payout - totalSpent;

    return {
      contractPairs,
      yesAmount,
      noAmount,
      totalSpent,
      payout,
      profit
    };
  }, [investment, combinedCost, yesPlatformPrice, noPlatformPrice]);

  return (
    <div className="p-3 rounded-xl bg-gradient-to-br from-muted/60 to-muted/30 border border-border/50">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Calculator</span>
      </div>

      {/* Investment Input */}
      <div className="mb-3">
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="number"
            value={investment}
            onChange={(e) => setInvestment(e.target.value)}
            placeholder="Enter investment"
            className="pl-9 h-10 text-base font-medium"
            min="0"
            step="10"
          />
        </div>
      </div>

      {calculation && calculation.contractPairs > 0 ? (
        <>
          {/* Platform breakdown */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="p-2.5 rounded-lg bg-card border border-border/70">
              <div className="flex items-center gap-1.5 mb-1">
                {buyYesOn === 'POLYMARKET' ? (
                  <PolymarketIcon className="w-3.5 h-3.5" />
                ) : (
                  <KalshiIcon className="w-3.5 h-3.5" />
                )}
                <span className="text-[10px] text-muted-foreground uppercase">
                  {buyYesOn === 'POLYMARKET' ? 'Polymarket' : 'Kalshi'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {calculation.contractPairs} contracts
              </div>
              <div className="text-sm font-bold">
                ${calculation.yesAmount.toFixed(2)}
              </div>
            </div>
            
            <div className="p-2.5 rounded-lg bg-card border border-border/70">
              <div className="flex items-center gap-1.5 mb-1">
                {buyNoOn === 'POLYMARKET' ? (
                  <PolymarketIcon className="w-3.5 h-3.5" />
                ) : (
                  <KalshiIcon className="w-3.5 h-3.5" />
                )}
                <span className="text-[10px] text-muted-foreground uppercase">
                  {buyNoOn === 'POLYMARKET' ? 'Polymarket' : 'Kalshi'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {calculation.contractPairs} contracts
              </div>
              <div className="text-sm font-bold">
                ${calculation.noAmount.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Result summary */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-chart-4/10 border border-chart-4/30">
            <div className="text-xs">
              <span className="text-muted-foreground">Invest</span>
              <span className="font-semibold ml-1">${calculation.totalSpent.toFixed(2)}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-chart-4" />
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Guaranteed profit</div>
              <div className="text-base font-bold text-chart-4">
                +${calculation.profit.toFixed(2)}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground text-center py-3">
          Enter an investment amount to calculate
        </div>
      )}
    </div>
  );
}
