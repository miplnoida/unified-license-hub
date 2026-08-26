/**
 * MC-03 — Investigation plan (versioned).
 *
 * `objective` is the canonical singular column. The plan is DRAFT → SUBMITTED →
 * APPROVED; approval is what advances the canonical workflow to Investigation
 * casework, and an APPROVED plan can only be changed by creating a revision.
 * Every write goes through the governed plan RPCs.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Send } from 'lucide-react';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import {
  investigationOps,
  useInvestigationMutation,
  type InvestigationWorkspace,
} from '@/hooks/useComplaintInvestigation';
import type { CaseWorkSection } from '@/lib/complaintWorkflow';

interface Props {
  complaintId: string;
  workspace: InvestigationWorkspace;
  onOpenSection: (section: CaseWorkSection) => void;
}

const STATUS_META: Record<string, { label: string; variant: 'outline' | 'secondary' | 'default' }> = {
  DRAFT: { label: 'Draft', variant: 'outline' },
  SUBMITTED: { label: 'Submitted for approval', variant: 'secondary' },
  APPROVED: { label: 'Approved', variant: 'default' },
  SUPERSEDED: { label: 'Superseded', variant: 'outline' },
};

const FIELDS: Array<{ key: string; label: string; hint?: string; rows?: number }> = [
  { key: 'objective', label: 'Objective of the investigation', hint: 'What this investigation is to establish.', rows: 3 },
  { key: 'in_scope_summary', label: 'What is in scope', rows: 3 },
  { key: 'out_of_scope_summary', label: 'What is out of scope', rows: 2 },
  { key: 'approach', label: 'Approach and lines of enquiry', rows: 4 },
  { key: 'evidence_required', label: 'Evidence required', rows: 3 },
  { key: 'information_sources', label: 'Information sources', rows: 2 },
  { key: 'parties_to_contact', label: 'Parties to contact', rows: 2 },
  { key: 'dependencies', label: 'Dependencies', rows: 2 },
  { key: 'risks_constraints', label: 'Risks and constraints', rows: 2 },
  { key: 'policy_reference', label: 'Policy or legal reference', rows: 2 },
];

export function InvestigationPlanPanel({ complaintId, workspace, onOpenSection }: Props) {
  const { plan, plan_history: history, gate, capabilities } = workspace;
  const [form, setForm] = useState<Record<string, string>>({});
  const [plannedDate, setPlannedDate] = useState('');

  useEffect(() => {
    const next: Record<string, string> = {};
    FIELDS.forEach((f) => { next[f.key] = ((plan as any)?.[f.key] ?? '') as string; });
    setForm(next);
    setPlannedDate(plan?.planned_completion_date ?? '');
  }, [plan?.id, plan?.row_version]);

  const openMut = useInvestigationMutation(complaintId, () => investigationOps.investigationOpen(complaintId, {}));
  const saveMut = useInvestigationMutation(complaintId, () =>
    investigationOps.planSave(complaintId, { ...form, planned_completion_date: plannedDate }, plan?.row_version ?? null),
  );
  const submitMut = useInvestigationMutation(complaintId, () =>
    investigationOps.planSubmit(plan!.id, plan?.row_version ?? null),
  );
  const approveMut = useInvestigationMutation(complaintId, (note: string | null) =>
    investigationOps.planApprove(plan!.id, note, plan?.row_version ?? null),
  );
  const reviseMut = useInvestigationMutation(complaintId, (reason: string) =>
    investigationOps.planRevise(complaintId, reason),
  );

  const run = async (p: Promise<unknown>, ok: string) => {
    try { await p; toast.success(ok); } catch (e: any) { toast.error(e?.message ?? 'That could not be saved'); }
  };

  /* ------------------------------------------------------------- gate closed */
  if (!plan) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Investigation plan</CardTitle>
          <p className="text-xs text-muted-foreground">
            The investigation is opened once jurisdiction and triage are settled. Opening it creates the first plan
            version for you to complete.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!gate.ok && (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3 space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
                <AlertTriangle className="h-4 w-4" />Before the investigation can be opened
              </p>
              <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                {(gate.blockers ?? []).map((b, i) => <li key={i}>{b}</li>)}
              </ul>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onOpenSection('jurisdiction')}>
                  Jurisdiction<ArrowRight className="h-3 w-3 ml-1" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onOpenSection('triage')}>
                  Triage<ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          )}
          <Button
            data-rbac="complaint_management.investigate"
            disabled={!capabilities.can_start_investigation || openMut.isPending}
            onClick={() => run(openMut.mutateAsync(undefined as never), 'Investigation opened — plan version 1 created')}
          >
            {openMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Open the investigation
          </Button>
          {gate.ok && !capabilities.can_start_investigation && (
            <p className="text-xs text-muted-foreground">
              You do not hold investigation authority on this complaint.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const meta = STATUS_META[plan.status] ?? { label: plan.status, variant: 'outline' as const };
  const locked = plan.status === 'APPROVED' || plan.status === 'SUPERSEDED';
  const editable = capabilities.can_edit_plan && !locked;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base">Investigation plan</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Approving the plan is what moves the case into Investigation casework.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Version {plan.version}</Badge>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {plan.revision_reason && (
            <p className="rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              Revision reason: {plan.revision_reason}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.key === 'objective' ? 'lg:col-span-2' : ''}>
                <Label htmlFor={`plan-${f.key}`} className="text-xs">{f.label}</Label>
                {f.hint && <p className="text-[11px] text-muted-foreground mb-1">{f.hint}</p>}
                <Textarea
                  id={`plan-${f.key}`}
                  rows={f.rows ?? 2}
                  readOnly={!editable}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <Label htmlFor="plan-target" className="text-xs">Planned completion date</Label>
              <Input
                id="plan-target"
                type="date"
                readOnly={!editable}
                value={plannedDate ?? ''}
                onChange={(e) => setPlannedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {editable && (
              <Button
                data-rbac="complaint_management.investigate"
                size="sm"
                disabled={saveMut.isPending}
                onClick={() => run(saveMut.mutateAsync(undefined as never), 'Plan saved')}
              >
                {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save plan
              </Button>
            )}
            {editable && plan.status === 'DRAFT' && (
              <Button
                data-rbac="complaint_management.investigate"
                size="sm"
                variant="outline"
                disabled={submitMut.isPending}
                onClick={() => run(submitMut.mutateAsync(undefined as never), 'Plan submitted for approval')}
              >
                <Send className="h-3.5 w-3.5 mr-1" />Submit for approval
              </Button>
            )}
            {plan.status === 'SUBMITTED' && capabilities.can_approve_plan && (
              <Button
                data-rbac="complaint_management.approve"
                size="sm"
                disabled={approveMut.isPending}
                onClick={async () => {
                  const res = await Swal.fire({
                    title: 'Approve the investigation plan?',
                    text: 'The case moves into Investigation casework. Add an approval note if you wish.',
                    input: 'textarea',
                    inputPlaceholder: 'Approval note (optional)',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Approve plan',
                  });
                  if (!res.isConfirmed) return;
                  await run(approveMut.mutateAsync((res.value as string) || null), 'Plan approved');
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve plan
              </Button>
            )}
            {plan.status === 'APPROVED' && capabilities.can_edit_plan && (
              <Button
                data-rbac="complaint_management.investigate"
                size="sm"
                variant="outline"
                disabled={reviseMut.isPending}
                onClick={async () => {
                  const res = await Swal.fire({
                    title: 'Revise the approved plan?',
                    text: 'The approved version is kept and superseded. A new draft version is created.',
                    input: 'textarea',
                    inputLabel: 'Why is a revision needed?',
                    inputValidator: (v) => (String(v ?? '').trim().length < 10 ? 'Give at least 10 characters' : undefined),
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Create revision',
                  });
                  if (!res.isConfirmed) return;
                  await run(reviseMut.mutateAsync(String(res.value).trim()), 'Revision created');
                }}
              >
                Create a revision
              </Button>
            )}
            {plan.approved_at && (
              <span className="text-xs text-muted-foreground">Approved {formatDateTime(plan.approved_at)}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {history.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Plan versions</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">v{h.version}</Badge>
                    <span>{STATUS_META[h.status]?.label ?? h.status}</span>
                    {h.revision_reason && <span className="text-xs text-muted-foreground">— {h.revision_reason}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {h.approved_at ? `Approved ${formatDateOnly(h.approved_at)}` : `Created ${formatDateOnly(h.created_at)}`}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default InvestigationPlanPanel;
