import { useRef, useState, useCallback, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Event, Attendee, Table, SeatAssignment } from '@shared/schema';
import SeatDialog from './SeatDialog';

interface Props {
  event: Event;
  tables: Table[];
  attendees: Attendee[];
  assignments: SeatAssignment[];
  activeMeal: number;
  eventId: number;
}

interface DragState {
  type: 'table' | 'stage';
  id: number | 'stage';
  startX: number;
  startY: number;
  origX: number;
  origY: number;
}

interface StagePos { x: number; y: number; w: number; h: number; }

function getSeatPositions(cx: number, cy: number, radius: number, count: number, shape: 'full' | 'half') {
  const positions = [];
  if (shape === 'full') {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      positions.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    }
  } else {
    // Half moon: seats only on the front half (top semicircle)
    for (let i = 0; i < count; i++) {
      const angle = Math.PI + (i / (count - 1)) * Math.PI;
      positions.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    }
  }
  return positions;
}

function getSquareSeatPositions(cx: number, cy: number, size: number, count: number, shape: 'full' | 'half') {
  const positions: { x: number; y: number }[] = [];
  const half = size / 2;
  if (shape === 'half') {
    // Only top row
    const perSide = count;
    for (let i = 0; i < perSide; i++) {
      positions.push({ x: cx - half + (i + 0.5) * (size / perSide), y: cy - half - 14 });
    }
    return positions;
  }
  // full: distribute around all 4 sides
  const perSide = Math.ceil(count / 4);
  let placed = 0;
  for (let s = 0; s < 4 && placed < count; s++) {
    for (let i = 0; i < perSide && placed < count; i++) {
      const t = (i + 0.5) / perSide;
      let x = cx, y = cy;
      if (s === 0) { x = cx - half + t * size; y = cy - half - 14; }
      else if (s === 1) { x = cx + half + 14; y = cy - half + t * size; }
      else if (s === 2) { x = cx + half - t * size; y = cy + half + 14; }
      else { x = cx - half - 14; y = cy + half - t * size; }
      positions.push({ x, y });
      placed++;
    }
  }
  return positions;
}

