import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMarkets } from '@/contexts/MarketsContext';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { MarketFilters } from '@/components/dashboard/MarketFilters';
import { MarketsTable } from '@/components/dashboard/MarketsTable';
import { SettingsPanel } from '@/components/dashboard/SettingsPanel';

export default function DashboardPage() {
  const { isAuthenticated, logout } = useAuth();
  const { summary, syncState } = useMarkets();
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
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        <SummaryCards summary={summary} syncState={syncState} />
        
        {/* Filters and Settings Row */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <MarketFilters />
          </div>
          <SettingsPanel />
        </div>
        
        {/* Markets Table */}
        <MarketsTable />
      </main>
    </div>
  );
}
