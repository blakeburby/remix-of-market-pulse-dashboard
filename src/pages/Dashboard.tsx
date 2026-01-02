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
  const { isAuthenticated, logout } = useAuth();
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
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

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
      
      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-8">
        {/* Controls */}
        <div className="flex items-center justify-end gap-2">
          <ArbitrageSettingsPanel
            settings={settings}
            updateSettings={updateSettings}
            resetSettings={resetSettings}
            defaults={defaults}
          />
          <Button
            variant={isRunning ? "destructive" : "default"}
            size="sm"
            onClick={isRunning ? handleStopAll : handleStartAll}
          >
            {isRunning ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Stop Fetching
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Start Fetching
              </>
            )}
          </Button>
        </div>

        {/* Summary Cards - shows sync progress */}
        <SummaryCards summary={summary} syncState={syncState} />
        
        {/* Arbitrage View Only */}
        <ArbitrageView />
      </main>
    </div>
  );
}