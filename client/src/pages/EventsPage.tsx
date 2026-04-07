import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useLocation } from 'wouter';
import type { Event } from '@shared/schema';
import { CalendarDays, Plus, Trash2, ArrowRight, Users } from 'lucide-react';

export default function EventsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [newName, setNewName] = useState('');

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
      queryClient.invalidateQueries({ queryKey: ['/api/events'] });
      setNewName('');
      navigate(`/event/${event.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events'] });
      toast({ title: 'Event deleted' });
    },
  });

  const handleCreate = () => {
    const name = newName.trim() || 'New Event';
    createMutation.mutate(name);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <svg viewBox="0 0 32 32" width="32" height="32" aria-label="SeatWise logo" fill="none">
            <rect x="2" y="2" width="28" height="28" rx="6" fill="hsl(215,80%,42%)"/>
            <circle cx="16" cy="16" r="7" stroke="white" strokeWidth="2"/>
            <circle cx="16" cy="9" r="2" fill="white"/>
            <circle cx="16" cy="23" r="2" fill="white"/>
            <circle cx="9" cy="16" r="2" fill="white"/>
            <circle cx="23" cy="16" r="2" fill="white"/>
          </svg>
          <div>
            <h1 className="text-xl font-bold tracking-tight">SeatWise</h1>
            <p className="text-xs text-muted-foreground">Event Seating Planner</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-1">Your Events</h2>
          <p className="text-muted-foreground text-sm">Create and manage seating arrangements for your events.</p>
        </div>

        {/* Create new */}
        <div className="flex gap-3 mb-8">
          <Input
            data-testid="input-event-name"
            placeholder="Event name (e.g. Annual Gala 2025)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            className="max-w-sm"
          />
          <Button data-testid="button-create-event" onClick={handleCreate} disabled={createMutation.isPending}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Event
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => (
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
                    className="opacity-0 group-hover:opacity-100 h-7 w-7 text-destructive hover:text-destructive"
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
    </div>
  );
}
