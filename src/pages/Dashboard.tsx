import { useEffect, useRef } from 'react';
import { useMarkets } from '@/contexts/MarketsContext';
import { useMarketsLoading } from '@/contexts/MarketsLoadingContext';
import { useArbitrageSettings } from '@/hooks/useArbitrageSettings';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { ArbitrageView } from '@/components/dashboard/ArbitrageView';
import { ArbitrageSettingsPanel } from '@/components/dashboard/ArbitrageSettingsPanel';
import { ScanStatusWidget } from '@/components/dashboard/ScanStatusWidget';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2, Target, Radio } from 'lucide-react';

export default function DashboardPage() {
  const {
    summary, 
    syncState, 
    isPriceUpdating, 
    startPriceUpdates, 
  } = useMarkets();
  const { isLoadingMarkets, loadingProgress } = useMarketsLoading();
  const { settings, updateSettings, resetSettings, defaults } = useArbitrageSettings();
  
  // Track if we've already started price updates
  const hasStartedRef = useRef(false);

  // Auto-start price updates when markets finish loading
  // Note: Market discovery is handled by background cron job every 5 minutes
  useEffect(() => {
    if (!isLoadingMarkets && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startPriceUpdates();
    }
  }, [isLoadingMarkets, startPriceUpdates]);

  const isRunning = isPriceUpdating;
  const loadPercent = loadingProgress.total > 0 
    ? Math.round((loadingProgress.loaded / loadingProgress.total) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-3 sm:px-6 py-3 sm:py-6 space-y-3 sm:space-y-5">
        {/* Loading Markets Indicator */}
        {isLoadingMarkets && (
          <div className="p-4 rounded-xl bg-card border shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Loading markets from database...</p>
                <p className="text-xs text-muted-foreground">
                  {loadingProgress.loaded.toLocaleString()} / {loadingProgress.total.toLocaleString()} markets
                </p>
              </div>
              <span className="text-sm font-medium text-primary">{loadPercent}%</span>
            </div>
            <Progress value={loadPercent} className="h-2" />
          </div>
        )}

        {/* Background Scan Status */}
        <ScanStatusWidget />

        {/* Status Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-card border shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-full ${isRunning ? 'bg-green-500/10' : 'bg-muted'}`}>
              <Radio className={`w-4 h-4 ${isRunning ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold">Price Monitor</h2>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {isLoadingMarkets ? 'Loading markets...' : isRunning ? 'Monitoring prices in real-time...' : 'Starting...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <ArbitrageSettingsPanel
              settings={settings}
              updateSettings={updateSettings}
              resetSettings={resetSettings}
              defaults={defaults}
            />
            {isRunning && (
              <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
                Live
              </span>
            )}
          </div>
        </div>

        {/* Summary Cards - shows sync progress */}
        <SummaryCards summary={summary} syncState={syncState} />
        
        {/* Arbitrage View - Only render when not loading to prevent lag */}
        {isLoadingMarkets ? (
          <div className="space-y-4 sm:space-y-6">
            {/* Skeleton for Scan Coverage Header */}
            <Card className="border-border bg-gradient-to-r from-muted/50 to-muted/20">
              <CardContent className="p-3 sm:py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <Skeleton className="h-9 w-24 rounded-full" />
                    <Skeleton className="h-9 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-9 w-32 rounded-full" />
                </div>
              </CardContent>
            </Card>
            
            {/* Skeleton for Search Bar */}
            <Card className="border-border bg-card">
              <CardContent className="p-3 sm:p-4">
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
            
            {/* Skeleton for Opportunities */}
            <div className="grid gap-3 sm:gap-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-48 w-full rounded-xl" />
              ))}
            </div>
            
            {/* Skeleton for Matched Contracts */}
            <Card className="mt-6">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  <Skeleton className="h-6 w-40" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid gap-2 sm:gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-32 w-full rounded-lg" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <ArbitrageView />
        )}
      </main>
    </div>
  );
}
