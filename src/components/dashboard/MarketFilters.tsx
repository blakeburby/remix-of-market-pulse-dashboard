import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMarkets } from '@/contexts/MarketsContext';
import { Search } from 'lucide-react';

export function MarketFilters() {
  const { filters, setFilters } = useMarkets();

  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
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
