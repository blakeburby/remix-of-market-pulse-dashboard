import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useMarkets } from '@/contexts/MarketsContext';
import { Search, List, Layers, Target } from 'lucide-react';
import type { ViewMode } from '@/pages/Dashboard';

interface MarketFiltersProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function MarketFilters({ viewMode, onViewModeChange }: MarketFiltersProps) {
  const { filters, setFilters } = useMarkets();

  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
      {/* View Toggle */}
      <ToggleGroup 
        type="single" 
        value={viewMode} 
        onValueChange={(v) => v && onViewModeChange(v as ViewMode)}
        className="h-9 sm:h-10"
      >
        <ToggleGroupItem value="grouped" aria-label="Group by event" className="h-full px-2.5 sm:px-3 text-xs sm:text-sm">
          <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
          <span className="hidden xs:inline">Events</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="flat" aria-label="Flat list" className="h-full px-2.5 sm:px-3 text-xs sm:text-sm">
          <List className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
          <span className="hidden xs:inline">Markets</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="arbitrage" aria-label="Arbitrage scanner" className="h-full px-2.5 sm:px-3 text-xs sm:text-sm">
          <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
          <span className="hidden xs:inline">Arbitrage</span>
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Search */}
      <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search markets..."
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          className="pl-9 h-9 sm:h-10"
        />
      </div>

      <div className="flex gap-2 sm:gap-3">
        {/* Platform Filter */}
        <Select 
          value={filters.platform} 
          onValueChange={(v) => setFilters({ platform: v as typeof filters.platform })}
        >
          <SelectTrigger className="w-[100px] sm:w-[140px] h-9 sm:h-10 text-xs sm:text-sm">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="POLYMARKET">Polymarket</SelectItem>
            <SelectItem value="KALSHI">Kalshi</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort By */}
        <Select 
          value={filters.sortBy} 
          onValueChange={(v) => setFilters({ sortBy: v as typeof filters.sortBy })}
        >
          <SelectTrigger className="w-[100px] sm:w-[140px] h-9 sm:h-10 text-xs sm:text-sm">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expiration">Expiration</SelectItem>
            <SelectItem value="volume">Volume</SelectItem>
            <SelectItem value="probability">Probability</SelectItem>
            <SelectItem value="lastUpdated">Updated</SelectItem>
            <SelectItem value="title">Title</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort Order */}
        <Select 
          value={filters.sortOrder} 
          onValueChange={(v) => setFilters({ sortOrder: v as typeof filters.sortOrder })}
        >
          <SelectTrigger className="w-[70px] sm:w-[100px] h-9 sm:h-10 text-xs sm:text-sm">
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Asc</SelectItem>
            <SelectItem value="desc">Desc</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
