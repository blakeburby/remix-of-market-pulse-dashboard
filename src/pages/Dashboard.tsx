import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMarkets } from '@/contexts/MarketsContext';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { ArbitrageView } from '@/components/dashboard/ArbitrageView';
import { Button } from '@/components/ui/button';
import { Play, Pause } from 'lucide-react';

export default function DashboardPage() {
  const { isAuthenticated, logout } = useAuth();
  const { summary, syncState, isPriceUpdating, startPriceUpdates, stopPriceUpdates } = useMarkets();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onLogout={logout} />
      
      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-8">
        {/* Controls */}
        <div className="flex items-center justify-end gap-2">
          <Button
            variant={isPriceUpdating ? "destructive" : "default"}
            size="sm"
            onClick={isPriceUpdating ? stopPriceUpdates : startPriceUpdates}
          >
            {isPriceUpdating ? (
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