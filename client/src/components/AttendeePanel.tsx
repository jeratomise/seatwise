import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Attendee, Table, SeatAssignment, MealConfig } from '@shared/schema';
import { Upload, Plus, Trash2, Shuffle, X, UserCheck } from 'lucide-react';
import Papa from 'papaparse';

interface Props {
  eventId: number;
  attendees: Attendee[];
  tables: Table[];
  assignments: SeatAssignment[];
  activeMeal: number;
  mealConfig?: MealConfig;
}

function roleColor(role: string) {
  if (role === 'host') return '#9333ea';
  if (role === 'floater') return '#ea8033';
  return '#3b82f6';
}
function roleBadge(role: string) {
  const m: Record<string, string> = {
    host: 'bg-purple-100 text-purple-700',
    floater: 'bg-orange-100 text-orange-700',
    invitee: 'bg-blue-100 text-blue-700',
  };
  return m[role] ?? '';
}

export default function AttendeePanel({ eventId, attendees, tables, assignments, activeMeal, mealConfig }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'invitee' | 'host' | 'floater'>('invitee');
  const [newCompany, setNewCompany] = useState('');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [colMap, setColMap] = useState({ name: '', role: '', company: '' });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/events/${eventId}/attendees`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'attendees'] });
      setNewName(''); setNewCompany('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/attendees/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'attendees'] }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      apiRequest('PATCH', `/api/attendees/${id}`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'attendees'] }),
  });

  const bulkImportMutation = useMutation({
    mutationFn: (list: any[]) => apiRequest('POST', `/api/events/${eventId}/attendees/bulk`, list),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'attendees'] });
      setShowImport(false);
      setCsvData([]); setCsvHeaders([]); setColMap({ name: '', role: '', company: '' });
      toast({ title: `Imported ${Array.isArray(data) ? data.length : '?'} attendees` });
    },
  });

  // Shuffle assignments
  const shuffleMutation = useMutation({
    mutationFn: async () => {
      if (tables.length === 0) throw new Error('No tables');

      const hosts = attendees.filter(a => a.role === 'host');
      const floaters = attendees.filter(a => a.role === 'floater');
      const others = attendees.filter(a => a.role === 'invitee');

      // Use mealConfig.seatsPerTable if available, otherwise fall back to API
      let spt = mealConfig?.seatsPerTable;
      if (!spt) {
        const mealConfigResp = await apiRequest('GET', `/api/events/${eventId}/meal-config?meal=${activeMeal}`);
        spt = mealConfigResp.seatsPerTable ?? 10;
      }

      // Build table slots
      const slots: { tableId: number; seat: number }[] = [];
      for (const t of tables) {
        for (let s = 0; s < spt; s++) {
          slots.push({ tableId: t.id, seat: s });
        }
      }

      // Fix hosts at their current seat or slot 0 of each table
      const newAssignments: any[] = [];
      const usedSlots = new Set<string>();

      // Place hosts: one per table, seat 0
      let hostIdx = 0;
      for (const t of tables) {
        if (hostIdx < hosts.length) {
          newAssignments.push({
            eventId, mealFunctionIndex: activeMeal,
            tableId: t.id, attendeeId: hosts[hostIdx].id, seatPosition: 0,
          });
          usedSlots.add(`${t.id}-0`);
          hostIdx++;
        }
      }
      // Remaining hosts as invitees
      while (hostIdx < hosts.length) {
        const freeSlot = slots.find(s => !usedSlots.has(`${s.tableId}-${s.seat}`));
        if (!freeSlot) break;
        newAssignments.push({ eventId, mealFunctionIndex: activeMeal, tableId: freeSlot.tableId, attendeeId: hosts[hostIdx].id, seatPosition: freeSlot.seat });
        usedSlots.add(`${freeSlot.tableId}-${freeSlot.seat}`);
        hostIdx++;
      }

      // Distribute floaters evenly across tables
      const shuffledFloaters = [...floaters].sort(() => Math.random() - 0.5);
      for (let i = 0; i < shuffledFloaters.length; i++) {
        const t = tables[i % tables.length];
        const slot = slots.find(s => s.tableId === t.id && !usedSlots.has(`${s.tableId}-${s.seat}`));
        if (slot) {
          newAssignments.push({ eventId, mealFunctionIndex: activeMeal, tableId: slot.tableId, attendeeId: shuffledFloaters[i].id, seatPosition: slot.seat });
          usedSlots.add(`${slot.tableId}-${slot.seat}`);
        }
      }

      // Distribute remaining invitees
      const shuffledOthers = [...others].sort(() => Math.random() - 0.5);
      for (const person of shuffledOthers) {
        const freeSlot = slots.find(s => !usedSlots.has(`${s.tableId}-${s.seat}`));
        if (!freeSlot) break;
        newAssignments.push({ eventId, mealFunctionIndex: activeMeal, tableId: freeSlot.tableId, attendeeId: person.id, seatPosition: freeSlot.seat });
        usedSlots.add(`${freeSlot.tableId}-${freeSlot.seat}`);
      }

      await apiRequest('POST', `/api/events/${eventId}/assignments/bulk`, {
        mealFunctionIndex: activeMeal,
        assignments: newAssignments,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'assignments', activeMeal] });
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'assignments'] });
      toast({ title: 'Seats shuffled', description: 'Hosts stay at table head, floaters distributed evenly.' });
    },
    onError: (e: any) => toast({ title: 'Shuffle failed', description: e.message, variant: 'destructive' }),
  });

  const clearAllAssignmentsMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/events/${eventId}/assignments?meal=${activeMeal}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'assignments', activeMeal] });
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'assignments'] });
      toast({ title: 'Assignments cleared' });
    },
  });

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (result) => {
        // Strip BOM from header names (﻿ character on first field)
        const rawFields = result.meta.fields ?? [];
        const fields = rawFields.map(f => f.replace(/^\uFEFF/, '').trim());
        // Rebuild data with cleaned keys
        const cleanData = (result.data as any[]).map(row => {
          const clean: any = {};
          rawFields.forEach((raw, i) => { clean[fields[i]] = row[raw]; });
          return clean;
        });
        // Filter out fully-empty rows
        const filtered = cleanData.filter(row => fields.some(f => (row[f] ?? '').toString().trim() !== ''));
        setCsvData(filtered);
        setCsvHeaders(fields);
        setShowImport(true);
        // Auto-detect columns
        const nameCol = fields.find(f => /full.?name|^name$/i.test(f)) ?? fields.find(f => /name/i.test(f)) ?? '';
        const roleCol = fields.find(f => /^type$/i.test(f)) ?? fields.find(f => /role|type/i.test(f)) ?? '';
        const compCol = fields.find(f => /company|org|country|region/i.test(f)) ?? '';
        setColMap({ name: nameCol, role: roleCol, company: compCol });
      },
    });
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

  // Maps any role-like string to host | floater | invitee
  function normalizeRole(raw: string): 'host' | 'floater' | 'invitee' {
    const v = raw.toLowerCase().trim();
    if (v === '') return 'invitee';
    if (v.includes('host')) return 'host';
    if (v.includes('floater') || v.includes('float')) return 'floater';
    if (v === 'host' || v === 'table host') return 'host';
    if (['host', 'floater', 'invitee', 'guest', 'attendee'].includes(v)) {
      return v === 'host' ? 'host' : v === 'floater' ? 'floater' : 'invitee';
    }
    return 'invitee';
  }

  const handleImportConfirm = () => {
    if (!colMap.name) return toast({ title: 'Select a Name column', variant: 'destructive' });
    const list = csvData
      .map(row => ({
        name: (row[colMap.name] ?? '').toString().trim(),
        role: normalizeRole(colMap.role ? (row[colMap.role] ?? '').toString() : ''),
        company: colMap.company ? (row[colMap.company] ?? '').toString().trim() : '',
        notes: '',
      }))
      .filter(r => r.name.length > 0);
    if (list.length === 0) return toast({ title: 'No valid rows found', variant: 'destructive' });
    bulkImportMutation.mutate(list);
  };

  const filteredAttendees = attendees.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.company ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const assignedIds = new Set(assignments.map(a => a.attendeeId));

  return (
    <div className="flex flex-col h-full">
      {/* Actions bar */}
      <div className="px-2 pb-2 space-y-1.5 flex-shrink-0">
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
            onClick={() => fileRef.current?.click()}>
            <Upload className="w-3 h-3 mr-1" /> CSV Import
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
            onClick={() => shuffleMutation.mutate()} disabled={shuffleMutation.isPending || tables.length === 0}>
            <Shuffle className="w-3 h-3 mr-1" /> Shuffle
          </Button>
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
        <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:text-destructive w-full"
          onClick={() => clearAllAssignmentsMutation.mutate()} disabled={clearAllAssignmentsMutation.isPending}>
          Clear All Assignments
        </Button>

        {/* Add attendee */}
        <div className="space-y-1 pt-1 border-t">
          <Input className="h-7 text-xs" placeholder="Name" value={newName}
            onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && newName.trim() && createMutation.mutate({ name: newName.trim(), role: newRole, company: newCompany })}
            data-testid="input-new-attendee-name" />
          <div className="flex gap-1">
            <Input className="h-7 text-xs flex-1" placeholder="Company (optional)" value={newCompany}
              onChange={e => setNewCompany(e.target.value)} />
            <Select value={newRole} onValueChange={v => setNewRole(v as any)}>
              <SelectTrigger className="h-7 text-xs w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invitee">Invitee</SelectItem>
                <SelectItem value="host">Host</SelectItem>
                <SelectItem value="floater">Floater</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="w-full h-7 text-xs" disabled={!newName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate({ name: newName.trim(), role: newRole, company: newCompany })}
            data-testid="button-add-attendee">
            <Plus className="w-3 h-3 mr-1" /> Add Attendee
          </Button>
        </div>

        <Input className="h-7 text-xs" placeholder="Search..." value={search}
          onChange={e => setSearch(e.target.value)} />

        <p className="text-[10px] text-muted-foreground">
          {attendees.length} attendees · {assignedIds.size} assigned
        </p>
      </div>

      {/* Attendee list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filteredAttendees.map(person => {
          const isAssigned = assignedIds.has(person.id);
          const seatA = assignments.find(a => a.attendeeId === person.id);
          const seatTable = seatA ? tables.find(t => t.id === seatA.tableId) : null;

          return (
            <div key={person.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted group"
              data-testid={`attendee-row-${person.id}`}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                style={{ background: roleColor(person.role) }}>
                {person.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-medium truncate">{person.name}</p>
                  {isAssigned && <UserCheck className="w-3 h-3 text-green-500 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-1">
                  <Select value={person.role}
                    onValueChange={v => updateRoleMutation.mutate({ id: person.id, role: v })}>
                    <SelectTrigger className="h-4 text-[10px] border-0 p-0 bg-transparent w-16 gap-0.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invitee">Invitee</SelectItem>
                      <SelectItem value="host">Host</SelectItem>
                      <SelectItem value="floater">Floater</SelectItem>
                    </SelectContent>
                  </Select>
                  {seatTable && <span className="text-[10px] text-muted-foreground">T{seatTable.tableNumber}·S{(seatA?.seatPosition ?? 0) + 1}</span>}
                </div>
              </div>
              <Button variant="ghost" size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive flex-shrink-0"
                onClick={() => deleteMutation.mutate(person.id)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* CSV Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border rounded-xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-sm">Import from CSV</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowImport(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              <p className="text-xs text-muted-foreground">{csvData.length} rows detected. Map columns below:</p>

              {(['name', 'role', 'company'] as const).map(field => (
                <div key={field} className="flex items-center gap-3">
                  <label className="text-xs font-medium capitalize w-20 flex-shrink-0">{field}:</label>
                  <Select value={colMap[field]} onValueChange={v => setColMap(prev => ({ ...prev, [field]: v }))}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder={`Select ${field} column`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— None —</SelectItem>
                      {csvHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <p className="font-medium mb-1">Role mapping (auto-detected):</p>
                <p>Any value containing <code>host</code> → Host &nbsp;·&nbsp; containing <code>floater</code> → Floater &nbsp;·&nbsp; everything else → Invitee</p>
                <p className="mt-1 text-[10px]">e.g. "Table Host (ANZ)", "Table Host (India)" → Host &nbsp;·&nbsp; "Floater" → Floater</p>
              </div>

              {/* Preview */}
              <div className="overflow-x-auto border rounded">
                <table className="text-[10px] w-full">
                  <thead className="bg-muted">
                    <tr>
                      {csvHeaders.map(h => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t">
                        {csvHeaders.map(h => <td key={h} className="px-2 py-1 truncate max-w-24">{row[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvData.length > 5 && <p className="px-2 py-1 text-[10px] text-muted-foreground">...and {csvData.length - 5} more rows</p>}
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t">
              <Button variant="outline" size="sm" className="flex-1 h-8" onClick={() => setShowImport(false)}>Cancel</Button>
              <Button size="sm" className="flex-1 h-8" onClick={handleImportConfirm} disabled={bulkImportMutation.isPending}>
                {bulkImportMutation.isPending ? 'Importing...' : `Import ${csvData.length} Rows`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
