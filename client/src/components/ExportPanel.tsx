import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Event, Attendee, Table, SeatAssignment, MealConfig } from '@shared/schema';
import { Download, FileText, Presentation } from 'lucide-react';

interface Props {
  event: Event;
  tables: Table[];         // tables for the currently-active meal (used for summary stats)
  attendees: Attendee[];
  allAssignments: SeatAssignment[];
  mealFunctionNames: string[];
}

function getSeatPositionsCircular(cx: number, cy: number, radius: number, count: number, shape: 'full' | 'half') {
  const positions = [];
  if (shape === 'full') {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      positions.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    }
  } else {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI + (i / Math.max(count - 1, 1)) * Math.PI;
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

export default function ExportPanel({ event, tables, attendees, allAssignments, mealFunctionNames }: Props) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const attendeeMap = new Map<number, Attendee>();
  for (const a of attendees) attendeeMap.set(a.id, a);

  // Fetch per-meal tables and configs for all meal functions (needed for accurate export)
  // useQueries is the correct way to handle a dynamic number of queries without
  // violating React's Rules of Hooks (hooks must not be called inside loops).
  const mealTableResults = useQueries({
    queries: mealFunctionNames.map((_, i) => ({
      queryKey: ['/api/events', event.id, 'tables', i] as const,
      queryFn: (): Promise<Table[]> => apiRequest('GET', `/api/events/${event.id}/tables?meal=${i}`),
    })),
  });
  const mealConfigResults = useQueries({
    queries: mealFunctionNames.map((_, i) => ({
      queryKey: ['/api/events', event.id, 'meal-config', i] as const,
      queryFn: (): Promise<MealConfig> => apiRequest('GET', `/api/events/${event.id}/meal-config?meal=${i}`),
    })),
  });

  const allMealTables: Table[][] = mealTableResults.map(q => (q.data as Table[] | undefined) ?? []);
  const allMealConfigs: (MealConfig | undefined)[] = mealConfigResults.map(q => q.data as MealConfig | undefined);

  const exportCSV = () => {
    const rows: string[] = ['Meal Function,Table Number,Table Shape,Seat Position,Name,Role,Company'];
    for (const [mealIdx, mealName] of mealFunctionNames.entries()) {
      const mealTables = allMealTables[mealIdx] ?? [];
      const mealConfig = allMealConfigs[mealIdx];
      const spt = mealConfig?.seatsPerTable ?? 10;
      const mealAssignments = allAssignments.filter(a => a.mealFunctionIndex === mealIdx);
      for (const table of [...mealTables].sort((a, b) => a.tableNumber - b.tableNumber)) {
        const tableAssignments = mealAssignments.filter(a => a.tableId === table.id)
          .sort((a, b) => a.seatPosition - b.seatPosition);
        for (let seat = 0; seat < spt; seat++) {
          const a = tableAssignments.find(x => x.seatPosition === seat);
          const person = a ? attendeeMap.get(a.attendeeId) : null;
          rows.push([
            `"${mealName}"`,
            table.tableNumber,
            table.shape,
            seat + 1,
            person ? `"${person.name}"` : '',
            person ? person.role : '',
            person?.company ? `"${person.company}"` : '',
          ].join(','));
        }
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.name.replace(/\s+/g, '_')}_seating.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exported' });
  };

  const exportPPTX = async () => {
    setExporting(true);
    try {
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"

      const SLIDE_W = 13.33;
      const SLIDE_H = 7.5;
      const roleColors: Record<string, string> = { host: '9333ea', floater: 'ea8033', invitee: '3b82f6' };

      const canvasW = 800;
      const canvasH = 600;
      const scaleX = (SLIDE_W - 1) / canvasW;
      const scaleY = (SLIDE_H - 1) / canvasH;

      for (const [mealIdx, mealName] of mealFunctionNames.entries()) {
        const mealTables = allMealTables[mealIdx] ?? [];
        const mealConfig = allMealConfigs[mealIdx];
        const spt = mealConfig?.seatsPerTable ?? 10;
        const isCircular = (mealConfig?.tableType ?? 'circular') === 'circular';
        const TABLE_RADIUS = isCircular ? 45 : 0;
        const TABLE_SIZE = 70;
        const SEAT_RADIUS = isCircular ? TABLE_RADIUS + 26 : 0;

        const stagePos = (() => {
          try { return JSON.parse(mealConfig?.stagePosition ?? 'null') ?? { x: 300, y: 40, w: 200, h: 65 }; }
          catch { return { x: 300, y: 40, w: 200, h: 65 }; }
        })();

        const mealAssignments = allAssignments.filter(a => a.mealFunctionIndex === mealIdx);

        // ── Floor plan slide ──
        const slide = pptx.addSlide();
        slide.background = { color: 'F0F4FF' };
        slide.addText(`${event.name} — ${mealName}`, {
          x: 0.3, y: 0.1, w: SLIDE_W - 0.6, h: 0.45,
          fontSize: 20, bold: true, color: '1e293b', fontFace: 'Calibri',
        });

        // Stage
        const sx = 0.5 + stagePos.x * scaleX;
        const sy = 0.7 + stagePos.y * scaleY;
        const sw = stagePos.w * scaleX;
        const sh = stagePos.h * scaleY;
        slide.addShape(pptx.ShapeType.rect, {
          x: sx, y: sy, w: sw, h: sh,
          fill: { color: '1e293b' }, line: { color: '475569', width: 1 },
        });
        slide.addText('STAGE', {
          x: sx, y: sy, w: sw, h: sh,
          fontSize: 10, bold: true, color: 'FFFFFF',
          align: 'center', valign: 'middle', fontFace: 'Calibri',
        });

        for (const table of mealTables) {
          const tx = table.x;
          const ty = table.y;
          const cx = tx + (isCircular ? TABLE_RADIUS + 30 : TABLE_SIZE / 2 + 20);
          const cy = ty + (isCircular ? TABLE_RADIUS + 30 : TABLE_SIZE / 2 + 20);

          const slideX = 0.5 + cx * scaleX;
          const slideY = 0.7 + cy * scaleY;
          const tableR = TABLE_RADIUS * scaleX;
          const tableRY = TABLE_RADIUS * scaleY;

          if (isCircular) {
            if (table.shape === 'full') {
              slide.addShape(pptx.ShapeType.ellipse, {
                x: slideX - tableR, y: slideY - tableRY, w: tableR * 2, h: tableRY * 2,
                fill: { color: 'DBEAFE' }, line: { color: '93C5FD', width: 1 },
              });
            } else {
              slide.addShape(pptx.ShapeType.ellipse, {
                x: slideX - tableR, y: slideY - tableRY, w: tableR * 2, h: tableRY,
                fill: { color: 'DBEAFE' }, line: { color: '93C5FD', width: 1 },
              });
            }
          } else {
            const sqHalf = (TABLE_SIZE / 2) * scaleX;
            slide.addShape(pptx.ShapeType.rect, {
              x: slideX - sqHalf, y: slideY - sqHalf, w: sqHalf * 2, h: sqHalf * 2,
              fill: { color: 'DBEAFE' }, line: { color: '93C5FD', width: 1 },
              rectRadius: 0.05,
            });
          }

          slide.addText(`${table.tableNumber}`, {
            x: slideX - 0.12, y: slideY - 0.1, w: 0.24, h: 0.2,
            fontSize: 8, bold: true, color: '1e40af', align: 'center', fontFace: 'Calibri',
          });

          const seatPositions = isCircular
            ? getSeatPositionsCircular(cx, cy, SEAT_RADIUS, spt, table.shape as 'full' | 'half')
            : getSquareSeatPositions(cx, cy, TABLE_SIZE, spt, table.shape as 'full' | 'half');

          for (let i = 0; i < seatPositions.length; i++) {
            const pos = seatPositions[i];
            const assignment = mealAssignments.find(a => a.tableId === table.id && a.seatPosition === i);
            const person = assignment ? attendeeMap.get(assignment.attendeeId) : null;
            const color = person ? (roleColors[person.role] ?? '3b82f6') : 'CBD5E1';
            const seatX = 0.5 + pos.x * scaleX;
            const seatY = 0.7 + pos.y * scaleY;
            const seatR = 0.14;

            slide.addShape(pptx.ShapeType.ellipse, {
              x: seatX - seatR, y: seatY - seatR, w: seatR * 2, h: seatR * 2,
              fill: { color }, line: { color: 'FFFFFF', width: 1 },
            });

            if (person) {
              const inits = person.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
              slide.addText(inits, {
                x: seatX - seatR, y: seatY - seatR, w: seatR * 2, h: seatR * 2,
                fontSize: 5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
                fontFace: 'Calibri',
              });
            }
          }
        }

        // Legend
        let lx = 0.5;
        for (const item of [
          { label: 'Host', color: '9333ea' },
          { label: 'Floater', color: 'ea8033' },
          { label: 'Invitee', color: '3b82f6' },
          { label: 'Empty', color: 'CBD5E1' },
        ]) {
          slide.addShape(pptx.ShapeType.ellipse, {
            x: lx, y: SLIDE_H - 0.45, w: 0.12, h: 0.12,
            fill: { color: item.color }, line: { color: 'FFFFFF', width: 1 },
          });
          slide.addText(item.label, {
            x: lx + 0.16, y: SLIDE_H - 0.48, w: 0.7, h: 0.18,
            fontSize: 8, color: '475569', fontFace: 'Calibri',
          });
          lx += 0.9;
        }
      }

      // ── Seating list summary slides (one per meal) ──
      for (const [mealIdx, mealName] of mealFunctionNames.entries()) {
        const mealTables = allMealTables[mealIdx] ?? [];
        const mealConfig = allMealConfigs[mealIdx];
        const spt = mealConfig?.seatsPerTable ?? 10;
        const mealAssignments = allAssignments.filter(a => a.mealFunctionIndex === mealIdx);

        const slide = pptx.addSlide();
        slide.background = { color: 'FFFFFF' };
        slide.addText(`${mealName} — Seating List`, {
          x: 0.4, y: 0.15, w: SLIDE_W - 0.8, h: 0.45,
          fontSize: 20, bold: true, color: '1e293b', fontFace: 'Calibri',
        });

        const COLS = 4;
        const colW = (SLIDE_W - 0.8) / COLS;
        const startY = 0.7;
        const rowH = 0.18;

        for (const [ti, table] of [...mealTables].sort((a, b) => a.tableNumber - b.tableNumber).entries()) {
          const col = ti % COLS;
          const row = Math.floor(ti / COLS);
          const bx = 0.4 + col * colW;
          let by = startY + row * (rowH * (spt + 2));

          slide.addShape(pptx.ShapeType.rect, {
            x: bx, y: by, w: colW - 0.1, h: rowH,
            fill: { color: '1e40af' }, line: { color: '1e40af', width: 0 },
          });
          slide.addText(`Table ${table.tableNumber} (${table.shape})`, {
            x: bx, y: by, w: colW - 0.1, h: rowH,
            fontSize: 7, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri',
          });
          by += rowH;

          const tableAssignments = mealAssignments.filter(a => a.tableId === table.id)
            .sort((a, b) => a.seatPosition - b.seatPosition);

          const roleColorMap: Record<string, string> = { host: '9333ea', floater: 'ea8033', invitee: '3b82f6' };
          for (let s = 0; s < spt; s++) {
            const a = tableAssignments.find(x => x.seatPosition === s);
            const person = a ? attendeeMap.get(a.attendeeId) : null;
            const dotColor = person ? (roleColorMap[person.role] ?? '3b82f6') : 'CBD5E1';

            slide.addShape(pptx.ShapeType.rect, {
              x: bx, y: by, w: colW - 0.1, h: rowH,
              fill: { color: s % 2 === 0 ? 'F8FAFC' : 'FFFFFF' }, line: { color: 'E2E8F0', width: 0.5 },
            });
            slide.addShape(pptx.ShapeType.ellipse, {
              x: bx + 0.03, y: by + 0.025, w: 0.09, h: 0.09,
              fill: { color: dotColor }, line: { color: 'FFFFFF', width: 0.5 },
            });
            slide.addText(`S${s + 1} ${person ? person.name : '—'}`, {
              x: bx + 0.14, y: by, w: colW - 0.25, h: rowH,
              fontSize: 6, color: person ? '1e293b' : '94a3b8',
              fontFace: 'Calibri', valign: 'middle',
            });
            by += rowH;
          }
        }
      }

      await pptx.writeFile({ fileName: `${event.name.replace(/\s+/g, '_')}_seating.pptx` });
      toast({ title: 'PPTX exported successfully' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Export failed', description: String(err), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  // Summary stats for active meal (meal 0 by default in this panel)
  const totalSeats = tables.length * (allMealConfigs[0]?.seatsPerTable ?? 10);
  const assigned0 = allAssignments.filter(a => a.mealFunctionIndex === 0).length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Summary</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Tables', value: tables.length },
            { label: 'Total Seats', value: totalSeats },
            { label: 'Attendees', value: attendees.length },
            { label: 'Assigned', value: assigned0 },
          ].map(stat => (
            <div key={stat.label} className="bg-muted/50 rounded p-2 text-center">
              <p className="text-lg font-bold">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Export</h3>
        <div className="space-y-2">
          <Button className="w-full h-9 justify-start gap-2 text-xs" variant="outline"
            onClick={exportCSV} data-testid="button-export-csv">
            <FileText className="w-4 h-4" />
            <div className="text-left">
              <div className="font-medium">Export as CSV</div>
              <div className="text-[10px] text-muted-foreground">All meal functions, table + seat assignments</div>
            </div>
          </Button>

          <Button className="w-full h-9 justify-start gap-2 text-xs" variant="outline"
            onClick={exportPPTX} disabled={exporting} data-testid="button-export-pptx">
            <Presentation className="w-4 h-4" />
            <div className="text-left">
              <div className="font-medium">{exporting ? 'Generating...' : 'Export as PPTX'}</div>
              <div className="text-[10px] text-muted-foreground">One floor plan + seating list per meal function</div>
            </div>
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Role Guide</h3>
        <div className="space-y-1.5">
          {[
            { color: 'var(--host-color)', label: 'Host', desc: 'Fixed to their table — does not move between meals' },
            { color: 'var(--floater-color)', label: 'Floater', desc: 'Moves across tables each meal function' },
            { color: 'var(--invitee-color)', label: 'Invitee', desc: 'Regular guest — can be shuffled freely' },
          ].map(r => (
            <div key={r.label} className="flex gap-2 items-start">
              <div className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0" style={{ background: r.color }} />
              <div>
                <span className="text-xs font-medium">{r.label}</span>
                <p className="text-[10px] text-muted-foreground">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
