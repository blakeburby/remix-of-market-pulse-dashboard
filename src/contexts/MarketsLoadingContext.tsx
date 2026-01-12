import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface MarketsLoadingContextType {
  isLoadingMarkets: boolean;
  loadingProgress: { loaded: number; total: number };
  setIsLoadingMarkets: (loading: boolean) => void;
  updateLoadingProgress: (loaded: number, total: number) => void;
}

const MarketsLoadingContext = createContext<MarketsLoadingContextType | null>(null);

export function MarketsLoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0 });
  
  // Throttle progress updates - max once every 250ms to reduce re-renders
  const lastProgressUpdateRef = useRef<number>(0);
  const pendingProgressRef = useRef<{ loaded: number; total: number } | null>(null);
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const updateLoadingProgress = useCallback((loaded: number, total: number) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastProgressUpdateRef.current;
    
    // Store the pending update
    pendingProgressRef.current = { loaded, total };
    
    // If enough time has passed, update immediately
    if (timeSinceLastUpdate >= 250) {
      lastProgressUpdateRef.current = now;
      setLoadingProgress({ loaded, total });
      return;
    }
    
    // Otherwise, schedule an update if not already scheduled
    if (!throttleTimeoutRef.current) {
      throttleTimeoutRef.current = setTimeout(() => {
        if (pendingProgressRef.current) {
          lastProgressUpdateRef.current = Date.now();
          setLoadingProgress(pendingProgressRef.current);
        }
        throttleTimeoutRef.current = null;
      }, 250 - timeSinceLastUpdate);
    }
  }, []);
  
  const handleSetIsLoadingMarkets = useCallback((loading: boolean) => {
    setIsLoadingMarkets(loading);
    // When loading completes, ensure final progress is flushed
    if (!loading && pendingProgressRef.current) {
      setLoadingProgress(pendingProgressRef.current);
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }
    }
  }, []);

  return (
    <MarketsLoadingContext.Provider value={{
      isLoadingMarkets,
      loadingProgress,
      setIsLoadingMarkets: handleSetIsLoadingMarkets,
      updateLoadingProgress,
    }}>
      {children}
    </MarketsLoadingContext.Provider>
  );
}

export function useMarketsLoading(): MarketsLoadingContextType {
  const context = useContext(MarketsLoadingContext);
  if (!context) {
    console.error('useMarketsLoading called outside MarketsLoadingProvider');
    return {
      isLoadingMarkets: false,
      loadingProgress: { loaded: 0, total: 0 },
      setIsLoadingMarkets: () => {},
      updateLoadingProgress: () => {},
    };
  }
  return context;
}
