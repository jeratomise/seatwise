import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useParams, useLocation } from 'wouter';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Event, Attendee, Table, SeatAssignment, MealConfig } from '@shared/schema';
import ConfigPanel from '@/components/ConfigPanel';
import FloorPlanCanvas from '@/components/FloorPlanCanvas';
import AttendeePanel from '@/components/AttendeePanel';
import ExportPanel from '@/components/ExportPanel';
import { ArrowLeft, Settings, Map, Users, Download, X } from 'lucide-react';

const MOBILE_PANELS = [
  { value: 'floor',     icon: Map,      label: 'Floor' },
  { value: 'attendees', icon: Users,    label: 'People' },
  { value: 'config',    icon: Settings, label: 'Config' },
  { value: 'export',    icon: Download, label: 'Export' },
] as const;

type MobilePanelValue = typeof MOBILE_PANELS[number]['value'];
const PANEL_TITLES: Record<MobilePanelValue, string> = {
  floor: 'Floor Plan',
  attendees: 'Attendees',
  config: 'Configuration',
  export: 'Export',
};

export default function EventPlanner() {
  const { id } = useParams();
  const eventId = Number(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [activeMeal, setActiveMeal] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<MobilePanelValue | null>(null);

  const { data: event, isLoading: eventLoading } = useQuery<Event>({
    queryKey: ['/api/events', eventId],
    queryFn: () => apiRequest('GET', `/api/events/${eventId}`),
  });

  const { data: attendees = [] } = useQuery<Attendee[]>({
    queryKey: ['/api/events', eventId, 'attendees'],
    queryFn: () => apiRequest('GET', `/api/events/${eventId}/attendees`),
    enabled: !!eventId,
  });

  const { data: tables = [] } = useQuery<Table[]>({
    queryKey: ['/api/events', eventId, 'tables', activeMeal],
    queryFn: () => apiRequest('GET', `/api/events/${eventId}/tables?meal=${activeMeal}`),
    enabled: !!eventId,
  });

  const { data: mealConfig } = useQuery<MealConfig>({
    queryKey: ['/api/events', eventId, 'meal-config', activeMeal],
    queryFn: () => apiRequest('GET', `/api/events/${eventId}/meal-config?meal=${activeMeal}`),
    enabled: !!eventId,
  });

  const { data: assignmentsForMeal = [] } = useQuery<SeatAssignment[]>({
    queryKey: ['/api/events', eventId, 'assignments', activeMeal],
    queryFn: () => apiRequest('GET', `/api/events/${eventId}/assignments?meal=${activeMeal}`),
    enabled: !!eventId,
  });

  const { data: allAssignments = [] } = useQuery<SeatAssignment[]>({
    queryKey: ['/api/events', eventId, 'assignments'],
    queryFn: () => apiRequest('GET', `/api/events/${eventId}/assignments`),
    enabled: !!eventId,
  });

  const mealFunctionNames: string[] = event
    ? JSON.parse(event.mealFunctionNames)
    : ['Meal Function 1'];

  const handleMealSwitch = (i: number) => {
    setActiveMeal(i);
  };

  if (eventLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading event...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">Event not found</p>
          <Button onClick={() => navigate('/')}>Back to events</Button>
        </div>
      </div>
    );
  }

  // Shared canvas + panel content for both layouts
  const canvasEl = (
    <FloorPlanCanvas
      mealConfig={mealConfig}
      tables={tables}
      attendees={attendees}
      assignments={assignmentsForMeal}
      activeMeal={activeMeal}
      eventId={eventId}
    />
  );

  const floorPanel = <FloorSidePanel tables={tables} eventId={eventId} activeMeal={activeMeal} />;
  const attendeePanel = (
    <AttendeePanel
      eventId={eventId}
      event={event}
      attendees={attendees}
      tables={tables}
      assignments={assignmentsForMeal}
      activeMeal={activeMeal}
      mealConfig={mealConfig}
    />
  );
  const configPanel = (
    <ConfigPanel
      event={event}
      eventId={eventId}
      activeMeal={activeMeal}
      mealConfig={mealConfig}
    />
  );
  const exportPanel = (
    <ExportPanel
      event={event}
      tables={tables}
      attendees={attendees}
      allAssignments={allAssignments}
      mealFunctionNames={mealFunctionNames}
      activeMeal={activeMeal}
    />
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top Bar ── */}
      <header className="border-b bg-card px-3 py-2 flex items-center gap-2 flex-shrink-0 min-h-[52px]">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-9 w-9 flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-label="SeatWise" fill="none" className="flex-shrink-0">
          <rect x="1" y="1" width="22" height="22" rx="5" fill="hsl(215,80%,42%)"/>
          <circle cx="12" cy="12" r="5.5" stroke="white" strokeWidth="1.5"/>
          <circle cx="12" cy="6.5" r="1.5" fill="white"/>
          <circle cx="12" cy="17.5" r="1.5" fill="white"/>
          <circle cx="6.5" cy="12" r="1.5" fill="white"/>
          <circle cx="17.5" cy="12" r="1.5" fill="white"/>
        </svg>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-sm leading-tight truncate">{event.name}</h1>
          <p className="text-[10px] text-muted-foreground hidden sm:block">
            {mealConfig?.tableType ?? 'circular'} tables · {mealConfig?.seatsPerTable ?? 10} seats · {event.mealFunctionCount} meal function{event.mealFunctionCount !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Meal function tabs — scrollable on mobile */}
        <div className="flex gap-1 overflow-x-auto flex-shrink-0 max-w-[45%] sm:max-w-none scrollbar-hide">
          {mealFunctionNames.map((name, i) => (
            <Button
              key={i}
              variant={activeMeal === i ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-8 px-2 whitespace-nowrap flex-shrink-0"
              onClick={() => handleMealSwitch(i)}
              data-testid={`button-meal-${i}`}
            >
              {name}
            </Button>
          ))}
        </div>
      </header>

      {/* ── Main layout ── */}
      {isMobile ? (
        /* ═══ MOBILE: full-screen canvas + bottom nav + drawer ═══ */
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Canvas fills remaining space above bottom nav */}
          <div className="flex-1 overflow-hidden">
            {canvasEl}
          </div>

          {/* Bottom navigation bar */}
          <nav className="flex border-t bg-card flex-shrink-0">
            {MOBILE_PANELS.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[11px] font-medium transition-colors min-h-[56px] ${
                  mobilePanel === value
                    ? 'text-primary border-t-2 border-primary -mt-px'
                    : 'text-muted-foreground'
                }`}
                onClick={() => setMobilePanel(p => p === value ? null : value)}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </nav>

          {/* Bottom drawer overlay */}
          {mobilePanel && (
            <div className="fixed inset-0 z-50 flex flex-col justify-end">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setMobilePanel(null)}
              />
              {/* Drawer */}
              <div className="relative bg-card border-t rounded-t-2xl shadow-2xl flex flex-col"
                style={{ maxHeight: '75vh' }}>
                {/* Drag handle */}
                <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                </div>
                {/* Header */}
                <div className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
                  <h3 className="font-semibold text-sm">{PANEL_TITLES[mobilePanel]}</h3>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobilePanel(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Panel content */}
                <div
                  className="flex-1 overflow-hidden flex flex-col border-t"
                  style={{ minHeight: 0 }}
                >
                  {mobilePanel === 'floor' && (
                    <div className="p-3 overflow-y-auto flex-1">{floorPanel}</div>
                  )}
                  {mobilePanel === 'attendees' && (
                    <div className="flex-1 overflow-hidden flex flex-col">
                      {attendeePanel}
                    </div>
                  )}
                  {mobilePanel === 'config' && (
                    <div className="p-3 overflow-y-auto flex-1">{configPanel}</div>
                  )}
                  {mobilePanel === 'export' && (
                    <div className="p-3 overflow-y-auto flex-1">{exportPanel}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ═══ DESKTOP: left sidebar + canvas ═══ */
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar */}
          <div className="w-72 border-r bg-card flex flex-col overflow-hidden flex-shrink-0">
            <Tabs defaultValue="floor" className="flex flex-col h-full">
              <TabsList className="m-2 mb-0 grid grid-cols-4 h-auto p-1">
                <TabsTrigger value="floor" className="text-[10px] px-1 py-1 flex flex-col gap-0.5">
                  <Map className="w-3.5 h-3.5" />
                  <span>Floor</span>
                </TabsTrigger>
                <TabsTrigger value="attendees" className="text-[10px] px-1 py-1 flex flex-col gap-0.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>People</span>
                </TabsTrigger>
                <TabsTrigger value="config" className="text-[10px] px-1 py-1 flex flex-col gap-0.5">
                  <Settings className="w-3.5 h-3.5" />
                  <span>Config</span>
                </TabsTrigger>
                <TabsTrigger value="export" className="text-[10px] px-1 py-1 flex flex-col gap-0.5">
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="floor" className="flex-1 overflow-y-auto p-2 mt-2">
                {floorPanel}
              </TabsContent>
              <TabsContent value="attendees" className="flex-1 overflow-hidden flex flex-col mt-2">
                {attendeePanel}
              </TabsContent>
              <TabsContent value="config" className="flex-1 overflow-y-auto p-3 mt-2">
                {configPanel}
              </TabsContent>
              <TabsContent value="export" className="flex-1 overflow-y-auto p-3 mt-2">
                {exportPanel}
              </TabsContent>
            </Tabs>
          </div>

          {/* Main canvas */}
          <div className="flex-1 overflow-hidden relative">
            {canvasEl}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Floor side panel ──────────────────────────────────────────────────────────
function FloorSidePanel({ tables, eventId, activeMeal }: {
  tables: Table[]; eventId: number; activeMeal: number;
}) {
  const { toast } = useToast();

  const addTableMutation = useMutation({
    mutationFn: () => {
      const nextNum = tables.length > 0 ? Math.max(...tables.map(t => t.tableNumber)) + 1 : 1;
      const col = (tables.length % 4);
      const row = Math.floor(tables.length / 4);
      return apiRequest('POST', `/api/events/${eventId}/tables?meal=${activeMeal}`, {
        tableNumber: nextNum,
        x: 80 + col * 160,
        y: 80 + row * 160,
        shape: 'full',
        mealFunctionIndex: activeMeal,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'tables', activeMeal] }),
  });

  const deleteTableMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/tables/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'tables', activeMeal] });
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'assignments', activeMeal] });
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'assignments'] });
    },
  });

  const updateTableMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest('PATCH', `/api/tables/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'tables', activeMeal] }),
  });

  const autoArrangeMutation = useMutation({
    mutationFn: async () => {
      const cols = 4;
      for (const [i, t] of tables.entries()) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        await apiRequest('PATCH', `/api/tables/${t.id}`, {
          x: 80 + col * 160,
          y: 100 + row * 160,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'tables', activeMeal] });
      toast({ title: 'Tables auto-arranged' });
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: async (count: number) => {
      const start = tables.length > 0 ? Math.max(...tables.map(t => t.tableNumber)) + 1 : 1;
      for (let i = 0; i < count; i++) {
        const num = start + i;
        const idx = tables.length + i;
        const col = idx % 4;
        const row = Math.floor(idx / 4);
        await apiRequest('POST', `/api/events/${eventId}/tables?meal=${activeMeal}`, {
          tableNumber: num, x: 80 + col * 160, y: 80 + row * 160, shape: 'full',
          mealFunctionIndex: activeMeal,
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'tables', activeMeal] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <Button
          data-testid="button-add-table"
          size="sm" className="flex-1 h-9 text-xs"
          onClick={() => addTableMutation.mutate()}
          disabled={addTableMutation.isPending}
        >
          + Add Table
        </Button>
        <Button
          size="sm" variant="outline" className="h-9 text-xs"
          onClick={() => autoArrangeMutation.mutate()}
          disabled={autoArrangeMutation.isPending || tables.length === 0}
        >
          Auto-arrange
        </Button>
      </div>

      <div className="flex gap-1.5">
        {[5, 10, 15].map(n => (
          <Button key={n} size="sm" variant="outline" className="flex-1 h-9 text-xs"
            onClick={() => bulkAddMutation.mutate(n)} disabled={bulkAddMutation.isPending}>
            +{n}
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{tables.length} table{tables.length !== 1 ? 's' : ''} on floor</p>

      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {tables.map(t => (
          <div key={t.id}
            className="flex items-center gap-2 p-2 rounded bg-muted/50 hover:bg-muted text-xs"
            data-testid={`table-item-${t.id}`}
          >
            <span className="font-semibold w-5 text-center">{t.tableNumber}</span>
            <select
              className="text-xs bg-transparent border rounded px-1 py-1 flex-1"
              value={t.shape}
              onChange={e => updateTableMutation.mutate({ id: t.id, data: { shape: e.target.value } })}
            >
              <option value="full">Full moon</option>
              <option value="half">Half moon</option>
            </select>
            <Button
              variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0"
              onClick={() => deleteTableMutation.mutate(t.id)}
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
