/**
 * MC-03 — Allegation register.
 *
 * A complaint is investigated as a set of discrete allegations, each with its
 * own jurisdiction scope, evidence links and assessment outcome. Outcome
 * readiness requires every in-scope allegation to carry an outcome, so this
 * register is the substantive investigation record.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Gavel, Loader2, Plus, ShieldQuestion } from 'lucide-react';
import { SectionState } from '@/components/complaints/DataState';
import {
  investigationOps,
  useInvestigationMutation,
  type Allegation,
  type InvestigationWorkspace,
} from '@/hooks/useComplaintInvestigation';

interface Props { complaintId: string; workspace: InvestigationWorkspace }

const OUTCOMES = [
  { value: 'SUBSTANTIATED', label: 'Substantiated' },
  { value: 'PARTIALLY_SUBSTANTIATED', label: 'Partially substantiated' },
  { value: 'NOT_SUBSTANTIATED', label: 'Not substantiated' },
  { value: 'UNABLE_TO_DETERMINE', label: 'Unable to determine' },
];

const WORK_STATES = [
  { value: 'EVIDENCE_GATHERING', label: 'Gathering evidence' },
  { value: 'ASSESSMENT_IN_PROGRESS', label: 'Assessment in progress' },
];

const SCOPES = [
  { value: 'IN_SCOPE', label: 'Within our remit' },
  { value: 'OUT_OF_SCOPE', label: 'Outside our remit' },
  { value: 'UNDETERMINED', label: 'Not yet determined' },
];

const STATUS_LABEL: Record<string, string> = {
  UNASSESSED: 'Not yet assessed',
  EVIDENCE_GATHERING: 'Gathering evidence',
  ASSESSMENT_IN_PROGRESS: 'Assessment in progress',
  ASSESSED: 'Assessed',
  REOPENED: 'Reopened',
};

const OUTCOME_LABEL: Record<string, string> = Object.fromEntries(OUTCOMES.map((o) => [o.value, o.label]));

export function AllegationsRegister({ complaintId, workspace }: Props) {
  const { allegations, capabilities } = workspace;
  const canManage = capabilities.can_manage_allegations;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    title: '', statement: '', issue_category_label: '', product_service: '',
    incident_from: '', incident_to: '', financial_amount: '', affected_party: '',
    jurisdiction_scope: 'IN_SCOPE', jurisdiction_rationale: '',
  });

  const createMut = useInvestigationMutation(complaintId, () =>
    investigationOps.allegationCreate(complaintId, draft),
  );
  const statusMut = useInvestigationMutation(complaintId, (a: { id: string; status: string; rv: number }) =>
    investigationOps.allegationSetStatus(a.id, a.status, null, a.rv),
  );
  const outcomeMut = useInvestigationMutation(
    complaintId,
    (a: { id: string; outcome: string; rationale: string; analysis: string | null; rv: number }) =>
      investigationOps.allegationRecordOutcome(a.id, a.outcome, a.rationale, a.analysis, a.rv),
  );
  const reopenMut = useInvestigationMutation(complaintId, (a: { id: string; reason: string; rv: number }) =>
    investigationOps.allegationReopen(a.id, a.reason, a.rv),
  );
  const updateMut = useInvestigationMutation(
    complaintId,
    (a: { id: string; payload: Record<string, unknown>; rv: number }) =>
      investigationOps.allegationUpdate(a.id, a.payload, a.rv),
  );

  const run = async (p: Promise<unknown>, ok: string) => {
    try { await p; toast.success(ok); } catch (e: any) { toast.error(e?.message ?? 'That could not be saved'); }
  };

  const assessed = allegations.filter((a) => a.assessment_outcome).length;
  const inScope = allegations.filter((a) => a.jurisdiction_scope === 'IN_SCOPE').length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Gavel className="h-4 w-4" />Allegations</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Each allegation is investigated and assessed separately. {assessed} of {allegations.length} assessed
              {allegations.length > 0 && ` · ${inScope} within our remit`}.
            </p>
          </div>
          {canManage && (
            <Button size="sm" variant={adding ? 'outline' : 'default'} onClick={() => setAdding((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" />{adding ? 'Cancel' : 'Add allegation'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {adding && canManage && (
            <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="al-title" className="text-xs">Short title</Label>
                <Input id="al-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="al-statement" className="text-xs">What is alleged</Label>
                <Textarea id="al-statement" rows={3} value={draft.statement} onChange={(e) => setDraft({ ...draft, statement: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="al-cat" className="text-xs">Issue category</Label>
                <Input id="al-cat" value={draft.issue_category_label} onChange={(e) => setDraft({ ...draft, issue_category_label: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="al-prod" className="text-xs">Product or service</Label>
                <Input id="al-prod" value={draft.product_service} onChange={(e) => setDraft({ ...draft, product_service: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="al-from" className="text-xs">Incident from</Label>
                <Input id="al-from" type="date" value={draft.incident_from} onChange={(e) => setDraft({ ...draft, incident_from: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="al-to" className="text-xs">Incident to</Label>
                <Input id="al-to" type="date" value={draft.incident_to} onChange={(e) => setDraft({ ...draft, incident_to: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="al-amt" className="text-xs">Amount in dispute</Label>
                <Input id="al-amt" inputMode="decimal" value={draft.financial_amount} onChange={(e) => setDraft({ ...draft, financial_amount: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="al-party" className="text-xs">Affected party</Label>
                <Input id="al-party" value={draft.affected_party} onChange={(e) => setDraft({ ...draft, affected_party: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Jurisdiction scope</Label>
                <Select value={draft.jurisdiction_scope} onValueChange={(v) => setDraft({ ...draft, jurisdiction_scope: v })}>
                  <SelectTrigger aria-label="Jurisdiction scope"><SelectValue /></SelectTrigger>
                  <SelectContent>{SCOPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="al-rat" className="text-xs">Scope rationale</Label>
                <Input id="al-rat" value={draft.jurisdiction_rationale} onChange={(e) => setDraft({ ...draft, jurisdiction_rationale: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Button
                  data-rbac="complaint_management.investigate"
                  size="sm"
                  disabled={createMut.isPending}
                  onClick={async () => {
                    await run(createMut.mutateAsync(undefined as never), 'Allegation recorded');
                    setAdding(false);
                    setDraft({
                      title: '', statement: '', issue_category_label: '', product_service: '',
                      incident_from: '', incident_to: '', financial_amount: '', affected_party: '',
                      jurisdiction_scope: 'IN_SCOPE', jurisdiction_rationale: '',
                    });
                  }}
                >
                  {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Record allegation
                </Button>
              </div>
            </div>
          )}

          <SectionState
            isLoading={false}
            isError={false}
            isEmpty={allegations.length === 0}
            noun="allegations"
            emptyText="No allegations have been recorded yet. The case cannot go to outcome review without at least one."
          >
            <ul className="space-y-3">
              {allegations.map((a) => (
                <AllegationRow
                  key={a.id}
                  allegation={a}
                  canManage={canManage}
                  onSetStatus={(status) => run(statusMut.mutateAsync({ id: a.id, status, rv: a.row_version }), 'Allegation updated')}
                  onOutcome={(outcome, rationale, analysis) =>
                    run(outcomeMut.mutateAsync({ id: a.id, outcome, rationale, analysis, rv: a.row_version }), 'Assessment recorded')}
                  onReopen={(reason) => run(reopenMut.mutateAsync({ id: a.id, reason, rv: a.row_version }), 'Allegation reopened')}
                  onScope={(scope, rationale) =>
                    run(updateMut.mutateAsync({
                      id: a.id,
                      payload: { jurisdiction_scope: scope, jurisdiction_rationale: rationale },
                      rv: a.row_version,
                    }), 'Scope updated')}
                />
              ))}
            </ul>
          </SectionState>
        </CardContent>
      </Card>
    </div>
  );
}

function AllegationRow({
  allegation: a, canManage, onSetStatus, onOutcome, onReopen, onScope,
}: {
  allegation: Allegation;
  canManage: boolean;
  onSetStatus: (status: string) => void;
  onOutcome: (outcome: string, rationale: string, analysis: string | null) => void;
  onReopen: (reason: string) => void;
  onScope: (scope: string, rationale: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState(a.assessment_outcome ?? '');
  const [rationale, setRationale] = useState(a.assessment_rationale ?? '');
  const [analysis, setAnalysis] = useState(a.officer_analysis ?? '');
  const [scope, setScope] = useState(a.jurisdiction_scope);
  const [scopeReason, setScopeReason] = useState(a.jurisdiction_rationale ?? '');

  const decided = Boolean(a.assessment_outcome);

  return (
    <li className="rounded-md border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-start justify-between gap-2 p-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">A{a.allegation_number}</Badge>
              <p className="font-medium text-sm">{a.title}</p>
              <Badge variant={decided ? 'default' : 'secondary'}>
                {decided ? OUTCOME_LABEL[a.assessment_outcome!] : STATUS_LABEL[a.investigation_status]}
              </Badge>
              {a.jurisdiction_scope !== 'IN_SCOPE' && (
                <Badge variant="outline" className="text-[10px]">
                  {SCOPES.find((s) => s.value === a.jurisdiction_scope)?.label}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {a.respondent_name ? `${a.respondent_name} · ` : ''}
              {a.evidence_count} evidence item{a.evidence_count === 1 ? '' : 's'}
              {a.supporting_count > 0 && ` · ${a.supporting_count} supporting`}
              {a.contradicting_count > 0 && ` · ${a.contradicting_count} contradicting`}
            </p>
          </div>
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Toggle allegation detail">
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="space-y-4 border-t p-3 text-sm">
            {a.statement && <p className="whitespace-pre-wrap">{a.statement}</p>}
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <span>Category: {a.issue_category_label || '—'}</span>
              <span>Product: {a.product_service || '—'}</span>
              <span>
                Amount: {a.financial_amount != null ? `${a.currency ?? ''} ${a.financial_amount}`.trim() : '—'}
              </span>
            </div>

            {canManage && (
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-xs font-medium flex items-center gap-1.5">
                  <ShieldQuestion className="h-3.5 w-3.5" />Jurisdiction scope for this allegation
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={scope} onValueChange={(v) => setScope(v as Allegation['jurisdiction_scope'])}>
                    <SelectTrigger aria-label="Allegation jurisdiction scope"><SelectValue /></SelectTrigger>
                    <SelectContent>{SCOPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input
                    aria-label="Scope rationale"
                    placeholder="Rationale"
                    value={scopeReason}
                    onChange={(e) => setScopeReason(e.target.value)}
                  />
                </div>
                <Button
                  data-rbac="complaint_management.investigate"
                  size="sm"
                  variant="outline"
                  onClick={() => onScope(scope, scopeReason)}
                >
                  Save scope
                </Button>
              </div>
            )}

            {canManage && !decided && (
              <div className="flex flex-wrap gap-2">
                {WORK_STATES.filter((w) => w.value !== a.investigation_status).map((w) => (
                  <Button
                    data-rbac="complaint_management.investigate"
                    key={w.value}
                    size="sm"
                    variant="ghost"
                    onClick={() => onSetStatus(w.value)}
                  >
                    {w.label}
                  </Button>
                ))}
              </div>
            )}

            {canManage && !decided && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-medium">Record the assessment</p>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger aria-label="Assessment outcome"><SelectValue placeholder="Choose the outcome" /></SelectTrigger>
                  <SelectContent>{OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                <Textarea
                  aria-label="Assessment rationale"
                  rows={3}
                  placeholder="Rationale — why the evidence supports this outcome"
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                />
                <Textarea
                  aria-label="Officer analysis"
                  rows={3}
                  placeholder="Officer analysis (optional)"
                  value={analysis}
                  onChange={(e) => setAnalysis(e.target.value)}
                />
                <Button
                  data-rbac="complaint_management.investigate"
                  size="sm"
                  disabled={!outcome || rationale.trim().length < 10}
                  onClick={() => onOutcome(outcome, rationale.trim(), analysis.trim() || null)}
                >
                  Record assessment
                </Button>
              </div>
            )}

            {decided && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-medium">Assessment of record</p>
                <p className="text-sm">{OUTCOME_LABEL[a.assessment_outcome!]}</p>
                {a.assessment_rationale && <p className="text-xs whitespace-pre-wrap">{a.assessment_rationale}</p>}
                {a.officer_analysis && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{a.officer_analysis}</p>
                )}
                {canManage && (
                  <Button
                    data-rbac="complaint_management.investigate"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const res = await Swal.fire({
                        title: 'Reopen this allegation?',
                        input: 'textarea',
                        inputLabel: 'Why is it being reopened?',
                        inputValidator: (v) => (String(v ?? '').trim().length < 10 ? 'Give at least 10 characters' : undefined),
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Reopen',
                      });
                      if (res.isConfirmed) onReopen(String(res.value).trim());
                    }}
                  >
                    Reopen allegation
                  </Button>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export default AllegationsRegister;
