import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { TEAM_ROLES, useExaminationTeam, useTeamMutations } from '@/hooks/useExaminations';

export function TeamPanel({ examinationId, readOnly }: { examinationId: string; readOnly?: boolean }) {
  const { data: rows = [], isLoading } = useExaminationTeam(examinationId);
  const { save, remove } = useTeamMutations(examinationId);
  const [form, setForm] = useState({
    member_name: '',
    team_role: 'examiner',
    allocated_days: '',
    specialisation: '',
    conflict_declared: false,
    conflict_notes: '',
  });

  const add = async () => {
    await save.mutateAsync({
      member_name: form.member_name,
      team_role: form.team_role,
      allocated_days: form.allocated_days ? Number(form.allocated_days) : null,
      specialisation: form.specialisation || null,
      conflict_declared: form.conflict_declared,
      conflict_notes: form.conflict_notes || null,
    });
    setForm({ member_name: '', team_role: 'examiner', allocated_days: '', specialisation: '', conflict_declared: false, conflict_notes: '' });
  };

  const hasLead = rows.some((r: any) => r.team_role === 'lead_examiner');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Examination team</CardTitle>
        <Badge variant="outline" className={hasLead ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : 'bg-warning/10 text-warning border-warning/20'}>
          {hasLead ? 'Lead examiner assigned' : 'No lead examiner'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members assigned yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Specialisation</TableHead>
                  <TableHead>Conflict</TableHead>
                  {!readOnly && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.member_name}</TableCell>
                    <TableCell className="capitalize">{r.team_role.replace('_', ' ')}</TableCell>
                    <TableCell className="text-right">{r.allocated_days ?? '—'}</TableCell>
                    <TableCell>{r.specialisation || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {r.conflict_declared ? (
                        <span className="text-destructive">Declared{r.conflict_notes ? `: ${r.conflict_notes}` : ''}</span>
                      ) : 'None declared'}
                    </TableCell>
                    {!readOnly && (
                      <TableCell className="text-right">
                        <Button data-rbac="prudential_supervision.edit" variant="ghost" size="sm"
                          onClick={() => remove.mutate(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!readOnly && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <Label>Member name</Label>
                <Input value={form.member_name} onChange={e => setForm(f => ({ ...f, member_name: e.target.value }))} />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={form.team_role} onValueChange={v => setForm(f => ({ ...f, team_role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEAM_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Allocated days</Label>
                <Input type="number" value={form.allocated_days} onChange={e => setForm(f => ({ ...f, allocated_days: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Specialisation</Label>
                <Input value={form.specialisation} onChange={e => setForm(f => ({ ...f, specialisation: e.target.value }))} />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Checkbox id="conflict" checked={form.conflict_declared}
                  onCheckedChange={v => setForm(f => ({ ...f, conflict_declared: !!v }))} />
                <Label htmlFor="conflict" className="mb-0">Conflict of interest declared</Label>
              </div>
            </div>
            {form.conflict_declared && (
              <Textarea rows={2} placeholder="Conflict details" value={form.conflict_notes}
                onChange={e => setForm(f => ({ ...f, conflict_notes: e.target.value }))} />
            )}
            <Button data-rbac="prudential_supervision.edit" size="sm" disabled={!form.member_name || save.isPending} onClick={add}>
              <Plus className="h-4 w-4 mr-1" />Add member
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
