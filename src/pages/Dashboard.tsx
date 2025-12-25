import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMarkets } from '@/contexts/MarketsContext';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { MarketFilters } from '@/components/dashboard/MarketFilters';
import { MarketsTable } from '@/components/dashboard/MarketsTable';
import { EventsView } from '@/components/dashboard/EventsView';
import { ArbitrageView } from '@/components/dashboard/ArbitrageView';
import { SettingsPanel } from '@/components/dashboard/SettingsPanel';

export type ViewMode = 'flat' | 'grouped' | 'arbitrage';

export default function DashboardPage() {
  const { isAuthenticated, logout } = useAuth();
  const { summary, syncState } = useMarkets();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  const renderView = () => {
    switch (viewMode) {
      case 'arbitrage':
        return <ArbitrageView />;
      case 'flat':
        return <MarketsTable />;
      case 'grouped':
      default:
        return <EventsView />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onLogout={logout} />
      
      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-8">
        {/* Summary Cards */}
        <SummaryCards summary={summary} syncState={syncState} />
        
        {/* Filters and Settings Row */}
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          <div className="flex-1">
            <MarketFilters viewMode={viewMode} onViewModeChange={setViewMode} />
          </div>
          <SettingsPanel />
        </div>
        
        {/* Markets View - Grouped, Flat, or Arbitrage */}
        {renderView()}
      </main>
    </div>
  );
}