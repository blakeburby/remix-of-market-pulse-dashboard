import { Link, useLocation } from 'react-router-dom';
import { Building2, LogOut, BarChart3, Trophy, Calculator, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DashboardHeaderProps {
  onLogout: () => void;
}

export function DashboardHeader({ onLogout }: DashboardHeaderProps) {
  const location = useLocation();
  
  const navItems = [
    { path: '/dashboard', label: 'Markets', icon: BarChart3 },
    { path: '/sports', label: 'Sports', icon: Trophy },
    { path: '/calculator', label: 'Calculator', icon: Calculator },
  ];

  const activeItem = navItems.find(item => item.path === location.pathname);

  return (
    <header className="border-b border-border bg-card shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-3 sm:px-6 py-2.5 sm:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-6">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary flex items-center justify-center shadow-md">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
            </div>
            <div className="hidden xs:block">
              <h1 className="text-sm sm:text-xl font-semibold tracking-tight text-foreground">Burby Capital</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">Prediction Markets Intelligence</p>
            </div>
          </Link>
          
          {/* Mobile Navigation Dropdown */}
          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-2 gap-1.5">
                  {activeItem && <activeItem.icon className="w-4 h-4" />}
                  <span className="text-xs font-medium">{activeItem?.label || 'Menu'}</span>
                  <Menu className="w-3.5 h-3.5 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <DropdownMenuItem key={item.path} asChild>
                      <Link 
                        to={item.path} 
                        className={cn(
                          'flex items-center gap-2 w-full',
                          isActive && 'bg-secondary'
                        )}
                      >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Desktop Navigation */}
          <nav className="hidden sm:flex items-center gap-1">
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
                    <span>{item.label}</span>
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
          className="text-muted-foreground hover:text-foreground h-8 px-2"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline ml-2">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}