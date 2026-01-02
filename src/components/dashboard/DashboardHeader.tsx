import { Link, useLocation } from 'react-router-dom';
import { Building2, LogOut, BarChart3, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DashboardHeaderProps {
  onLogout: () => void;
}

export function DashboardHeader({ onLogout }: DashboardHeaderProps) {
  const location = useLocation();
  
  const navItems = [
    { path: '/dashboard', label: 'Markets', icon: BarChart3 },
    { path: '/sports', label: 'Sports', icon: Trophy },
  ];

  return (
    <header className="border-b border-border bg-card shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary flex items-center justify-center shadow-md">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-semibold tracking-tight text-foreground">Burby Capital</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">Prediction Markets Intelligence</p>
            </div>
          </div>
          
          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'h-8 px-3',
                      isActive && 'bg-secondary text-secondary-foreground'
                    )}
                  >
                    <item.icon className="w-4 h-4 mr-1.5" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </nav>
        </div>

        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onLogout}
          className="text-muted-foreground hover:text-foreground h-8 px-2 sm:px-3"
        >
          <LogOut className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}