function roleColor(role: string) {
  if (role === 'host') return 'var(--host-color)';
  if (role === 'floater') return 'var(--floater-color)';
  return 'var(--invitee-color)';
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function FloorPlanCanvas({ event, tables, attendees, assignments, activeMeal, eventId }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [tablePositions, setTablePositions] = useState<Record<number, { x: number; y: number }>>({});
  const [stagePos, setStagePos] = useState<StagePos>(() => {
    try { return JSON.parse(event.stagePosition); } catch { return { x: 300, y: 40, w: 220, h: 70 }; }
  });
  const [selectedSeat, setSelectedSeat] = useState<{ tableId: number; seatPos: number } | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(event.floorPlanImage || null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync stagePos from event
  useEffect(() => {
    try { setStagePos(JSON.parse(event.stagePosition)); } catch {}
  }, [event.stagePosition]);

  const updateTableMutation = useMutation({
    mutationFn: ({ id, x, y }: { id: number; x: number; y: number }) =>
      apiRequest('PATCH', `/api/tables/${id}`, { x, y }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'tables'] }),
  });

  const updateEventMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', `/api/events/${eventId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/events', eventId] }),
  });

  const getCanvasOffset = useCallback(() => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const r = canvasRef.current.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'table' | 'stage', id: number | 'stage', objX: number, objY: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({ type, id, startX: e.clientX, startY: e.clientY, origX: objX, origY: objY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.type === 'table' && typeof drag.id === 'number') {
      setTablePositions(prev => ({
        ...prev,
        [drag.id as number]: { x: drag.origX + dx, y: drag.origY + dy },
      }));
    } else if (drag.type === 'stage') {
      setStagePos(prev => ({ ...prev, x: drag.origX + dx, y: drag.origY + dy }));
    }
  }, [drag]);

  const handleMouseUp = useCallback(() => {
    if (!drag) return;
    if (drag.type === 'table' && typeof drag.id === 'number') {
      const pos = tablePositions[drag.id] ?? { x: drag.origX, y: drag.origY };
      updateTableMutation.mutate({ id: drag.id as number, x: pos.x, y: pos.y });
      setTablePositions(prev => { const n = { ...prev }; delete n[drag.id as number]; return n; });
    } else if (drag.type === 'stage') {
      updateEventMutation.mutate({ stagePosition: JSON.stringify(stagePos) });
    }
    setDrag(null);
  }, [drag, tablePositions, stagePos]);

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setBgImage(dataUrl);
      updateEventMutation.mutate({ floorPlanImage: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const clearBg = () => {
    setBgImage(null);
    updateEventMutation.mutate({ floorPlanImage: null });
  };

  // Build assignment lookup
  const assignmentMap = new Map<string, SeatAssignment>();
  for (const a of assignments) {
    assignmentMap.set(`${a.tableId}-${a.seatPosition}`, a);
  }

  const attendeeMap = new Map<number, Attendee>();
  for (const a of attendees) attendeeMap.set(a.id, a);

  const isCircular = event.tableType === 'circular';
  const TABLE_RADIUS = isCircular ? 45 : 0;
  const TABLE_SIZE = 70; // for square
  const SEAT_RADIUS = isCircular ? TABLE_RADIUS + 26 : 0;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-card text-xs">
        <span className="text-muted-foreground">Floor plan:</span>
        <button
          className="text-primary hover:underline"
          onClick={() => fileRef.current?.click()}
        >Upload image</button>
        {bgImage && <button className="text-destructive hover:underline" onClick={clearBg}>Clear</button>}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
        <span className="ml-auto text-muted-foreground">Drag tables to reposition · Click seats to assign attendees</span>
        {/* Legend */}
        <div className="flex items-center gap-3 ml-2">
          <span className="flex items-center gap-1"><span className="legend-dot" style={{ background: 'var(--host-color)' }} /> Host</span>
          <span className="flex items-center gap-1"><span className="legend-dot" style={{ background: 'var(--floater-color)' }} /> Floater</span>
          <span className="flex items-center gap-1"><span className="legend-dot" style={{ background: 'var(--invitee-color)' }} /> Invitee</span>
          <span className="flex items-center gap-1"><span className="legend-dot" style={{ background: '#e2e8f0', border: '1px dashed #94a3b8' }} /> Empty</span>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="floor-canvas flex-1"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Background image */}
        {bgImage && (
          <img
            src={bgImage}
            alt="Floor plan"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.35, pointerEvents: 'none' }}
          />
        )}

        {/* Stage */}
        <div
          className="stage-node"
          style={{ left: stagePos.x, top: stagePos.y, width: stagePos.w, height: stagePos.h }}
          onMouseDown={e => handleMouseDown(e, 'stage', 'stage', stagePos.x, stagePos.y)}
        >
          STAGE
        </div>

        {/* Tables */}
        {tables.map(table => {
          const posOverride = tablePositions[table.id];
          const cx = (posOverride?.x ?? table.x) + (isCircular ? TABLE_RADIUS + 30 : TABLE_SIZE / 2 + 20);
          const cy = (posOverride?.y ?? table.y) + (isCircular ? TABLE_RADIUS + 30 : TABLE_SIZE / 2 + 20);
          const tx = posOverride?.x ?? table.x;
          const ty = posOverride?.y ?? table.y;

          const seatCount = event.seatsPerTable;
          const seatPositions = isCircular
            ? getSeatPositions(cx, cy, SEAT_RADIUS, seatCount, table.shape as 'full' | 'half')
            : getSquareSeatPositions(cx, cy, TABLE_SIZE, seatCount, table.shape as 'full' | 'half');

          const tableW = isCircular ? (TABLE_RADIUS + SEAT_RADIUS + 30) * 2 : TABLE_SIZE + 60;
          const tableH = isCircular ? (TABLE_RADIUS + SEAT_RADIUS + 30) * 2 : TABLE_SIZE + 60;

          return (
            <div
              key={table.id}
              className="table-node"
              style={{ left: tx, top: ty, width: tableW, height: tableH }}
              onMouseDown={e => handleMouseDown(e, 'table', table.id, tx, ty)}
              data-testid={`canvas-table-${table.id}`}
            >
              {/* Table surface */}
              {isCircular ? (
                <svg
                  style={{ position: 'absolute', top: 0, left: 0, width: tableW, height: tableH, overflow: 'visible', pointerEvents: 'none' }}
                >
                  {/* Table shape */}
                  {table.shape === 'full' ? (
                    <circle cx={cx - tx} cy={cy - ty} r={TABLE_RADIUS} fill="#dbeafe" stroke="#93c5fd" strokeWidth="2" />
                  ) : (
                    <path
                      d={`M ${cx - tx - TABLE_RADIUS} ${cy - ty} A ${TABLE_RADIUS} ${TABLE_RADIUS} 0 0 1 ${cx - tx + TABLE_RADIUS} ${cy - ty} Z`}
                      fill="#dbeafe" stroke="#93c5fd" strokeWidth="2"
                    />
                  )}
                  {/* Table number */}
                  <text x={cx - tx} y={cy - ty + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#1e40af">{table.tableNumber}</text>
                </svg>
              ) : (
                <div style={{
                  position: 'absolute',
                  left: cx - tx - TABLE_SIZE / 2,
                  top: cy - ty - TABLE_SIZE / 2,
                  width: TABLE_SIZE,
                  height: TABLE_SIZE,
                  background: '#dbeafe',
                  border: '2px solid #93c5fd',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 14,
                  color: '#1e40af',
                  pointerEvents: 'none',
                }}>
                  {table.tableNumber}
                </div>
              )}

              {/* Seat dots */}
              {seatPositions.map((pos, i) => {
                const key = `${table.id}-${i}`;
                const assignment = assignmentMap.get(key);
                const person = assignment ? attendeeMap.get(assignment.attendeeId) : null;
                return (
                  <div
                    key={i}
                    className={`seat-dot ${person ? `seat-${person.role}` : 'seat-empty'}`}
                    style={{
                      position: 'absolute',
                      left: pos.x - tx - 14,
                      top: pos.y - ty - 14,
                      background: person ? roleColor(person.role) : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={e => { e.stopPropagation(); setSelectedSeat({ tableId: table.id, seatPos: i }); }}
                    title={person ? `${person.name} (${person.role})` : `Empty seat ${i + 1}`}
                    data-testid={`seat-${table.id}-${i}`}
                  >
                    {person ? initials(person.name) : i + 1}
                  </div>
                );
              })}
            </div>
          );
        })}

        {tables.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-muted-foreground">
              <p className="text-sm font-medium">No tables yet</p>
              <p className="text-xs mt-1">Add tables from the left panel</p>
            </div>
          </div>
        )}
      </div>

      {/* Seat assignment dialog */}
      {selectedSeat && (
        <SeatDialog
          tableId={selectedSeat.tableId}
          seatPos={selectedSeat.seatPos}
          eventId={eventId}
          activeMeal={activeMeal}
          attendees={attendees}
          assignments={assignments}
          tables={tables}
          onClose={() => setSelectedSeat(null)}
        />
      )}
    </div>
  );
}
