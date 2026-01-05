import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMarkets } from '@/contexts/MarketsContext';
import { useArbitrageSettings } from '@/hooks/useArbitrageSettings';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { ArbitrageView } from '@/components/dashboard/ArbitrageView';
import { ArbitrageSettingsPanel } from '@/components/dashboard/ArbitrageSettingsPanel';
import { Button } from '@/components/ui/button';
import { Play, Pause, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const { isAuthenticated, isReady, logout } = useAuth();
  const {
    summary, 
    syncState, 
    isDiscovering,
    isPriceUpdating, 
    startDiscovery,
    stopDiscovery,
    startPriceUpdates, 
    stopPriceUpdates 
  } = useMarkets();
  const { settings, updateSettings, resetSettings, defaults } = useArbitrageSettings();
  const navigate = useNavigate();

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      navigate('/');
    }
  }, [isReady, isAuthenticated, navigate]);

  if (!isReady) {
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleStartAll = () => {
    startDiscovery();
    setTimeout(() => startPriceUpdates(), 3000);
  };

  const handleStopAll = () => {
    stopDiscovery();
    stopPriceUpdates();
  };

  const isRunning = isDiscovering || isPriceUpdating;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onLogout={logout} />
      
      <main className="container mx-auto px-3 sm:px-6 py-3 sm:py-6 space-y-3 sm:space-y-5">
        {/* Controls - Mobile Optimized */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-card border shadow-sm">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold">Market Scanner</h2>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {isRunning ? 'Scanning for arbitrage...' : 'Start to find opportunities'}
            </p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <ArbitrageSettingsPanel
              settings={settings}
              updateSettings={updateSettings}
              resetSettings={resetSettings}
              defaults={defaults}
            />
            <Button
              variant={isRunning ? "destructive" : "default"}
              onClick={isRunning ? handleStopAll : handleStartAll}
              size="sm"
              className="h-9 sm:h-10"
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">Stop</span>
                  <span className="sm:hidden">Stop</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">Start Scanning</span>
                  <span className="sm:hidden">Start</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Summary Cards - shows sync progress */}
        <SummaryCards summary={summary} syncState={syncState} />
        
        {/* Arbitrage View */}
        <ArbitrageView />
      </main>
    </div>
  );
}