import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Event } from '@shared/schema';
import { Plus, Trash2, Save } from 'lucide-react';

interface Props { event: Event; eventId: number; }

export default function ConfigPanel({ event, eventId }: Props) {
  const { toast } = useToast();

  const [tableType, setTableType] = useState(event.tableType);
  const [seatsPerTable, setSeatsPerTable] = useState(event.seatsPerTable);
  const [mealNames, setMealNames] = useState<string[]>(() => {
    try { return JSON.parse(event.mealFunctionNames); } catch { return ['Meal Function 1']; }
  });

  useEffect(() => {
    setTableType(event.tableType);
    setSeatsPerTable(event.seatsPerTable);
    try { setMealNames(JSON.parse(event.mealFunctionNames)); } catch {}
  }, [event]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', `/api/events/${eventId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId] });
      toast({ title: 'Settings saved' });
    },
  });

  const save = () => {
    updateMutation.mutate({
      tableType,
      seatsPerTable: Number(seatsPerTable),
      mealFunctionCount: mealNames.length,
      mealFunctionNames: JSON.stringify(mealNames),
    });
  };

  const addMeal = () => setMealNames(prev => [...prev, `Meal Function ${prev.length + 1}`]);
  const removeMeal = (i: number) => setMealNames(prev => prev.filter((_, idx) => idx !== i));
  const updateMealName = (i: number, val: string) => setMealNames(prev => prev.map((n, idx) => idx === i ? val : n));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Table Settings</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Table Shape</Label>
            <Select value={tableType} onValueChange={setTableType}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-table-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="circular">Circular (round tables)</SelectItem>
                <SelectItem value="square">Square / Rectangular</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Seats per Table</Label>
            <div className="flex items-center gap-2">
              <Input
                data-testid="input-seats-per-table"
                type="number" min="2" max="30"
                value={seatsPerTable}
                onChange={e => setSeatsPerTable(Number(e.target.value))}
                className="h-8 text-xs w-20"
              />
              <span className="text-xs text-muted-foreground">seats</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Meal Functions</h3>
        <div className="space-y-2 mb-2">
          {mealNames.map((name, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
              <Input
                value={name}
                onChange={e => updateMealName(i, e.target.value)}
                className="h-7 text-xs flex-1"
                placeholder={`Function ${i + 1}`}
                data-testid={`input-meal-name-${i}`}
              />
              {mealNames.length > 1 && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => removeMeal(i)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs w-full" onClick={addMeal}
          data-testid="button-add-meal">
          <Plus className="w-3 h-3 mr-1" /> Add Meal Function
        </Button>
      </div>

      <div className="pt-2 border-t">
        <Button className="w-full h-8 text-xs" onClick={save} disabled={updateMutation.isPending}
          data-testid="button-save-config">
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
