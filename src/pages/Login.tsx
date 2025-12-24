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
import { Loader2, KeyRound, TrendingUp, Shield, Zap } from 'lucide-react';

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('');
  const [tier, setTier] = useState<DomeTier>('free');
  const { login, isValidating, error, setTier: setAuthTier } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setAuthTier(tier);
    const success = await login(apiKey.trim());
    if (success) {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Dome Markets</h1>
              <p className="text-xs text-muted-foreground">Real-time prediction markets</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Login Card */}
          <Card className="border-border shadow-lg">
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <KeyRound className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold">Connect to Dome</CardTitle>
              <CardDescription>
                Enter your Dome API key to access real-time market data from Polymarket and Kalshi
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="Enter your Dome API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={isValidating}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tier">API Tier</Label>
                  <Select value={tier} onValueChange={(v) => setTier(v as DomeTier)} disabled={isValidating}>
                    <SelectTrigger id="tier">
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

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={isValidating || !apiKey.trim()}>
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
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-card border border-border">
              <TrendingUp className="w-6 h-6 mx-auto mb-2 text-primary" />
              <p className="text-xs font-medium text-foreground">Real-time Data</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-card border border-border">
              <Shield className="w-6 h-6 mx-auto mb-2 text-primary" />
              <p className="text-xs font-medium text-foreground">Secure</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-card border border-border">
              <Zap className="w-6 h-6 mx-auto mb-2 text-primary" />
              <p className="text-xs font-medium text-foreground">Fast Updates</p>
            </div>
          </div>

          {/* Info */}
          <p className="text-center text-xs text-muted-foreground">
            Don't have an API key?{' '}
            <a 
              href="https://domeapi.io" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Sign up at domeapi.io
            </a>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          <p>Dome Markets Dashboard — Polymarket & Kalshi data via Dome API</p>
        </div>
      </footer>
    </div>
  );
}
