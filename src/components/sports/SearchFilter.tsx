import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Search, Filter } from 'lucide-react';

interface SearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  hideIlliquid: boolean;
  onHideIlliquidChange: (hide: boolean) => void;
}

export function SearchFilter({ 
  searchQuery, 
  onSearchChange, 
  hideIlliquid, 
  onHideIlliquidChange 
}: SearchFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search teams, markets..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="hide-illiquid"
          checked={hideIlliquid}
          onCheckedChange={onHideIlliquidChange}
        />
        <Label 
          htmlFor="hide-illiquid" 
          className="text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Filter className="w-3 h-3" />
          Hide illiquid
        </Label>
      </div>
    </div>
  );
}
