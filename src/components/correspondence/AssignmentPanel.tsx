import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { UNITS, OFFICERS } from '@/pages/correspondence/seed';
import { useAssignCorrespondence } from '@/hooks/useCorrespondence';

export function AssignmentPanel({
  threadId,
  unit,
  officer,
}: {
  threadId: string;
  unit: string | null;
  officer: string | null;
}) {
  const [u, setU] = useState(unit ?? UNITS[0]);
  const [o, setO] = useState(officer ?? 'unassigned');
  const assign = useAssignCorrespondence(threadId);

  const save = async () => {
    try {
      await assign.mutateAsync({ thread_id: threadId, unit: u, officer: o === 'unassigned' ? null : o });
      toast.success('Assignment updated');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not update assignment');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <UserCog className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Currently assigned:</span>
        <span className="font-medium">{unit ?? 'Unassigned'}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-medium">{officer ?? 'No officer'}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Assign to unit</Label>
          <Select value={u} onValueChange={setU}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNITS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              {u && !UNITS.includes(u) && <SelectItem value={u}>{u}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Officer</Label>
          <Select value={o} onValueChange={setO}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">No officer</SelectItem>
              {OFFICERS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              {o !== 'unassigned' && !OFFICERS.includes(o) && <SelectItem value={o}>{o}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button data-rbac="settings.edit" size="sm" onClick={save} disabled={assign.isPending}>
          {assign.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save assignment
        </Button>
      </div>
    </div>
  );
}
