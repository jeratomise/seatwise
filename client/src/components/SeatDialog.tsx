import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Attendee, SeatAssignment, Table } from '@shared/schema';
import { X, Search } from 'lucide-react';

interface Props {
  tableId: number;
  seatPos: number;
  eventId: number;
  activeMeal: number;
  attendees: Attendee[];
  assignments: SeatAssignment[];
  tables: Table[];
  onClose: () => void;
}

function roleColor(role: string) {
  if (role === 'host') return '#9333ea';
  if (role === 'floater') return '#ea8033';
  return '#3b82f6';
}

function roleBadge(role: string) {
  const colors: Record<string, string> = {
    host: 'bg-purple-100 text-purple-700',
    floater: 'bg-orange-100 text-orange-700',
    invitee: 'bg-blue-100 text-blue-700',
  };
  return colors[role] ?? 'bg-gray-100 text-gray-700';
}

export default function SeatDialog({ tableId, seatPos, eventId, activeMeal, attendees, assignments, tables, onClose }: Props) {
  const [search, setSearch] = useState('');

  // Find current assignment for this seat
  const currentAssignment = assignments.find(a => a.tableId === tableId && a.seatPosition === seatPos);
  const currentAttendee = currentAssignment ? attendees.find(a => a.id === currentAssignment.attendeeId) : null;

  // Find which attendees are already assigned in this meal
  const assignedIds = new Set(assignments.map(a => a.attendeeId));

  const table = tables.find(t => t.id === tableId);

  const saveMutation = useMutation({
    mutationFn: async (attendeeId: number | null) => {
      if (attendeeId === null) {
        // Clear seat
        if (currentAssignment) {
          await apiRequest('DELETE', `/api/assignments/${currentAssignment.id}`);
        }
      } else {
        // Remove existing assignment for this attendee if any
        const existingForAttendee = assignments.find(a => a.attendeeId === attendeeId);
        if (existingForAttendee) {
          await apiRequest('DELETE', `/api/assignments/${existingForAttendee.id}`);
        }
        if (currentAssignment) {
          // Update existing
          await apiRequest('PATCH', `/api/assignments/${currentAssignment.id}`, { attendeeId });
        } else {
          // Create new
          await apiRequest('POST', `/api/events/${eventId}/assignments/bulk`, {
            mealFunctionIndex: activeMeal,
            assignments: [{
              eventId,
              mealFunctionIndex: activeMeal,
              tableId,
              attendeeId,
              seatPosition: seatPos,
            }],
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'assignments'] });
      onClose();
    },
  });

  const filtered = attendees.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.company ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-card border rounded-xl shadow-2xl w-96 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        data-testid="seat-dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="font-semibold text-sm">Assign Seat</h3>
            <p className="text-xs text-muted-foreground">Table {table?.tableNumber} · Seat {seatPos + 1}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Current assignment */}
        {currentAttendee && (
          <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: roleColor(currentAttendee.role) }}>
                {currentAttendee.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-semibold">{currentAttendee.name}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadge(currentAttendee.role)}`}>
                  {currentAttendee.role}
                </span>
              </div>
            </div>
            <Button variant="destructive" size="sm" className="h-6 text-xs"
              onClick={() => saveMutation.mutate(null)}
              disabled={saveMutation.isPending}>
              Remove
            </Button>
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              data-testid="input-seat-search"
              className="pl-8 h-7 text-xs"
              placeholder="Search attendees..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Attendee list */}
        <div className="overflow-y-auto flex-1 p-2">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-6">No attendees found</p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map(person => {
                const isCurrentSeat = currentAssignment?.attendeeId === person.id;
                const isElsewhere = !isCurrentSeat && assignedIds.has(person.id);
                const elseAssignment = assignments.find(a => a.attendeeId === person.id && !isCurrentSeat);
                const elseTable = elseAssignment ? tables.find(t => t.id === elseAssignment.tableId) : null;

                return (
                  <button
                    key={person.id}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-muted transition-colors ${isCurrentSeat ? 'bg-accent' : ''}`}
                    onClick={() => !saveMutation.isPending && saveMutation.mutate(person.id)}
                    disabled={saveMutation.isPending}
                    data-testid={`attendee-option-${person.id}`}
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: roleColor(person.role) }}>
                      {person.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium truncate">{person.name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${roleBadge(person.role)}`}>
                          {person.role}
                        </span>
                      </div>
                      {(person.company || isElsewhere) && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {person.company && <span>{person.company}</span>}
                          {isElsewhere && <span className="text-orange-500 ml-1">→ T{elseTable?.tableNumber ?? '?'} S{(elseAssignment?.seatPosition ?? 0) + 1}</span>}
                        </p>
                      )}
                    </div>
                    {isCurrentSeat && (
                      <span className="text-[10px] text-primary font-semibold">Current</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
