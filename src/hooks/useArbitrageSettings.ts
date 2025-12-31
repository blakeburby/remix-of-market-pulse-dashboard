import { useState, useEffect, useCallback } from 'react';

export interface ArbitrageSettings {
  maxAgeSeconds: number;        // Max age for a price to be considered fresh
  maxSkewSeconds: number;       // Max time difference between platforms
  minProfitPercent: number;     // Minimum profit % to show opportunity
  kalshiRefreshIntervalSeconds: number; // How often to refresh Kalshi prices
}

const DEFAULT_SETTINGS: ArbitrageSettings = {
  maxAgeSeconds: 120,           // 2 minutes
  maxSkewSeconds: 60,           // 1 minute
  minProfitPercent: 0.5,        // 0.5% minimum profit
  kalshiRefreshIntervalSeconds: 30, // Refresh Kalshi every 30s
};

const STORAGE_KEY = 'arbitrage-settings';

export function useArbitrageSettings() {
  const [settings, setSettingsState] = useState<ArbitrageSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to load arbitrage settings:', e);
    }
    return DEFAULT_SETTINGS;
  });

  // Persist to localStorage when settings change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save arbitrage settings:', e);
    }
  }, [settings]);

  const updateSettings = useCallback((updates: Partial<ArbitrageSettings>) => {
    setSettingsState(prev => ({ ...prev, ...updates }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettingsState(DEFAULT_SETTINGS);
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
    defaults: DEFAULT_SETTINGS,
  };
}
