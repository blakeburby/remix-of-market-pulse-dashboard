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
  login: (apiKey: string, options?: { remember?: boolean }) => Promise<boolean>;
  logout: () => void;
  setTier: (tier: DomeTier) => void;
  getApiKey: () => string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Session storage key (default)
const SESSION_KEY = 'dome_session';
// Optional persistent storage (user opt-in)
const REMEMBER_KEY = 'dome_session_persist';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isValidating: false,
    error: null,
    tier: 'free',
  });

  // Check for existing session on mount
  useEffect(() => {
    const fromSession = sessionStorage.getItem(SESSION_KEY);
    const fromPersist = localStorage.getItem(REMEMBER_KEY);
    const session = fromSession ?? fromPersist;

    if (session) {
      try {
        const parsed = JSON.parse(session);
        if (parsed.apiKey && parsed.tier) {
          // Hydrate sessionStorage so the rest of the app reads consistently.
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed));

          setState(prev => ({
            ...prev,
            isAuthenticated: true,
            tier: parsed.tier,
          }));
          globalRateLimiter.setTier(parsed.tier);
        }
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(REMEMBER_KEY);
      }
    }
  }, []);

  const validateApiKey = async (apiKey: string, retries = 3): Promise<boolean> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Add a small delay between retries
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        // Test the API key by making a simple request
        const response = await fetch(
          'https://api.domeapi.io/v1/polymarket/markets?status=open&limit=1',
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);

        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your key and try again.');
        }

        if (response.status === 429) {
          const data = await response.json().catch(() => ({}));
          const retryAfter = data.retry_after || Math.pow(2, attempt + 1);
          
          if (attempt < retries - 1) {
            console.log(`[Login] Rate limited, waiting ${retryAfter}s before retry ${attempt + 2}/${retries}`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
          throw new Error(`Rate limited. Please wait ${retryAfter} seconds and try again.`);
        }

        if (response.status === 403) {
          throw new Error('Access forbidden. Your API key may not have the required permissions.');
        }

        if (!response.ok) {
          throw new Error(`API error (${response.status}). Please try again.`);
        }

        return true;
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            lastError = new Error('Connection timed out. The Dome API may be slow or unreachable.');
          } else if (error.message === 'Failed to fetch') {
            lastError = new Error('Unable to reach Dome API. This may be a temporary network issue - please try again.');
          } else {
            throw error; // Re-throw known errors (like invalid API key)
          }
        } else {
          lastError = new Error('Failed to validate API key. Please try again.');
        }
        
        // Continue to next retry for network errors
        console.log(`[Login] Attempt ${attempt + 1}/${retries} failed:`, lastError.message);
      }
    }
    
    // All retries exhausted
    throw lastError || new Error('Failed to connect after multiple attempts. Please try again.');
  };

  const login = useCallback(async (apiKey: string, options?: { remember?: boolean }): Promise<boolean> => {
    setState(prev => ({ ...prev, isValidating: true, error: null }));

    try {
      await validateApiKey(apiKey);

      const payload = {
        apiKey,
        tier: state.tier,
        timestamp: Date.now(),
      };

      // Store in session (default)
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));

      // Optional persistent storage (user opt-in)
      if (options?.remember) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify(payload));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

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
    localStorage.removeItem(REMEMBER_KEY);
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

    // Update persistent session if enabled
    const persisted = localStorage.getItem(REMEMBER_KEY);
    if (persisted) {
      try {
        const parsed = JSON.parse(persisted);
        parsed.tier = tier;
        localStorage.setItem(REMEMBER_KEY, JSON.stringify(parsed));
      } catch {
        // Ignore
      }
    }
  }, []);

  const getApiKey = useCallback((): string | null => {
    const fromSession = sessionStorage.getItem(SESSION_KEY);
    const fromPersist = localStorage.getItem(REMEMBER_KEY);
    const session = fromSession ?? fromPersist;

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
    // Defensive fallback: avoid blank screen if provider wiring breaks.
    // The app will behave as logged-out (Dashboard route will redirect).
    console.error('useAuth called outside AuthProvider');
    return {
      isAuthenticated: false,
      isValidating: false,
      error: 'Authentication provider not available',
      tier: 'free',
      login: async () => false,
      logout: () => {},
      setTier: () => {},
      getApiKey: () => null,
    };
  }
  return context;
}
