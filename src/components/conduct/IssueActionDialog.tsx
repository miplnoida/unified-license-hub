/**
 * Issue Supervisory Action dialog — Market Conduct.
 * Creates a row in conduct_actions and dispatches conduct_action_created
 * so the assigned officer, supervisors, and legal/compliance receive
 * in-app + email notifications with rationale.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { conductActionIssue } from '@/lib/conductGovernedOps';
import { useEmployeeApprovers } from '@/hooks/useEmployeeApprovers';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const ACTION_TYPES = [
  { value: 'remediation_request', label: 'Remediation request' },
  { value: 'warning', label: 'Warning' },
  { value: 'sanction', label: 'Sanction' },
  { value: 'direction', label: 'Direction' },
  { value: 'undertaking', label: 'Undertaking' },
];

const SOURCE_MODULES = ['entity', 'complaint', 'thematic_review', 'monitoring', 'enforcement', 'other'];

export interface IssueActionDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEntityId?: string | null;
  defaultSourceModule?: string;
  defaultSourceId?: string | null;
  onCreated?: () => void;
}

export function IssueActionDialog({
  open, onOpenChange, defaultEntityId, defaultSourceModule = 'entity', defaultSourceId, onCreated,
}: IssueActionDialogProps) {
  const qc = useQueryClient();
  const [actionType, setActionType] = useState('remediation_request');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rationale, setRationale] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [assignedTeam, setAssignedTeam] = useState('');
  const [sourceModule, setSourceModule] = useState(defaultSourceModule);

  const { data: employees = [] } = useEmployeeApprovers();

  const reset = () => {
    setActionType('remediation_request'); setTitle(''); setDescription('');
    setRationale(''); setDueDate(''); setAssignedTo(''); setAssignedTeam('');
    setSourceModule(defaultSourceModule);
  };

  const createAction = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Title is required');
      if (!rationale.trim() || rationale.trim().length < 10) throw new Error('Rationale required (min 10 chars)');
      // Governed: created_by, status and the compliance audit row are server-side.
      return await conductActionIssue({
        source_module: sourceModule,
        source_id: defaultSourceId ?? null,
        entity_id: defaultEntityId ?? null,
        action_type: actionType,
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate || null,
        assigned_to: assignedTo || null,
        assigned_team: assignedTeam.trim() || null,
        rationale: rationale.trim(),
      });
    },

    onSuccess: () => {
      toast.success('Supervisory action issued');
      qc.invalidateQueries({ queryKey: ['conduct-actions'] });
      qc.invalidateQueries({ queryKey: ['entity-conduct_actions'] });
      reset();
      onOpenChange(false);
      onCreated?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Issue supervisory action</DialogTitle>
          <DialogDescription>Record a remediation request, warning, sanction or other conduct action with rationale. Notifications go to the assignee, supervisors and legal/compliance.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-1">
            <Label>Action type</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-1">
            <Label>Source</Label>
            <Select value={sourceModule} onValueChange={setSourceModule}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCE_MODULES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Restore misapplied fees to affected accounts" />
          </div>
          <div className="col-span-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="col-span-2">
            <Label>Rationale * <span className="text-xs text-muted-foreground">(recorded in audit; sent in notifications)</span></Label>
            <Textarea value={rationale} onChange={e => setRationale(e.target.value)} rows={3} placeholder="Regulatory basis, findings and expected outcome…" />
          </div>
          <div className="col-span-1">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div className="col-span-1">
            <Label>Assigned officer</Label>
            <Select value={assignedTo || 'none'} onValueChange={(v) => setAssignedTo(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {employees.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Assigned team (optional)</Label>
            <Input value={assignedTeam} onChange={e => setAssignedTeam(e.target.value)} placeholder="e.g. Market Conduct Supervision" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={createAction.isPending}>Cancel</Button>
          <Button data-rbac="market_conduct.issue_enforcement_action" onClick={() => createAction.mutate()} disabled={createAction.isPending}>
            {createAction.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Issue action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
