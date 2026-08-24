import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, ChevronDown, Loader2, Plus, Trash2, UserRound } from 'lucide-react';
import { TEAM_ROLES, useExaminationTeam, useTeamMutations } from '@/hooks/useExaminations';
import { useStaffProfiles } from '@/hooks/useOperatingStructure';
import { StageActions, type StageActionsMode } from './ExaminationStageActions';

const roleLabel = (r: string) => TEAM_ROLES.find(t => t.value === r)?.label ?? r.replace('_', ' ');

export function TeamPanel({ examinationId, readOnly, mode = 'supporting' }: { examinationId: string; readOnly?: boolean; mode?: StageActionsMode }) {
  const { data: rows = [], isLoading } = useExaminationTeam(examinationId);
  const { save, remove } = useTeamMutations(examinationId);
  const staff = useStaffProfiles();
  const [showForm, setShowForm] = useState(false);
  const [details, setDetails] = useState(false);
  const [form, setForm] = useState({
    user_id: '',
    team_role: 'examiner',
    allocated_days: '',
    specialisation: '',
    conflict_declared: false,
    conflict_notes: '',
  });

  /** Staff not already on this examination. Other duties never disqualify anyone. */
  const available = useMemo(() => {
    const taken = new Set((rows as any[]).map(r => r.user_id).filter(Boolean));
    return (staff.data || []).filter(s => !taken.has(s.id));
  }, [rows, staff.data]);

  const add = async () => {
    await save.mutateAsync({
      user_id: form.user_id,
      team_role: form.team_role,
      allocated_days: form.allocated_days ? Number(form.allocated_days) : null,
      specialisation: form.specialisation || null,
      conflict_declared: form.conflict_declared,
      conflict_notes: form.conflict_notes || null,
    });
    setForm({ user_id: '', team_role: 'examiner', allocated_days: '', specialisation: '', conflict_declared: false, conflict_notes: '' });
    setShowForm(false);
  };


  const lead = rows.find((r: any) => r.team_role === 'lead_examiner') as any;
  const others = rows.filter((r: any) => r.team_role !== 'lead_examiner');

  const openLeadForm = () => {
    setForm(f => ({ ...f, team_role: 'lead_examiner' }));
    setShowForm(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Examination team</CardTitle>
        <p className="text-xs text-muted-foreground">Who is leading this examination, and who else is participating.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Lead examiner */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Who is leading the examination?</p>
              {lead ? (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">{lead.member_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Lead examiner
                        {lead.allocated_days ? ` · ${lead.allocated_days} days allocated` : ''}
                        {lead.specialisation ? ` · ${lead.specialisation}` : ''}
                      </p>
                      {lead.conflict_declared && (
                        <p className="text-xs text-destructive">
                          Conflict declared{lead.conflict_notes ? `: ${lead.conflict_notes}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  {!readOnly && (
                    <Button data-rbac="prudential_supervision.edit" variant="ghost" size="sm" onClick={() => remove.mutate(lead.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="rounded-md border border-warning/30 bg-warning/10 p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-sm text-warning">
                    <AlertTriangle className="h-4 w-4" />A lead examiner is required before fieldwork can begin.
                  </p>
                  {!readOnly && (
                    <Button data-rbac="prudential_supervision.edit" size="sm" onClick={openLeadForm}>
                      <Plus className="h-4 w-4 mr-1" />Assign lead examiner
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Other members */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Who else is participating?</p>
              {others.length === 0 ? (
                <div className="rounded-md border p-4 text-center space-y-2">
                  <p className="text-sm font-medium">No other team members yet</p>
                  <p className="text-xs text-muted-foreground">
                    Add the examiners, reviewers and specialists who will work on this examination.
                  </p>
                  {!readOnly && (
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => setShowForm(true)}>
                      <Plus className="h-4 w-4 mr-1" />Add team member
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {others.map((r: any) => (
                    <div key={r.id} className="rounded-md border p-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{r.member_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {roleLabel(r.team_role)}
                          {r.allocated_days ? ` · ${r.allocated_days} days` : ''}
                          {r.specialisation ? ` · ${r.specialisation}` : ''}
                        </p>
                        {r.conflict_declared && (
                          <p className="text-xs text-destructive">
                            Conflict declared{r.conflict_notes ? `: ${r.conflict_notes}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!r.conflict_declared && <Badge variant="outline" className="text-xs">No conflict declared</Badge>}
                        {!readOnly && (
                          <Button data-rbac="prudential_supervision.edit" variant="ghost" size="sm" onClick={() => remove.mutate(r.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!readOnly && !showForm && (
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => setShowForm(true)}>
                      <Plus className="h-4 w-4 mr-1" />Add team member
                    </Button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {!readOnly && showForm && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="member_user">Staff member</Label>
                <Select value={form.user_id} onValueChange={v => setForm(f => ({ ...f, user_id: v }))}>
                  <SelectTrigger id="member_user">
                    <SelectValue placeholder={staff.isLoading ? 'Loading staff…' : 'Select a staff member'} />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only active internal staff can join a case team; people already on this examination are not listed.
                </p>
              </div>
              <div>
                <Label htmlFor="team_role">Role on this examination</Label>
                <Select value={form.team_role} onValueChange={v => setForm(f => ({ ...f, team_role: v }))}>
                  <SelectTrigger id="team_role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEAM_ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}
                        disabled={r.value === 'lead_examiner' && !!lead}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>


            <Collapsible open={details} onOpenChange={setDetails}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="px-0">
                  <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${details ? 'rotate-180' : ''}`} />
                  Additional details (optional)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="allocated_days">Days allocated</Label>
                    <Input id="allocated_days" type="number" value={form.allocated_days}
                      onChange={e => setForm(f => ({ ...f, allocated_days: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="specialisation">Specialisation</Label>
                    <Input id="specialisation" value={form.specialisation}
                      onChange={e => setForm(f => ({ ...f, specialisation: e.target.value }))} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="conflict" checked={form.conflict_declared}
                    onCheckedChange={v => setForm(f => ({ ...f, conflict_declared: !!v }))} />
                  <Label htmlFor="conflict" className="mb-0">Conflict of interest declared</Label>
                </div>
                {form.conflict_declared && (
                  <Textarea rows={2} placeholder="Conflict details" value={form.conflict_notes}
                    onChange={e => setForm(f => ({ ...f, conflict_notes: e.target.value }))} />
                )}
              </CollapsibleContent>
            </Collapsible>

            <div className="flex gap-2">
              <Button data-rbac="prudential_supervision.edit" size="sm" disabled={!form.user_id || save.isPending} onClick={add}>
                <Plus className="h-4 w-4 mr-1" />Add to team
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {!readOnly && <StageActions mode={mode} />}
      </CardContent>
    </Card>
  );
}
