import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryClient as qc, apiRequest, TOKEN_KEY } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useLocation } from 'wouter';
import type { Event } from '@shared/schema';
import { CalendarDays, Eye, EyeOff, KeyRound, Lock, LogOut, Plus, Trash2, ArrowRight, Users, X } from 'lucide-react';

// ── Password management dialog ─────────────────────────────────────────────
function PasswordDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qclient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: authStatus } = useQuery<{ hasPassword: boolean }>({
    queryKey: ['/api/auth/status'],
    queryFn: () => fetch('/api/auth/status').then(r => r.json()),
  });
  const hasPassword = authStatus?.hasPassword ?? false;

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');

  const setPasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPw.length < 4) throw new Error('Password must be at least 4 characters');
      if (newPw !== confirmPw) throw new Error('Passwords do not match');
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: hasPassword ? currentPw : undefined, newPassword: newPw }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Failed to set password');
      }
      return res.json();
    },
    onSuccess: ({ token }) => {
      localStorage.setItem(TOKEN_KEY, token);
      qclient.invalidateQueries({ queryKey: ['/api/auth/status'] });
      toast({ title: hasPassword ? 'Password changed' : 'Password set' });
      onClose();
    },
    onError: (e: any) => setError(e.message),
  });

  const removePasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/password', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Failed to remove password');
      }
      return res.json();
    },
    onSuccess: () => {
      localStorage.removeItem(TOKEN_KEY);
      qclient.invalidateQueries({ queryKey: ['/api/auth/status'] });
      toast({ title: 'Password removed — app is now open access' });
      onClose();
    },
    onError: (e: any) => setError(e.message),
  });

  const isPending = setPasswordMutation.isPending || removePasswordMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="bg-card border rounded-xl shadow-2xl w-full max-w-[380px] p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">{hasPassword ? 'Change Password' : 'Set Password'}</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {hasPassword
            ? 'Enter your current password, then choose a new one.'
            : 'Set a password to restrict access to this app.'}
        </p>

        <div className="space-y-3">
          {hasPassword && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Current password</label>
              <div className="relative">
                <Input
                  type={showCurrent ? 'text' : 'password'}
                  className="h-8 text-sm pr-8"
                  placeholder="Current password"
                  value={currentPw}
                  onChange={e => { setCurrentPw(e.target.value); setError(''); }}
                  autoFocus
                />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowCurrent(s => !s)} tabIndex={-1}>
                  {showCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium">New password</label>
            <div className="relative">
              <Input
                type={showNew ? 'text' : 'password'}
                className="h-8 text-sm pr-8"
                placeholder="At least 4 characters"
                value={newPw}
                onChange={e => { setNewPw(e.target.value); setError(''); }}
                autoFocus={!hasPassword}
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowNew(s => !s)} tabIndex={-1}>
                {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Confirm new password</label>
            <Input
              type="password"
              className="h-8 text-sm"
              placeholder="Repeat new password"
              value={confirmPw}
              onChange={e => { setConfirmPw(e.target.value); setError(''); }}
            />
          </div>
        </div>

        {error && <p className="text-xs text-destructive font-medium">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1 h-8 text-xs"
            onClick={() => setPasswordMutation.mutate()}
            disabled={isPending || !newPw || !confirmPw || (hasPassword && !currentPw)}
          >
            {setPasswordMutation.isPending ? 'Saving…' : hasPassword ? 'Change Password' : 'Set Password'}
          </Button>
        </div>

        {hasPassword && (
          <div className="border-t pt-3">
            <button
              className="text-xs text-destructive hover:underline disabled:opacity-50"
              disabled={isPending || !currentPw}
              onClick={() => {
                if (confirm('Remove password? The app will become publicly accessible.')) {
                  removePasswordMutation.mutate();
                }
              }}
            >
              Remove password (open access)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function EventsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [newName, setNewName] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  const { data: authStatus } = useQuery<{ hasPassword: boolean }>({
    queryKey: ['/api/auth/status'],
    queryFn: () => fetch('/api/auth/status').then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: events = [], isLoading } = useQuery<Event[]>({
    queryKey: ['/api/events'],
    queryFn: () => apiRequest('GET', '/api/events'),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest('POST', '/api/events', {
        name,
        tableType: 'circular',
        seatsPerTable: 10,
        mealFunctionCount: 1,
        mealFunctionNames: JSON.stringify(['Meal Function 1']),
        stagePosition: JSON.stringify({ x: 300, y: 40, w: 220, h: 70 }),
      }),
    onSuccess: (event: Event) => {
      qc.invalidateQueries({ queryKey: ['/api/events'] });
      setNewName('');
      navigate(`/event/${event.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/events/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/events'] });
      toast({ title: 'Event deleted' });
    },
  });

  const handleCreate = () => {
    const name = newName.trim() || 'New Event';
    createMutation.mutate(name);
  };

  const handleSignOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-3">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-label="SeatWise logo" fill="none" className="flex-shrink-0">
            <rect x="2" y="2" width="28" height="28" rx="6" fill="hsl(215,80%,42%)" />
            <circle cx="16" cy="16" r="7" stroke="white" strokeWidth="2" />
            <circle cx="16" cy="9" r="2" fill="white" />
            <circle cx="16" cy="23" r="2" fill="white" />
            <circle cx="9" cy="16" r="2" fill="white" />
            <circle cx="23" cy="16" r="2" fill="white" />
          </svg>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">SeatWise</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Event Seating Planner</p>
          </div>

          {/* Security controls — icon-only on mobile, labelled on sm+ */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 sm:w-auto sm:px-3 sm:gap-1.5 text-xs"
              onClick={() => setShowPasswordDialog(true)}
              title={authStatus?.hasPassword ? 'Change password' : 'Set a password'}
            >
              <Lock className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{authStatus?.hasPassword ? 'Password' : 'Set password'}</span>
            </Button>
            {authStatus?.hasPassword && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 sm:w-auto sm:px-3 sm:gap-1.5 text-xs text-muted-foreground"
                onClick={handleSignOut}
                title="Sign out"
              >
                <LogOut className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold mb-1">Your Events</h2>
          <p className="text-muted-foreground text-sm">Create and manage seating arrangements for your events.</p>
        </div>

        {/* Create new */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-6 sm:mb-8">
          <Input
            data-testid="input-event-name"
            placeholder="Event name (e.g. Annual Gala 2025)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            className="sm:max-w-sm"
          />
          <Button data-testid="button-create-event" onClick={handleCreate} disabled={createMutation.isPending} className="h-10">
            <Plus className="w-4 h-4 mr-1.5" />
            New Event
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No events yet</p>
            <p className="text-sm mt-1">Create your first event above to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map(event => (
              <Card key={event.id} className="p-5 hover:shadow-md transition-shadow group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-base leading-tight">{event.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {event.seatsPerTable} seats · {event.mealFunctionCount} meal function{event.mealFunctionCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button
                    data-testid={`button-delete-event-${event.id}`}
                    variant="ghost"
                    size="icon"
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 h-9 w-9 text-destructive hover:text-destructive"
                    onClick={e => { e.stopPropagation(); deleteMutation.mutate(event.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs px-2 py-0.5 bg-accent text-accent-foreground rounded-full font-medium capitalize">
                    {event.tableType}
                  </span>
                  <Button
                    data-testid={`button-open-event-${event.id}`}
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-primary hover:text-primary"
                    onClick={() => navigate(`/event/${event.id}`)}
                  >
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {showPasswordDialog && <PasswordDialog onClose={() => setShowPasswordDialog(false)} />}
    </div>
  );
}
