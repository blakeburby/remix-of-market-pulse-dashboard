import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, DollarSign, TrendingUp } from 'lucide-react';
import { SportsArbitrageOpportunity } from '@/hooks/useSportsArbitrage';

interface BetCalculatorProps {
  opportunity: SportsArbitrageOpportunity;
}

export function BetCalculator({ opportunity }: BetCalculatorProps) {
  const [bankroll, setBankroll] = useState<string>('1000');
  
  const calculations = useMemo(() => {
    const totalBankroll = parseFloat(bankroll) || 0;
    if (totalBankroll <= 0) return null;
    
    const { combinedCost, profitPercent, buyYesOn, kalshiYesPrice, kalshiNoPrice, polyYesPrice, polyNoPrice } = opportunity;
    
    // Calculate optimal stake split
    const yesPrice = buyYesOn === 'KALSHI' ? kalshiYesPrice : polyYesPrice;
    const noPrice = buyYesOn === 'KALSHI' ? polyNoPrice : kalshiNoPrice;
    
    // Total contracts you can buy
    const contractsPerDollar = 1 / combinedCost;
    const totalContracts = totalBankroll * contractsPerDollar;
    
    // Stake on each side
    const yesStake = totalContracts * yesPrice;
    const noStake = totalContracts * noPrice;
    
    // Profit
    const totalPayout = totalContracts; // Each contract pays $1
    const totalProfit = totalPayout - totalBankroll;
    const profitPercenActual = (totalProfit / totalBankroll) * 100;
    
    return {
      yesStake: yesStake.toFixed(2),
      noStake: noStake.toFixed(2),
      totalContracts: totalContracts.toFixed(2),
      totalPayout: totalPayout.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      profitPercent: profitPercenActual.toFixed(2),
    };
  }, [bankroll, opportunity]);

  return (
    <Card className="bg-muted/30 border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calculator className="w-4 h-4" />
          Bet Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="bankroll" className="text-xs whitespace-nowrap">Bankroll:</Label>
          <div className="relative flex-1">
            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              id="bankroll"
              type="number"
              value={bankroll}
              onChange={(e) => setBankroll(e.target.value)}
              className="pl-6 h-8 text-sm"
              placeholder="1000"
            />
          </div>
        </div>
        
        {calculations && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-background/50">
              <p className="text-muted-foreground">Stake on {opportunity.buyYesOn}</p>
              <p className="font-bold text-primary">${calculations.yesStake}</p>
            </div>
            <div className="p-2 rounded bg-background/50">
              <p className="text-muted-foreground">Stake on {opportunity.buyNoOn}</p>
              <p className="font-bold text-primary">${calculations.noStake}</p>
            </div>
            <div className="p-2 rounded bg-background/50">
              <p className="text-muted-foreground">Contracts</p>
              <p className="font-bold">{calculations.totalContracts}</p>
            </div>
            <div className="p-2 rounded bg-background/50">
              <p className="text-muted-foreground">Payout</p>
              <p className="font-bold">${calculations.totalPayout}</p>
            </div>
            <div className="col-span-2 p-2 rounded bg-green-600/10 border border-green-600/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-green-600" />
                  <span className="text-muted-foreground">Profit</span>
                </div>
                <p className="font-bold text-green-600">${calculations.totalProfit} ({calculations.profitPercent}%)</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
