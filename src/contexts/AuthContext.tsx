import React, { createContext, useContext } from 'react';
import { DomeTier } from '@/types/dome';
import { setAllTiers } from '@/lib/rate-limiter';

interface AuthState {
  isAuthenticated: boolean;
  isValidating: boolean;
  isReady: boolean;
  error: string | null;
  tier: DomeTier;
}

interface AuthContextType extends AuthState {
  login: (apiKey: string, options?: { remember?: boolean }) => Promise<boolean>;
  logout: () => void;
  setTier: (tier: DomeTier) => void;
  getApiKey: () => string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Hardcoded API key - always authenticated
const API_KEY = 'e48cf9ae71f7b0c891236fd8843e097da5b4089e';
const DEFAULT_TIER: DomeTier = 'dev';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Set the tier on mount
  React.useEffect(() => {
    setAllTiers(DEFAULT_TIER);
  }, []);

  const state: AuthState = {
    isAuthenticated: true,
    isValidating: false,
    isReady: true,
    error: null,
    tier: DEFAULT_TIER,
  };

  const login = async (): Promise<boolean> => true;
  const logout = () => {};
  const setTier = () => {};
  const getApiKey = (): string | null => API_KEY;

  return (
    <AuthContext.Provider value={{ ...state, login, logout, setTier, getApiKey }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === null) {
    console.error('useAuth called outside AuthProvider');
    return {
      isAuthenticated: true,
      isValidating: false,
      isReady: true,
      error: null,
      tier: DEFAULT_TIER,
      login: async () => true,
      logout: () => {},
      setTier: () => {},
      getApiKey: () => API_KEY,
    };
  }
  return context;
}
