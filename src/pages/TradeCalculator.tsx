import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ArrowRight, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';

export default function TradeCalculator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [kalshiPrice, setKalshiPrice] = useState<string>('45');
  const [kalshiSide, setKalshiSide] = useState<'YES' | 'NO'>('YES');
  const [polyPrice, setPolyPrice] = useState<string>('58');
  const [polySide, setPolySide] = useState<'YES' | 'NO'>('YES');
  const [portfolio, setPortfolio] = useState<string>('100');

  // Initialize from URL params if present
  useEffect(() => {
    const kalshiParam = searchParams.get('kalshi');
    const polyParam = searchParams.get('poly');
    if (kalshiParam) setKalshiPrice(kalshiParam);
    if (polyParam) setPolyPrice(polyParam);
  }, [searchParams]);

  const handleLogout = () => {
    navigate('/');
  };

  const calculation = useMemo(() => {
    const inputKalshi = parseFloat(kalshiPrice) / 100;
    const inputPoly = parseFloat(polyPrice) / 100;
    const portfolioAmount = parseFloat(portfolio);

    if (isNaN(inputKalshi) || isNaN(inputPoly) || isNaN(portfolioAmount)) {
      return null;
    }

    if (inputKalshi <= 0 || inputKalshi >= 1 || inputPoly <= 0 || inputPoly >= 1) {
      return null;
    }

    // Convert inputs to YES prices based on selected side
    const kalshiYesPrice = kalshiSide === 'YES' ? inputKalshi : 1 - inputKalshi;
    const polyYesPrice = polySide === 'YES' ? inputPoly : 1 - inputPoly;
    const kalshiNoPrice = 1 - kalshiYesPrice;
    const polyNoPrice = 1 - polyYesPrice;

    // Strategy 1: Buy YES on Kalshi + NO on Polymarket
    const cost1 = kalshiYesPrice + polyNoPrice;
    // Strategy 2: Buy YES on Polymarket + NO on Kalshi
    const cost2 = polyYesPrice + kalshiNoPrice;

    const bestStrategy = cost1 < cost2 ? 1 : 2;
    const bestCost = Math.min(cost1, cost2);
    const profitPercent = ((1 - bestCost) / bestCost) * 100;
    const hasArbitrage = bestCost < 1;

    // Calculate allocations
    // For guaranteed profit, we buy equal amounts of contracts on both sides
    // Total contracts = portfolio / bestCost (since each "unit" costs bestCost)
    const totalContracts = portfolioAmount / bestCost;
    
    let kalshiStake: number, polyStake: number;
    let recKalshiSide: 'YES' | 'NO', recPolySide: 'YES' | 'NO';
    let recKalshiPrice: number, recPolyPrice: number;

    if (bestStrategy === 1) {
      // Buy YES on Kalshi, NO on Polymarket
      recKalshiSide = 'YES';
      recPolySide = 'NO';
      recKalshiPrice = kalshiYesPrice;
      recPolyPrice = polyNoPrice;
    } else {
      // Buy YES on Polymarket, NO on Kalshi
      recKalshiSide = 'NO';
      recPolySide = 'YES';
      recKalshiPrice = kalshiNoPrice;
      recPolyPrice = polyYesPrice;
    }

    kalshiStake = totalContracts * recKalshiPrice;
    polyStake = totalContracts * recPolyPrice;
    const guaranteedProfit = totalContracts - portfolioAmount;

    return {
      hasArbitrage,
      bestStrategy,
      bestCost,
      profitPercent,
      totalContracts,
      kalshiStake,
      polyStake,
      recKalshiSide,
      recPolySide,
      recKalshiPrice,
      recPolyPrice,
      guaranteedProfit,
      portfolioAmount,
    };
  }, [kalshiPrice, kalshiSide, polyPrice, polySide, portfolio]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onLogout={handleLogout} />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Trade Calculator</h1>
          <p className="text-muted-foreground mt-2">
            Calculate optimal contract allocations for arbitrage opportunities
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Input Card */}
          <Card>
            <CardHeader>
              <CardTitle>Price Inputs</CardTitle>
              <CardDescription>Enter YES prices from each platform (in cents)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Kalshi Price (¢)</Label>
                <div className="flex gap-2">
                  <Input
                    id="kalshi"
                    type="number"
                    min="1"
                    max="99"
                    value={kalshiPrice}
                    onChange={(e) => setKalshiPrice(e.target.value)}
                    placeholder="e.g., 45"
                    className="flex-1"
                  />
                  <ToggleGroup
                    type="single"
                    value={kalshiSide}
                    onValueChange={(v) => v && setKalshiSide(v as 'YES' | 'NO')}
                    className="border rounded-md"
                  >
                    <ToggleGroupItem value="YES" className="px-3 text-xs">YES</ToggleGroupItem>
                    <ToggleGroupItem value="NO" className="px-3 text-xs">NO</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <p className="text-xs text-muted-foreground">
                  {kalshiSide === 'YES' ? 'NO' : 'YES'} price: {(100 - parseFloat(kalshiPrice || '0')).toFixed(0)}¢
                </p>
              </div>

              <div className="space-y-2">
                <Label>Polymarket Price (¢)</Label>
                <div className="flex gap-2">
                  <Input
                    id="poly"
                    type="number"
                    min="1"
                    max="99"
                    value={polyPrice}
                    onChange={(e) => setPolyPrice(e.target.value)}
                    placeholder="e.g., 58"
                    className="flex-1"
                  />
                  <ToggleGroup
                    type="single"
                    value={polySide}
                    onValueChange={(v) => v && setPolySide(v as 'YES' | 'NO')}
                    className="border rounded-md"
                  >
                    <ToggleGroupItem value="YES" className="px-3 text-xs">YES</ToggleGroupItem>
                    <ToggleGroupItem value="NO" className="px-3 text-xs">NO</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <p className="text-xs text-muted-foreground">
                  {polySide === 'YES' ? 'NO' : 'YES'} price: {(100 - parseFloat(polyPrice || '0')).toFixed(0)}¢
                </p>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="portfolio">Portfolio Balance ($)</Label>
                <Input
                  id="portfolio"
                  type="number"
                  min="1"
                  value={portfolio}
                  onChange={(e) => setPortfolio(e.target.value)}
                  placeholder="100"
                />
              </div>
            </CardContent>
          </Card>

          {/* Results Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Analysis
                {calculation && (
                  <Badge variant={calculation.hasArbitrage ? 'default' : 'secondary'}>
                    {calculation.hasArbitrage ? 'Arbitrage Found!' : 'No Arbitrage'}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>Optimal trade allocation</CardDescription>
            </CardHeader>
            <CardContent>
              {calculation ? (
                <div className="space-y-4">
                  {/* Profit Summary */}
                  <div className={`p-4 rounded-lg ${calculation.hasArbitrage ? 'bg-green-500/10 border border-green-500/20' : 'bg-destructive/10 border border-destructive/20'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {calculation.hasArbitrage ? (
                        <TrendingUp className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                      )}
                      <span className="font-semibold">
                        {calculation.hasArbitrage ? 'Profit' : 'Loss'}: {calculation.profitPercent.toFixed(2)}%
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Combined cost: {(calculation.bestCost * 100).toFixed(1)}¢ per contract pair
                    </p>
                  </div>

                  {/* Trade Details */}
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground">Recommended Trades:</h4>
                    
                    {/* Kalshi */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">Kalshi</p>
                        <p className="text-sm text-muted-foreground">
                          Buy <Badge variant="outline">{calculation.recKalshiSide}</Badge> @ {(calculation.recKalshiPrice * 100).toFixed(0)}¢
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">${calculation.kalshiStake.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">
                          {calculation.totalContracts.toFixed(1)} contracts
                        </p>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center">
                      <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
                    </div>

                    {/* Polymarket */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">Polymarket</p>
                        <p className="text-sm text-muted-foreground">
                          Buy <Badge variant="outline">{calculation.recPolySide}</Badge> @ {(calculation.recPolyPrice * 100).toFixed(0)}¢
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">${calculation.polyStake.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">
                          {calculation.totalContracts.toFixed(1)} contracts
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="pt-4 border-t space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Investment:</span>
                      <span className="font-medium">${calculation.portfolioAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Guaranteed Payout:</span>
                      <span className="font-medium">${calculation.totalContracts.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold">
                      <span className={calculation.hasArbitrage ? 'text-green-600' : 'text-destructive'}>
                        {calculation.hasArbitrage ? 'Guaranteed Profit:' : 'Expected Loss:'}
                      </span>
                      <span className={calculation.hasArbitrage ? 'text-green-600' : 'text-destructive'}>
                        <DollarSign className="w-4 h-4 inline" />
                        {Math.abs(calculation.guaranteedProfit).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Enter valid prices to see calculations</p>
                  <p className="text-xs mt-2">Prices must be between 1-99¢</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info Box */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <h4 className="font-medium mb-2">How it works</h4>
            <p className="text-sm text-muted-foreground">
              Arbitrage exists when the combined cost of buying YES on one platform and NO on another is less than $1.00.
              Since one side must win, you're guaranteed to receive $1.00 per contract pair, locking in risk-free profit.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
