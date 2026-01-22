import { useState } from 'react';
import { ArbitrageOpportunity } from '@/types/dome';
import { formatCents } from '@/lib/arbitrage-matcher';
import { ChevronDown, ChevronUp, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface OutcomeScenariosProps {
  opportunity: ArbitrageOpportunity;
}

export function OutcomeScenarios({ opportunity }: OutcomeScenariosProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { 
    match, 
    buyYesOn, 
    buyNoOn, 
    yesPlatformPrice, 
    noPlatformPrice, 
    combinedCost,
    profitPerDollar
  } = opportunity;

  // Get the outcome labels for each side
  const yesMarket = buyYesOn === 'KALSHI' ? match.kalshi : match.polymarket;
  const noMarket = buyNoOn === 'KALSHI' ? match.kalshi : match.polymarket;
  const yesOutcomeLabel = yesMarket.sideA.label || 'Yes';
  const noOutcomeLabel = noMarket.sideB.label || 'No';

  // Scenario 1: "Yes" outcome wins (sideA wins)
  const scenario1Net = 1.00 - combinedCost; // Payout $1 minus what you paid

  // Scenario 2: "No" outcome wins (sideB wins)
  const scenario2Net = 1.00 - combinedCost; // Payout $1 minus what you paid

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-chart-4" />
            <span className="text-sm font-medium">What Happens? (Both Outcomes)</span>
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="mt-3 space-y-3">
          {/* Scenario 1: Yes Wins */}
          <div className="p-3 rounded-lg bg-card border border-border/70">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-chart-4/20 flex items-center justify-center">
                <span className="text-xs font-bold text-chart-4">1</span>
              </div>
              <span className="text-sm font-semibold">If "{yesOutcomeLabel}" wins</span>
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground">Your {yesOutcomeLabel} position pays</span>
                <span className="font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-chart-4" />
                  +$1.00
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground">Your {noOutcomeLabel} position expires</span>
                <span className="font-medium flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-destructive" />
                  −{formatCents(noPlatformPrice)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground">Your total cost was</span>
                <span className="font-medium">−{formatCents(combinedCost)}</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="font-semibold">Net Profit</span>
                <span className="font-bold text-chart-4 text-sm">
                  +${scenario1Net.toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          {/* Scenario 2: No Wins */}
          <div className="p-3 rounded-lg bg-card border border-border/70">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-chart-4/20 flex items-center justify-center">
                <span className="text-xs font-bold text-chart-4">2</span>
              </div>
              <span className="text-sm font-semibold">If "{noOutcomeLabel}" wins</span>
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground">Your {noOutcomeLabel} position pays</span>
                <span className="font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-chart-4" />
                  +$1.00
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground">Your {yesOutcomeLabel} position expires</span>
                <span className="font-medium flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-destructive" />
                  −{formatCents(yesPlatformPrice)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground">Your total cost was</span>
                <span className="font-medium">−{formatCents(combinedCost)}</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="font-semibold">Net Profit</span>
                <span className="font-bold text-chart-4 text-sm">
                  +${scenario2Net.toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          {/* Key Insight Box */}
          <div className="p-3 rounded-lg bg-chart-4/10 border border-chart-4/30">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-chart-4 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-chart-4">Guaranteed Profit</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You make <span className="font-bold text-chart-4">+${profitPerDollar.toFixed(3)}</span> per contract regardless of which outcome wins. 
                  This is the essence of arbitrage — risk-free profit from price discrepancies.
                </p>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
