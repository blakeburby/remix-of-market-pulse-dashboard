import { useState, useEffect, useRef, memo } from 'react';
import { cn } from '@/lib/utils';

interface PriceFlashProps {
  price: number | null;
  format?: (price: number) => string;
  className?: string;
  showDirection?: boolean;
}

// Minimum price change threshold to trigger animation (0.5%)
const PRICE_CHANGE_THRESHOLD = 0.005;

/**
 * A component that displays a price with a flash animation when it changes significantly.
 * - Green flash when price increases by more than 0.5%
 * - Red flash when price decreases by more than 0.5%
 * - Memoized to prevent unnecessary re-renders
 */
export const PriceFlash = memo(function PriceFlash({ 
  price, 
  format = (p) => `$${p.toFixed(2)}`,
  className = '',
  showDirection = false
}: PriceFlashProps) {
  const [flashState, setFlashState] = useState<'none' | 'up' | 'down'>('none');
  const prevPriceRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip initial render and null prices
    if (price === null || prevPriceRef.current === null) {
      prevPriceRef.current = price;
      return;
    }

    const prevPrice = prevPriceRef.current;
    
    // Only animate if price changed significantly (>0.5%)
    if (price !== prevPrice && prevPrice > 0) {
      const percentChange = Math.abs((price - prevPrice) / prevPrice);
      
      if (percentChange >= PRICE_CHANGE_THRESHOLD) {
        const direction = price > prevPrice ? 'up' : 'down';
        setFlashState(direction);

        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Reset flash after animation completes
        timeoutRef.current = setTimeout(() => {
          setFlashState('none');
        }, 600);
      }
    }

    prevPriceRef.current = price;

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [price]);

  if (price === null) {
    return <span className={cn('text-muted-foreground', className)}>--</span>;
  }

  return (
    <span 
      className={cn(
        'relative inline-flex items-center gap-1 transition-colors duration-300',
        flashState === 'up' && 'text-chart-4 animate-price-flash-up',
        flashState === 'down' && 'text-destructive animate-price-flash-down',
        flashState === 'none' && '',
        className
      )}
    >
      {showDirection && flashState !== 'none' && (
        <span className={cn(
          'text-xs animate-fade-in',
          flashState === 'up' ? 'text-chart-4' : 'text-destructive'
        )}>
          {flashState === 'up' ? '↑' : '↓'}
        </span>
      )}
      <span className={cn(
        flashState !== 'none' && 'font-bold'
      )}>
        {format(price)}
      </span>
      {/* Flash overlay */}
      {flashState !== 'none' && (
        <span 
          className={cn(
            'absolute inset-0 rounded-sm pointer-events-none animate-flash-overlay',
            flashState === 'up' ? 'bg-chart-4/30' : 'bg-destructive/30'
          )}
        />
      )}
    </span>
  );
});
