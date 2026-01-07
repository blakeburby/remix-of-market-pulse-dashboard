import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DomeTier } from '@/types/dome';
import { Loader2, KeyRound, Building2, Shield, Zap, BarChart3 } from 'lucide-react';

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('e48cf9ae71f7b0c891236fd8843e097da5b4089e');
  const [tier, setTier] = useState<DomeTier>('dev');
  const [remember, setRemember] = useState(true);
  const { login, isValidating, error, setTier: setAuthTier } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setAuthTier(tier);
    const success = await login(apiKey.trim(), { remember });
    if (success) {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-md">
              <Building2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Burby Capital</h1>
              <p className="text-xs text-muted-foreground">Prediction Markets Intelligence</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          {/* Login Card */}
          <Card className="border-border shadow-lg">
            <CardHeader className="text-center space-y-4 pb-2">
              <div className="mx-auto w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <KeyRound className="w-7 h-7 text-primary" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">Connect to Dome API</CardTitle>
                <CardDescription className="text-sm">
                  Enter your API key to access real-time market data from Polymarket and Kalshi
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="apiKey" className="text-sm font-medium">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="Enter your Dome API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={isValidating}
                    className="font-mono h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tier" className="text-sm font-medium">API Tier</Label>
                  <Select value={tier} onValueChange={(v) => setTier(v as DomeTier)} disabled={isValidating}>
                    <SelectTrigger id="tier" className="h-11">
                      <SelectValue placeholder="Select your tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">
                        <span className="flex items-center gap-2">
                          Free — 1 QPS, 10 per 10s
                        </span>
                      </SelectItem>
                      <SelectItem value="dev">
                        <span className="flex items-center gap-2">
                          Dev — 100 QPS, 500 per 10s
                        </span>
                      </SelectItem>
                      <SelectItem value="enterprise">
                        <span className="flex items-center gap-2">
                          Enterprise — Custom limits
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Select your Dome API tier to configure rate limiting
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="remember" className="text-sm font-medium">Remember on this device</Label>
                  <input
                    id="remember"
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    disabled={isValidating}
                    className="h-4 w-4 accent-primary"
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full h-11 font-medium" disabled={isValidating || !apiKey.trim()}>
                  {isValidating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    'Connect'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Features */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-4 rounded-xl bg-card border border-border shadow-sm">
              <BarChart3 className="w-5 h-5 mx-auto mb-2 text-primary" />
              <p className="text-xs font-medium text-foreground">Real-time Data</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-card border border-border shadow-sm">
              <Shield className="w-5 h-5 mx-auto mb-2 text-primary" />
              <p className="text-xs font-medium text-foreground">Secure API</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-card border border-border shadow-sm">
              <Zap className="w-5 h-5 mx-auto mb-2 text-primary" />
              <p className="text-xs font-medium text-foreground">Live Updates</p>
            </div>
          </div>

          {/* Info */}
          <p className="text-center text-sm text-muted-foreground">
            Don't have an API key?{' '}
            <a 
              href="https://domeapi.io" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary font-medium hover:underline"
            >
              Sign up at domeapi.io
            </a>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 bg-card">
        <div className="container mx-auto px-6 text-center text-xs text-muted-foreground">
          <p>© 2025 Burby Capital — Prediction Markets Intelligence Platform</p>
        </div>
      </footer>
    </div>
  );
}