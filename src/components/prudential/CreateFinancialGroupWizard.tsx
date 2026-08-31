import { useMemo, useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ROLE_LABEL, TREATMENT_LABEL } from '@/lib/groupConsolidation';
import { useSectors, useStaffDirectory } from '@/hooks/useOperatingStructure';
import { useCreateFinancialGroup, useGroupEntityOptions, type StagedGroupMember } from '@/hooks/useFinancialGroups';
import { GroupMemberFields, type MemberFormValue } from '@/components/prudential/GroupMemberFields';
import { MethodologyRulesEditor, DEFAULT_METHODOLOGY, type MethodologyValue } from '@/components/prudential/MethodologyRulesEditor';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (groupId: string) => void;
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABEL: Record<Step, string> = {
  1: 'Group details',
  2: 'Group structure',
  3: 'Consolidation methodology',
  4: 'Review & create',
};

/** Guided creation of a supervised financial group with its structure and methodology. */
export function CreateFinancialGroupWizard({ open, onOpenChange, onCreated }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [master, setMaster] = useState({
    group_code: '', name: '', holding_entity_id: '', sector_id: '',
    supervisory_lead_id: '', status: 'active', notes: '',
  });
  const [members, setMembers] = useState<MemberFormValue[]>([]);
  const [draft, setDraft] = useState<MemberFormValue | null>(null);
  const [draftIssue, setDraftIssue] = useState<string | null>(null);
  const [draftIndex, setDraftIndex] = useState<number | null>(null);
  const [methodology, setMethodology] = useState<MethodologyValue>(DEFAULT_METHODOLOGY);

  const { data: entities = [] } = useGroupEntityOptions();
  const { data: sectors = [] } = useSectors();
  const { data: staff = [] } = useStaffDirectory();
  const create = useCreateFinancialGroup();

  const entityName = (id?: string | null) => entities.find((e) => e.id === id)?.name ?? '—';

  const parentOptions = useMemo(
    () => members
      .map((m, i) => ({ value: String(i), label: entityName(m.licensee_id), licensee_id: m.licensee_id ?? null }))
      .filter((_, i) => draftIndex == null || i !== draftIndex),
    [members, entities, draftIndex],
  );

  const holdingStaged = members.some((m) => m.member_role === 'ultimate_holding');
  const masterIssue = !master.group_code.trim()
    ? 'Enter a group code.'
    : !master.name.trim() ? 'Enter a group name.' : null;

  const reset = () => {
    setStep(1);
    setMaster({ group_code: '', name: '', holding_entity_id: '', sector_id: '', supervisory_lead_id: '', status: 'active', notes: '' });
    setMembers([]); setDraft(null); setDraftIndex(null); setMethodology(DEFAULT_METHODOLOGY);
  };

  const commitDraft = () => {
    if (!draft || draftIssue) return;
    setMembers((prev) => {
      if (draftIndex == null) return [...prev, draft];
      const next = [...prev]; next[draftIndex] = draft; return next;
    });
    setDraft(null); setDraftIndex(null);
  };

  const removeMember = (idx: number) => {
    setMembers((prev) => prev
      .filter((_, i) => i !== idx)
      .map((m) => ({
        ...m,
        parent_index: m.parent_index == null ? null
          : m.parent_index === idx ? null
          : m.parent_index > idx ? m.parent_index - 1 : m.parent_index,
      })));
  };

  const submit = async () => {
    const staged: StagedGroupMember[] = members.map((m) => ({
      licensee_id: m.licensee_id as string,
      member_role: m.member_role ?? 'subsidiary',
      consolidation_treatment: m.consolidation_treatment ?? 'full',
      ownership_percentage: m.ownership_percentage ?? null,
      effective_date: m.effective_date ?? null,
      end_date: m.end_date ?? null,
      exclusion_rationale: m.exclusion_rationale ?? null,
      ownership_variance_reason: m.ownership_variance_reason ?? null,
      ownership_variance_note: m.ownership_variance_note ?? null,
      parent_index: m.parent_index ?? null,
      notes: m.notes ?? null,
    }));
    const id = await create.mutateAsync({
      group_code: master.group_code.trim(),
      name: master.name.trim(),
      holding_entity_id: master.holding_entity_id || null,
      sector_id: master.sector_id || null,
      supervisory_lead_id: master.supervisory_lead_id || null,
      status: master.status,
      notes: master.notes.trim() || null,
      members: staged,
      methodology: {
        ratio_rules: methodology.ratio_rules,
        eliminate_exposure_types: methodology.eliminate_exposure_types,
        large_exposure_pct: methodology.large_exposure_pct,
        notes: methodology.notes || null,
      },
    });
    onOpenChange(false);
    reset();
    if (id) onCreated(id);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create financial group — step {step} of 4: {STEP_LABEL[step]}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <Badge key={s} variant={s === step ? 'default' : 'outline'} className="text-[11px]">
              {s}. {STEP_LABEL[s]}
            </Badge>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="group_code">Group code</Label>
                <Input id="group_code" value={master.group_code}
                  onChange={(e) => setMaster({ ...master, group_code: e.target.value })} placeholder="GRP-001" />
              </div>
              <div>
                <Label htmlFor="group_name">Group name</Label>
                <Input id="group_name" value={master.name}
                  onChange={(e) => setMaster({ ...master, name: e.target.value })} placeholder="Example Holdings Group" />
              </div>
            </div>
            <div>
              <Label>Ultimate holding entity</Label>
              <Select value={master.holding_entity_id || 'none'}
                onValueChange={(v) => setMaster({ ...master, holding_entity_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Select holding entity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not identified yet</SelectItem>
                  {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sector</Label>
                <Select value={master.sector_id || 'none'}
                  onValueChange={(v) => setMaster({ ...master, sector_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not assigned</SelectItem>
                    {(sectors as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Supervisory lead</Label>
                <Select value={master.supervisory_lead_id || 'none'}
                  onValueChange={(v) => setMaster({ ...master, supervisory_lead_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not assigned</SelectItem>
                    {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={master.status} onValueChange={(v) => setMaster({ ...master, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="dissolved">Dissolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="group_notes">Notes</Label>
              <Textarea id="group_notes" rows={3} value={master.notes}
                onChange={(e) => setMaster({ ...master, notes: e.target.value })} />
            </div>
            {masterIssue && <p className="text-xs text-destructive">{masterIssue}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {!members.length ? (
              <p className="text-sm text-muted-foreground">
                No members staged yet. A group is normally created with its ultimate holding company and
                its subsidiaries; members can also be added later from the group profile.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead className="text-right">Ownership</TableHead>
                    <TableHead>Treatment</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm font-medium">{entityName(m.licensee_id)}</TableCell>
                      <TableCell className="text-xs">{ROLE_LABEL[m.member_role ?? 'subsidiary'] ?? m.member_role}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.parent_index == null ? 'Top of group' : entityName(members[m.parent_index]?.licensee_id)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {m.ownership_percentage == null ? '—' : `${Number(m.ownership_percentage).toFixed(2)}%`}
                      </TableCell>
                      <TableCell className="text-xs">{TREATMENT_LABEL[m.consolidation_treatment ?? 'full']}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setDraft(m); setDraftIndex(i); }}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => removeMember(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {!draft ? (
              <Button size="sm" variant="outline" onClick={() => {
                setDraftIndex(null);
                setDraft({
                  member_role: holdingStaged ? 'subsidiary' : 'ultimate_holding',
                  consolidation_treatment: 'full',
                  parent_index: null,
                });
              }}>
                <Plus className="mr-2 h-4 w-4" />Add member
              </Button>
            ) : (
              <div className="rounded-md border border-border p-3">
                <GroupMemberFields
                  value={draft}
                  onChange={setDraft}
                  onIssueChange={setDraftIssue}
                  entities={entities}
                  parentOptions={parentOptions}
                  parentField="parent_index"
                />
                {draftIssue && <p className="mt-2 text-xs text-destructive">{draftIssue}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setDraft(null); setDraftIndex(null); }}>Cancel</Button>
                  <Button size="sm" onClick={commitDraft} disabled={!!draftIssue}>
                    <Check className="mr-2 h-4 w-4" />{draftIndex == null ? 'Stage member' : 'Update member'}
                  </Button>
                </div>
              </div>
            )}
            {members.length > 0 && !holdingStaged && (
              <p className="text-xs text-muted-foreground">
                No ultimate holding member is staged. Consolidation still works, but the structure will show
                multiple roots.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <MethodologyRulesEditor value={methodology} onChange={setMethodology} />
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">Group</p>
              <p className="font-medium">{master.name} <span className="font-mono text-xs">{master.group_code}</span></p>
              <p className="text-xs text-muted-foreground">
                Holding: {master.holding_entity_id ? entityName(master.holding_entity_id) : 'Not identified'} ·
                {' '}Sector: {(sectors as any[]).find((s) => s.id === master.sector_id)?.name ?? 'Not assigned'} ·
                {' '}Lead: {staff.find((s) => s.id === master.supervisory_lead_id)?.full_name ?? 'Not assigned'} ·
                {' '}Status: {master.status}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">Members ({members.length})</p>
              {!members.length ? (
                <p className="text-xs text-muted-foreground">None staged — add them later from the group profile.</p>
              ) : members.map((m, i) => (
                <p key={i} className="text-xs">
                  {entityName(m.licensee_id)} · {ROLE_LABEL[m.member_role ?? 'subsidiary']} ·
                  {' '}{m.ownership_percentage == null ? 'no %' : `${Number(m.ownership_percentage).toFixed(2)}%`} ·
                  {' '}{TREATMENT_LABEL[m.consolidation_treatment ?? 'full']}
                  {m.parent_index != null ? ` · under ${entityName(members[m.parent_index]?.licensee_id)}` : ''}
                </p>
              ))}
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">Methodology v1</p>
              <p className="text-xs">
                {methodology.ratio_rules.length} rule(s) · eliminating {methodology.eliminate_exposure_types.join(', ') || 'nothing'} ·
                {' '}large exposure threshold {methodology.large_exposure_pct}%
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Creation, structure and methodology are recorded in the prudential audit trail with your user and time.
            </p>
          </div>
        )}

        <DialogFooter className="justify-between">
          <Button variant="ghost" disabled={step === 1}
            onClick={() => setStep((s) => (s - 1) as Step)}>Back</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {step < 4 ? (
              <Button
                disabled={(step === 1 && !!masterIssue) || (step === 2 && !!draft)}
                onClick={() => setStep((s) => (s + 1) as Step)}
              >Next</Button>
            ) : (
              <Button data-rbac="prudential_supervision.create" onClick={submit} disabled={create.isPending || !!masterIssue}>
                {create.isPending ? 'Creating…' : 'Create group'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
