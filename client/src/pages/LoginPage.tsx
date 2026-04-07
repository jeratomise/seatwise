import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TOKEN_KEY } from '@/lib/queryClient';
import { Lock, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Incorrect password');
      } else {
        const { token } = await res.json();
        localStorage.setItem(TOKEN_KEY, token);
        navigate('/');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <svg viewBox="0 0 32 32" width="48" height="48" fill="none" className="mb-3">
            <rect x="2" y="2" width="28" height="28" rx="6" fill="hsl(215,80%,42%)" />
            <circle cx="16" cy="16" r="7" stroke="white" strokeWidth="2" />
            <circle cx="16" cy="9" r="2" fill="white" />
            <circle cx="16" cy="23" r="2" fill="white" />
            <circle cx="9" cy="16" r="2" fill="white" />
            <circle cx="23" cy="16" r="2" fill="white" />
          </svg>
          <h1 className="text-2xl font-bold tracking-tight">SeatWise</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter the password to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="bg-card border rounded-xl shadow-sm p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showPw ? 'text' : 'password'}
                className="pl-9 pr-9"
                placeholder="Enter password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                autoFocus
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPw(s => !s)}
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive font-medium">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading || !password}>
            {loading ? 'Checking…' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
