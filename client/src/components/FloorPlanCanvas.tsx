import { useRef, useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { MealConfig, Attendee, Table, SeatAssignment } from '@shared/schema';
import SeatDialog from './SeatDialog';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  mealConfig: MealConfig | undefined;
  tables: Table[];
  attendees: Attendee[];
  assignments: SeatAssignment[];
  activeMeal: number;
  eventId: number;
}

// Drag state for tables/stage/canvas-pan
interface DragState {
  type: 'table' | 'stage' | 'pan';
  id: number | 'stage' | null;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
}

// Drag state for seat-to-seat moves
interface SeatDragState {
  tableId: number;
  seatPos: number;
  person: Attendee;
  mouseX: number;
  mouseY: number;
  startX: number;
  startY: number;
  moved: boolean;
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
    for (let i = 0; i < count; i++) {
      positions.push({ x: cx - half + (i + 0.5) * (size / count), y: cy - half - 14 });
    }
    return positions;
  }
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

const DEFAULT_STAGE: StagePos = { x: 300, y: 40, w: 200, h: 65 };

export default function FloorPlanCanvas({ mealConfig, tables, attendees, assignments, activeMeal, eventId }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Table/stage/pan drag
  const [drag, setDrag] = useState<DragState | null>(null);
  const [tablePositions, setTablePositions] = useState<Record<number, { x: number; y: number }>>({});
  const [stagePos, setStagePos] = useState<StagePos>(() => {
    try { return JSON.parse(mealConfig?.stagePosition ?? 'null') ?? DEFAULT_STAGE; } catch { return DEFAULT_STAGE; }
  });

  // Seat drag-to-swap
  const [seatDrag, setSeatDrag] = useState<SeatDragState | null>(null);
  const [dropTarget, setDropTarget] = useState<{ tableId: number; seatPos: number } | null>(null);

  // Seat assignment dialog
  const [selectedSeat, setSelectedSeat] = useState<{ tableId: number; seatPos: number } | null>(null);

  // Floor plan background
  const [bgImage, setBgImage] = useState<string | null>(mealConfig?.floorPlanImage ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Zoom & pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Refs so wheel handler (native listener) always reads current values
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // Mouse-wheel zoom centred on cursor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const z = zoomRef.current;
      const newZ = Math.max(0.25, Math.min(3, z * factor));
      const ratio = newZ / z;
      const p = panRef.current;
      setZoom(newZ);
      setPan({ x: mx - ratio * (mx - p.x), y: my - ratio * (my - p.y) });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Sync stage/bg/positions when meal changes; reset zoom & pan
  useEffect(() => {
    if (mealConfig) {
      try { setStagePos(JSON.parse(mealConfig.stagePosition) ?? DEFAULT_STAGE); } catch {}
      setBgImage(mealConfig.floorPlanImage ?? null);
    } else {
      setStagePos(DEFAULT_STAGE);
      setBgImage(null);
    }
    setTablePositions({});
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [mealConfig?.id, activeMeal]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateTableMutation = useMutation({
    mutationFn: ({ id, x, y }: { id: number; x: number; y: number }) =>
      apiRequest('PATCH', `/api/tables/${id}`, { x, y }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'tables', activeMeal] }),
  });

  const updateMealConfigMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', `/api/events/${eventId}/meal-config?meal=${activeMeal}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'meal-config', activeMeal] }),
  });

  const swapSeatsMutation = useMutation({
    mutationFn: async ({ fromTableId, fromSeatPos, toTableId, toSeatPos }: {
      fromTableId: number; fromSeatPos: number;
      toTableId: number; toSeatPos: number;
    }) => {
      const fromA = assignments.find(a => a.tableId === fromTableId && a.seatPosition === fromSeatPos);
      const toA = assignments.find(a => a.tableId === toTableId && a.seatPosition === toSeatPos);
      if (!fromA) return;
      if (toA) {
        // Swap both seats simultaneously
        await Promise.all([
          apiRequest('PATCH', `/api/assignments/${fromA.id}`, { tableId: toTableId, seatPosition: toSeatPos }),
          apiRequest('PATCH', `/api/assignments/${toA.id}`, { tableId: fromTableId, seatPosition: fromSeatPos }),
        ]);
      } else {
        // Move to empty seat
        await apiRequest('PATCH', `/api/assignments/${fromA.id}`, { tableId: toTableId, seatPosition: toSeatPos });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'assignments', activeMeal] });
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'assignments'] });
    },
    onError: (e: any) => toast({ title: 'Move failed', description: e.message, variant: 'destructive' }),
  });

  // ── Mouse handlers ────────────────────────────────────────────────────────

  // Table / stage drag start (called from table/stage onMouseDown)
  const handleObjectMouseDown = (e: React.MouseEvent, type: 'table' | 'stage', id: number | 'stage', objX: number, objY: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({ type, id, startX: e.clientX, startY: e.clientY, origX: objX, origY: objY });
  };

  // Canvas background pan start
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDrag({ type: 'pan', id: null, startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y });
  };

  // Seat drag start (only for occupied seats)
  const handleSeatMouseDown = (e: React.MouseEvent, tableId: number, seatPos: number, person: Attendee) => {
    e.preventDefault();
    e.stopPropagation(); // prevent table drag from starting
    setSeatDrag({ tableId, seatPos, person, mouseX: e.clientX, mouseY: e.clientY, startX: e.clientX, startY: e.clientY, moved: false });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // ── Seat drag ──
    if (seatDrag) {
      const nowMoved = Math.abs(e.clientX - seatDrag.startX) > 5 || Math.abs(e.clientY - seatDrag.startY) > 5;
      setSeatDrag(prev => prev ? { ...prev, mouseX: e.clientX, mouseY: e.clientY, moved: prev.moved || nowMoved } : null);

      if (nowMoved || seatDrag.moved) {
        // Highlight valid drop target under cursor
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const el = els.find(x => x.hasAttribute('data-seat-table'));
        if (el) {
          const tid = Number(el.getAttribute('data-seat-table'));
          const sp = Number(el.getAttribute('data-seat-pos'));
          if (tid !== seatDrag.tableId || sp !== seatDrag.seatPos) {
            setDropTarget({ tableId: tid, seatPos: sp });
          } else {
            setDropTarget(null);
          }
        } else {
          setDropTarget(null);
        }
      }
      return;
    }

    // ── Table / stage / pan drag ──
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (drag.type === 'table' && typeof drag.id === 'number') {
      // Divide by zoom: screen-pixel delta → world-pixel delta
      setTablePositions(prev => ({
        ...prev,
        [drag.id as number]: { x: drag.origX + dx / zoom, y: drag.origY + dy / zoom },
      }));
    } else if (drag.type === 'stage') {
      setStagePos(prev => ({ ...prev, x: drag.origX + dx / zoom, y: drag.origY + dy / zoom }));
    } else if (drag.type === 'pan') {
      setPan({ x: drag.origX + dx, y: drag.origY + dy });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // ── Seat drag end ──
    if (seatDrag) {
      if (!seatDrag.moved) {
        // Short click: open assignment dialog
        setSelectedSeat({ tableId: seatDrag.tableId, seatPos: seatDrag.seatPos });
      } else {
        // Drop: find seat element under cursor
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const el = els.find(x => x.hasAttribute('data-seat-table'));
        if (el) {
          const toTableId = Number(el.getAttribute('data-seat-table'));
          const toSeatPos = Number(el.getAttribute('data-seat-pos'));
          if (toTableId !== seatDrag.tableId || toSeatPos !== seatDrag.seatPos) {
            swapSeatsMutation.mutate({
              fromTableId: seatDrag.tableId, fromSeatPos: seatDrag.seatPos,
              toTableId, toSeatPos,
            });
          }
        }
      }
      setSeatDrag(null);
      setDropTarget(null);
      return;
    }

    // ── Table / stage drag end ──
    if (!drag) return;
    if (drag.type === 'table' && typeof drag.id === 'number') {
      const pos = tablePositions[drag.id] ?? { x: drag.origX, y: drag.origY };
      updateTableMutation.mutate({ id: drag.id as number, x: pos.x, y: pos.y });
      setTablePositions(prev => { const n = { ...prev }; delete n[drag.id as number]; return n; });
    } else if (drag.type === 'stage') {
      updateMealConfigMutation.mutate({ stagePosition: JSON.stringify(stagePos) });
    }
    // pan: nothing to persist
    setDrag(null);
  };

  // ── Background image ──────────────────────────────────────────────────────
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setBgImage(dataUrl);
      updateMealConfigMutation.mutate({ floorPlanImage: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const clearBg = () => {
    setBgImage(null);
    updateMealConfigMutation.mutate({ floorPlanImage: null });
  };

  // ── Lookup maps ───────────────────────────────────────────────────────────
  const assignmentMap = new Map<string, SeatAssignment>();
  for (const a of assignments) assignmentMap.set(`${a.tableId}-${a.seatPosition}`, a);

  const attendeeMap = new Map<number, Attendee>();
  for (const a of attendees) attendeeMap.set(a.id, a);

  const tableType = mealConfig?.tableType ?? 'circular';
  const seatsPerTable = mealConfig?.seatsPerTable ?? 10;
  const isCircular = tableType === 'circular';
  const TABLE_RADIUS = isCircular ? 45 : 0;
  const TABLE_SIZE = 70;
  const SEAT_RADIUS = isCircular ? TABLE_RADIUS + 26 : 0;

  // ── Canvas cursor ─────────────────────────────────────────────────────────
  const canvasCursor = drag?.type === 'pan' ? 'grabbing' : seatDrag?.moved ? 'crosshair' : 'default';

  return (
    <div className="h-full flex flex-col">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-card text-xs flex-shrink-0">
        <span className="text-muted-foreground">Floor plan:</span>
        <button className="text-primary hover:underline" onClick={() => fileRef.current?.click()}>
          Upload image
        </button>
        {bgImage && <button className="text-destructive hover:underline" onClick={clearBg}>Clear</button>}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />

        <span className="text-muted-foreground hidden lg:inline ml-2">
          Drag tables · Drag seats to swap · Click seats to assign
        </span>

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5 ml-auto">
          <Button
            size="icon" variant="ghost" className="h-6 w-6"
            title="Zoom out (scroll down)"
            onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
          >
            <ZoomOut className="w-3 h-3" />
          </Button>
          <button
            className="text-xs w-11 text-center tabular-nums hover:bg-muted rounded px-1 py-0.5"
            title="Click to reset zoom & pan"
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button
            size="icon" variant="ghost" className="h-6 w-6"
            title="Zoom in (scroll up)"
            onClick={() => setZoom(z => Math.min(3, z + 0.25))}
          >
            <ZoomIn className="w-3 h-3" />
          </Button>
          <Button
            size="icon" variant="ghost" className="h-6 w-6"
            title="Reset view"
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          >
            <Maximize2 className="w-3 h-3" />
          </Button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 ml-2">
          <span className="flex items-center gap-1"><span className="legend-dot" style={{ background: 'var(--host-color)' }} /> Host</span>
          <span className="flex items-center gap-1"><span className="legend-dot" style={{ background: 'var(--floater-color)' }} /> Floater</span>
          <span className="flex items-center gap-1"><span className="legend-dot" style={{ background: 'var(--invitee-color)' }} /> Invitee</span>
          <span className="flex items-center gap-1"><span className="legend-dot" style={{ background: '#e2e8f0', border: '1px dashed #94a3b8' }} /> Empty</span>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div
        ref={canvasRef}
        className="floor-canvas flex-1"
        style={{ cursor: canvasCursor }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* ── Zoomable/pannable world ── */}
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
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
            onMouseDown={e => handleObjectMouseDown(e, 'stage', 'stage', stagePos.x, stagePos.y)}
          >
            STAGE
          </div>

          {/* Tables */}
          {tables.map(table => {
            const posOverride = tablePositions[table.id];
            const tx = posOverride?.x ?? table.x;
            const ty = posOverride?.y ?? table.y;
            const cx = tx + (isCircular ? TABLE_RADIUS + 30 : TABLE_SIZE / 2 + 20);
            const cy = ty + (isCircular ? TABLE_RADIUS + 30 : TABLE_SIZE / 2 + 20);

            const seatPositions = isCircular
              ? getSeatPositions(cx, cy, SEAT_RADIUS, seatsPerTable, table.shape as 'full' | 'half')
              : getSquareSeatPositions(cx, cy, TABLE_SIZE, seatsPerTable, table.shape as 'full' | 'half');

            const tableW = isCircular ? (TABLE_RADIUS + SEAT_RADIUS + 30) * 2 : TABLE_SIZE + 60;
            const tableH = isCircular ? (TABLE_RADIUS + SEAT_RADIUS + 30) * 2 : TABLE_SIZE + 60;

            return (
              <div
                key={table.id}
                className="table-node"
                style={{ left: tx, top: ty, width: tableW, height: tableH }}
                onMouseDown={e => handleObjectMouseDown(e, 'table', table.id, tx, ty)}
                data-testid={`canvas-table-${table.id}`}
              >
                {/* Table surface */}
                {isCircular ? (
                  <svg style={{ position: 'absolute', top: 0, left: 0, width: tableW, height: tableH, overflow: 'visible', pointerEvents: 'none' }}>
                    {table.shape === 'full' ? (
                      <circle cx={cx - tx} cy={cy - ty} r={TABLE_RADIUS} fill="#dbeafe" stroke="#93c5fd" strokeWidth="2" />
                    ) : (
                      <path
                        d={`M ${cx - tx - TABLE_RADIUS} ${cy - ty} A ${TABLE_RADIUS} ${TABLE_RADIUS} 0 0 1 ${cx - tx + TABLE_RADIUS} ${cy - ty} Z`}
                        fill="#dbeafe" stroke="#93c5fd" strokeWidth="2"
                      />
                    )}
                    <text x={cx - tx} y={cy - ty + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#1e40af">
                      {table.tableNumber}
                    </text>
                  </svg>
                ) : (
                  <div style={{
                    position: 'absolute',
                    left: cx - tx - TABLE_SIZE / 2, top: cy - ty - TABLE_SIZE / 2,
                    width: TABLE_SIZE, height: TABLE_SIZE,
                    background: '#dbeafe', border: '2px solid #93c5fd', borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, color: '#1e40af', pointerEvents: 'none',
                  }}>
                    {table.tableNumber}
                  </div>
                )}

                {/* Seat dots */}
                {seatPositions.map((pos, i) => {
                  const key = `${table.id}-${i}`;
                  const assignment = assignmentMap.get(key);
                  const person = assignment ? attendeeMap.get(assignment.attendeeId) : null;
                  const isDropTarget = dropTarget?.tableId === table.id && dropTarget.seatPos === i;
                  // Fade the seat being dragged so the ghost stands out
                  const isBeingDragged = seatDrag?.moved && seatDrag.tableId === table.id && seatDrag.seatPos === i;

                  // Choose label based on zoom level
                  const seatLabel = (p: Attendee) => {
                    if (zoom >= 2.5) return p.name;
                    if (zoom >= 1.5) return p.name.split(' ')[0]; // first name
                    return initials(p.name);
                  };

                  return (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        left: pos.x - tx - 14,
                        top: pos.y - ty - 14,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        // Give enough room for the name label below the dot
                        overflow: 'visible',
                        zIndex: isDropTarget ? 5 : 1,
                      }}
                    >
                      {/* Seat circle */}
                      <div
                        className={`seat-dot ${person ? `seat-${person.role}` : 'seat-empty'}${isDropTarget ? ' seat-drop-target' : ''}`}
                        style={{
                          background: person ? roleColor(person.role) : undefined,
                          cursor: person ? (seatDrag ? 'crosshair' : 'grab') : 'pointer',
                          opacity: isBeingDragged ? 0.25 : 1,
                          // Show text that fits at zoom ≥1.5
                          fontSize: zoom >= 1.5 ? 8 : 9,
                          overflow: zoom >= 1.5 ? 'hidden' : 'hidden',
                        }}
                        onMouseDown={person
                          ? (e) => handleSeatMouseDown(e, table.id, i, person)
                          : (e) => e.stopPropagation() // stop empty-seat click from starting table drag
                        }
                        onClick={!person ? (e) => { e.stopPropagation(); setSelectedSeat({ tableId: table.id, seatPos: i }); } : undefined}
                        data-seat-table={table.id}
                        data-seat-pos={i}
                        title={person ? `${person.name} (${person.role})${person.company ? ` · ${person.company}` : ''}` : `Empty seat ${i + 1}`}
                        data-testid={`seat-${table.id}-${i}`}
                      >
                        {person ? initials(person.name) : i + 1}
                      </div>

                      {/* Name label — visible when zoomed in enough */}
                      {zoom >= 1.5 && person && !isBeingDragged && (
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 7,
                            fontWeight: 600,
                            color: '#1e293b',
                            background: 'rgba(255,255,255,0.93)',
                            border: '1px solid #e2e8f0',
                            padding: '1px 4px',
                            borderRadius: 3,
                            lineHeight: 1.3,
                            textAlign: 'center',
                            whiteSpace: zoom >= 2.5 ? 'normal' : 'nowrap',
                            maxWidth: zoom >= 2.5 ? 90 : 64,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            pointerEvents: 'none',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          }}
                        >
                          {seatLabel(person)}
                        </div>
                      )}
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
        </div>{/* end world */}

        {/* ── Ghost dot follows cursor during seat drag ── */}
        {seatDrag?.moved && (
          <div
            style={{
              position: 'fixed',
              left: seatDrag.mouseX - 14,
              top: seatDrag.mouseY - 14,
              width: 28, height: 28,
              borderRadius: '50%',
              background: roleColor(seatDrag.person.role),
              color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 600,
              pointerEvents: 'none',
              zIndex: 9999,
              opacity: 0.92,
              border: '2px solid white',
              boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
              transform: 'scale(1.15)',
            }}
          >
            {initials(seatDrag.person.name)}
          </div>
        )}
      </div>{/* end canvas */}

      {/* ── Seat assignment dialog ── */}
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
