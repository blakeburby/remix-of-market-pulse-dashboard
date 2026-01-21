import { useEffect, useRef } from 'react';
import { useMarkets } from '@/contexts/MarketsContext';
import { useArbitrageSettings } from '@/hooks/useArbitrageSettings';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { ArbitrageView } from '@/components/dashboard/ArbitrageView';
import { ArbitrageSettingsPanel } from '@/components/dashboard/ArbitrageSettingsPanel';
import { Radio } from 'lucide-react';

export default function DashboardPage() {
  const {
    summary, 
    syncState, 
    isPriceUpdating,
    isDiscovering,
    startDiscovery,
    startPriceUpdates, 
  } = useMarkets();
  const { settings, updateSettings, resetSettings, defaults } = useArbitrageSettings();
  
  // Track if we've already started
  const hasStartedRef = useRef(false);

  // Auto-start discovery and price updates on mount (Client-Only Mode)
  useEffect(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      // Start discovery immediately - fetches from Dome API
      startDiscovery();
      // Start price updates in parallel
      startPriceUpdates();
    }
  }, [startDiscovery, startPriceUpdates]);

  const isRunning = isPriceUpdating || isDiscovering;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-3 sm:px-6 py-3 sm:py-6 space-y-3 sm:space-y-5">

        {/* Status Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-card border shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-full ${isRunning ? 'bg-green-500/10' : 'bg-muted'}`}>
              <Radio className={`w-4 h-4 ${isRunning ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold">Price Monitor</h2>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {isDiscovering ? 'Discovering markets from API...' : isRunning ? 'Monitoring prices in real-time...' : 'Starting...'}
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
        
        {/* Arbitrage View - Always render, discovery happens in parallel */}
        <ArbitrageView />
      </main>
    </div>
  );
}
