import { Switch, Route, Router, Redirect } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { TOKEN_KEY } from './lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
import EventsPage from './pages/EventsPage';
import EventPlanner from './pages/EventPlanner';
import LoginPage from './pages/LoginPage';
import NotFound from './pages/not-found';

/**
 * Wraps protected routes. Checks whether a password is required;
 * if so, redirects to /login when no token is stored locally.
 * The token itself is validated lazily by apiRequest (401 → redirect).
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery<{ hasPassword: boolean }>({
    queryKey: ['/api/auth/status'],
    // Fetch directly (not through apiRequest) so we don't create a 401 loop
    queryFn: () => fetch('/api/auth/status').then(r => r.json()),
    staleTime: 30_000,
  });

  if (isLoading) return null;

  if (data?.hasPassword && !localStorage.getItem(TOKEN_KEY)) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route path="/">
            <AuthGuard>
              <EventsPage />
            </AuthGuard>
          </Route>
          <Route path="/event/:id">
            {(params) => (
              <AuthGuard>
                <EventPlanner />
              </AuthGuard>
            )}
          </Route>
          <Route component={NotFound} />
        </Switch>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
