import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserCog } from 'lucide-react';
import { useState } from 'react';
import { UNITS, OFFICERS } from '@/pages/correspondence/seed';

export function AssignmentPanel({ unit, officer }: { unit: string; officer: string }) {
  const [u, setU] = useState(unit);
  const [o, setO] = useState(officer);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <UserCog className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Currently assigned:</span>
        <span className="font-medium">{unit}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-medium">{officer}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Reassign to unit</Label>
          <Select value={u} onValueChange={setU}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNITS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Officer</Label>
          <Select value={o} onValueChange={setO}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OFFICERS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button data-rbac="settings.edit" size="sm">Reassign</Button>
      </div>
    </div>
  );
}
