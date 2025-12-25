import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { DomeTier } from '@/types/dome';
import { globalRateLimiter } from '@/lib/rate-limiter';

interface AuthState {
  isAuthenticated: boolean;
  isValidating: boolean;
  error: string | null;
  tier: DomeTier;
}

interface AuthContextType extends AuthState {
  login: (apiKey: string) => Promise<boolean>;
  logout: () => void;
  setTier: (tier: DomeTier) => void;
  getApiKey: () => string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Session storage key (not localStorage for better security)
const SESSION_KEY = 'dome_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isValidating: false,
    error: null,
    tier: 'free',
  });

  // Check for existing session on mount
  useEffect(() => {
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session) {
      try {
        const parsed = JSON.parse(session);
        if (parsed.apiKey && parsed.tier) {
          setState(prev => ({
            ...prev,
            isAuthenticated: true,
            tier: parsed.tier,
          }));
          globalRateLimiter.setTier(parsed.tier);
        }
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  const validateApiKey = async (apiKey: string): Promise<boolean> => {
    try {
      // Test the API key by making a simple request
      const response = await fetch(
        'https://api.domeapi.io/v1/polymarket/markets?status=open&limit=1',
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 401) {
        throw new Error('Invalid API key');
      }

      if (response.status === 429) {
        throw new Error('Rate limited. Please wait and try again.');
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return true;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to validate API key');
    }
  };

  const login = useCallback(async (apiKey: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isValidating: true, error: null }));

    try {
      await validateApiKey(apiKey);

      // Store in session (not localStorage)
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        apiKey,
        tier: state.tier,
        timestamp: Date.now(),
      }));

      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        isValidating: false,
        error: null,
      }));

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        isValidating: false,
        error: errorMessage,
      }));
      return false;
    }
  }, [state.tier]);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setState({
      isAuthenticated: false,
      isValidating: false,
      error: null,
      tier: 'free',
    });
    globalRateLimiter.setTier('free');
  }, []);

  const setTier = useCallback((tier: DomeTier) => {
    setState(prev => ({ ...prev, tier }));
    globalRateLimiter.setTier(tier);
    
    // Update stored session
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session) {
      try {
        const parsed = JSON.parse(session);
        parsed.tier = tier;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
      } catch {
        // Ignore
      }
    }
  }, []);

  const getApiKey = useCallback((): string | null => {
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session) {
      try {
        const parsed = JSON.parse(session);
        return parsed.apiKey || null;
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, setTier, getApiKey }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
