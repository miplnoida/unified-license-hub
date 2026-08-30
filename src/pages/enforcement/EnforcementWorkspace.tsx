/**
 * EPR-03 — Enforcement Case Workspace (P11).
 *
 * One independent workspace for one enforcement case. Everything process-shaped
 * — stage, status, owner, priority, SLA, waiting-on, blockers, the permitted
 * transitions and their rationale/evidence/maker-checker rules — comes from
 * `enforcement_case()`. The browser only formats it.
 *
 * Rules honoured here:
 *  - the Enforcement lifecycle is its own: no complaint workflow panel, no
 *    `execute_complaint_workflow_action`, and the case works whether it was
 *    referred from a complaint, a prudential breach, an examination finding or
 *    any other source;
 *  - exactly one lifecycle controller: the **Current step** tab. Supporting tabs
 *    are read-only records of what the governed actions produced;
 *  - no free-choice status control anywhere on the screen;
 *  - every transition runs through `enforcement_case_action`, which owns
 *    authority, prerequisites, sequencing and the audit trail.
 */
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ArrowUpRight, Check, Circle, Gavel, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { CaseHeader } from '@/components/cases/CaseHeader';
import { CommunicationTimeline } from '@/components/notifications/CommunicationTimeline';
import { SupervisoryAiPanel } from '@/components/ai/SupervisoryAiPanel';
import { AiReportsTab } from '@/components/ai/report/AiReportsTab';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { ENFORCEMENT_SOURCE_LABEL, type EnforcementSourceKind } from '@/lib/enforcementProcessOps';
import {
  useEnforcementCase,
  useEnforcementCaseAction,
  type EnforcementAvailableAction,
} from '@/hooks/useEnforcementProcess';
import {
  PENALTY_CURRENCY_POLICY_LABELS,
  useEnforcementPenaltyCurrency,
  usePenaltyCurrencyOverride,
} from '@/hooks/useEnforcementPenaltyCurrency';


type SectionKey = 'current' | 'case' | 'evidence' | 'obligations' | 'appeals' | 'ai' | 'history';

const SECTION_LABEL: Record<SectionKey, string> = {
  current: 'Current step',
  case: 'Case overview',
  evidence: 'Notice & representations',
  obligations: 'Sanction & obligations',
  appeals: 'Appeals',
  ai: 'AI analysis',
  history: 'History',
};

/** Extra facts each governed action records. Labels only — the server validates. */
type FieldSpec = {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';
  options?: string[];
  required?: boolean;
  hint?: string;
};

const ACTION_FIELDS: Record<string, FieldSpec[]> = {
  BEGIN_ASSESSMENT: [
    { name: 'findings', label: 'Assessment findings', type: 'textarea', hint: 'What the evidence establishes.' },
    { name: 'legal_basis', label: 'Legal basis', type: 'text' },
    { name: 'severity', label: 'Severity', type: 'select', options: ['critical', 'high', 'medium', 'low'] },
  ],
  ISSUE_NOTICE: [
    { name: 'notice_reference', label: 'Notice reference', type: 'text', required: true },
    { name: 'notice_recipient', label: 'Notice recipient', type: 'text' },
    { name: 'notice_dispatch_method', label: 'Dispatch method', type: 'select', options: ['email', 'registered post', 'hand delivery', 'portal'] },
    { name: 'representation_deadline', label: 'Representation deadline', type: 'date', hint: 'Defaults to 21 days from issue.' },
    { name: 'legal_basis', label: 'Legal basis', type: 'text' },
    { name: 'findings', label: 'Findings relied on', type: 'textarea' },
  ],
  RECORD_REPRESENTATION: [
    { name: 'received_from', label: 'Received from', type: 'text' },
    { name: 'channel', label: 'Channel', type: 'select', options: ['email', 'letter', 'meeting', 'portal', 'legal counsel'] },
    { name: 'attachment_reference', label: 'Attachment reference', type: 'text' },
  ],
  MAKE_DECISION: [
    { name: 'decision_outcome', label: 'Decision outcome', type: 'select', required: true, options: ['breach_established', 'breach_partially_established', 'undertaking_accepted', 'no_breach'] },
    { name: 'legal_basis', label: 'Legal basis relied on', type: 'text' },
  ],
  CLOSE_NO_ACTION: [
    { name: 'decision_outcome', label: 'Decision outcome', type: 'select', required: true, options: ['no_breach', 'insufficient_evidence', 'remediated_voluntarily'] },
  ],
  IMPOSE_SANCTION: [
    { name: 'sanction_type', label: 'Sanction type', type: 'select', options: ['monetary_penalty', 'public_censure', 'condition_variation', 'suspension', 'revocation', 'undertaking'] },
    { name: 'sanction_detail', label: 'Sanction detail', type: 'textarea' },
    { name: 'penalty_amount', label: 'Monetary penalty', type: 'number' },
    // Currency is NOT captured here: it is resolved server-side from the
    // applicable regulator body's governed monetary configuration.

    { name: 'effective_date', label: 'Effective date', type: 'date' },
    { name: 'appeal_deadline', label: 'Appeal deadline', type: 'date' },
  ],
  ISSUE_DIRECTIVE: [
    { name: 'directive_detail', label: 'Directive', type: 'textarea' },
    { name: 'effective_date', label: 'Effective date', type: 'date' },
  ],
  RECORD_OBLIGATION: [
    { name: 'obligation', label: 'Obligation', type: 'text', required: true },
    { name: 'detail', label: 'Detail', type: 'textarea' },
    { name: 'deadline', label: 'Deadline', type: 'date' },
  ],
  REVIEW_REMEDIATION: [
    { name: 'non_compliant', label: 'Record as non-compliant', type: 'checkbox' },
  ],
  RECORD_PAYMENT: [
    { name: 'amount', label: 'Amount', type: 'number', required: true },
    { name: 'kind', label: 'Kind', type: 'select', options: ['payment', 'waiver'] },
    { name: 'payment_reference', label: 'Payment reference', type: 'text' },
    { name: 'paid_on', label: 'Received on', type: 'date' },
  ],
  LODGE_APPEAL: [
    { name: 'appellant', label: 'Appellant', type: 'text' },
    { name: 'review_body', label: 'Review body', type: 'text' },
    { name: 'lodged_at', label: 'Lodged on', type: 'date' },
  ],
  DECIDE_APPEAL: [
    { name: 'appeal_decision', label: 'Appeal decision', type: 'select', required: true, options: ['dismissed', 'allowed', 'allowed_in_part', 'remitted'] },
    { name: 'effect_on_action', label: 'Effect on the enforcement action', type: 'select', options: ['no change', 'sanction varied', 'sanction set aside', 'case remitted'] },
  ],
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children ?? '—'}</div>
    </div>
  );
}

export default function EnforcementWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const section = (params.get('section') as SectionKey) || 'current';

  const caseQuery = useEnforcementCase(id);
  const act = useEnforcementCaseAction(id);

  const [pending, setPending] = useState<EnforcementAvailableAction | null>(null);
  const [rationale, setRationale] = useState('');
  const [fields, setFields] = useState<Record<string, any>>({});

  const view = caseQuery.data ?? null;
  const kase = view?.case;
  const penaltyCurrency = useEnforcementPenaltyCurrency(kase?.entity_id);
  const currencyOverride = usePenaltyCurrencyOverride(id);
  const [overrideCurrency, setOverrideCurrency] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const blockers = view?.blockers ?? [];
  const actions = useMemo(() => view?.available_actions ?? [], [view?.available_actions]);

  const advancing = actions.filter((a) => a.advances_stage);
  const recording = actions.filter((a) => !a.advances_stage);

  const setSection = (next: SectionKey) => {
    const p = new URLSearchParams(params);
    p.set('section', next);
    setParams(p, { replace: true });
  };

  const openAction = (a: EnforcementAvailableAction) => {
    setPending(a);
    setRationale('');
    setFields({});
  };

  const run = async () => {
    if (!pending) return;
    const spec = ACTION_FIELDS[pending.action_code] ?? [];
    const missing = spec.find((f) => f.required && !String(fields[f.name] ?? '').trim());
    if (missing) { toast.error(`${missing.label} is required`); return; }
    try {
      const res = await act.mutateAsync({
        action: pending.action_code,
        payload: { ...fields, rationale: rationale.trim() },
      });
      toast.success(
        res.to_stage === res.from_stage
          ? 'Recorded on the case'
          : `Case moved to ${res.to_stage.replace(/_/g, ' ').toLowerCase()}`,
      );
      setPending(null);
      setSection('current');
    } catch (e: any) {
      toast.error(e?.message || 'The enforcement process refused this action');
    }
  };

  if (caseQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading enforcement case…
        </div>
      </DashboardLayout>
    );
  }

  if (!kase) {
    return (
      <DashboardLayout>
        <Card><CardContent className="space-y-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">This enforcement case is not available to you.</p>
          <Button variant="outline" asChild><Link to="/enforcement">Back to the enforcement queue</Link></Button>
        </CardContent></Card>
      </DashboardLayout>
    );
  }

  const currency = kase.penalty_currency ?? null;
  const outstanding = Math.max(
    Number(kase.penalty_amount ?? 0) - Number(kase.penalty_paid_amount ?? 0) - Number(kase.penalty_waived_amount ?? 0),
    0,
  );
  const sourceLabel = ENFORCEMENT_SOURCE_LABEL[(kase.source_kind ?? 'MANUAL_REFERRAL') as EnforcementSourceKind] ?? kase.source_kind;
  const nextAction = advancing.find((a) => a.permitted) ?? advancing[0] ?? null;
  const aiStaleness = {
    stage: kase.stage, status: kase.status, decision_at: kase.decision_at,
    notice_issued_at: kase.notice_issued_at, last_activity_at: kase.last_activity_at,
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" asChild>
            <Link to="/enforcement"><ArrowLeft className="mr-1 h-4 w-4" />Enforcement queue</Link>
          </Button>
          <HistoryButton entityType="enforcement_action" entityId={kase.id} title={`History — ${kase.case_number}`} />
        </div>

        <CaseHeader
          reference={kase.case_number}
          subject={kase.entity_name ?? 'Regulated entity'}
          subjectHref={kase.entity_href}
          caseType={kase.enforcement_type ?? undefined}
          stageLabel={kase.stage_label}
          statusLabel={(kase.status ?? '').replace(/_/g, ' ')}
          ownerName={kase.assigned_to_name}
          team={kase.assigned_team}
          priority={kase.priority}
          slaDueAt={kase.sla_due_at}
          slaState={kase.sla_state}
          waitingOn={kase.waiting_on}
          nextActionLabel={nextAction?.label ?? null}
          blockers={blockers}
          lastActivityAt={kase.last_activity_at}
          actions={
            <Badge variant="outline" className="text-[10px]">
              <Gavel className="mr-1 h-3 w-3" />{sourceLabel}
            </Badge>
          }
        />

        <Tabs value={section} onValueChange={(v) => setSection(v as SectionKey)}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            {(Object.keys(SECTION_LABEL) as SectionKey[]).map((k) => (
              <TabsTrigger key={k} value={k}>{SECTION_LABEL[k]}</TabsTrigger>
            ))}
          </TabsList>

          {/* ------------------------------------------------ current step */}
          <TabsContent value="current" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Current step — {kase.stage_label ?? kase.stage}</CardTitle>
                <CardDescription>
                  {view?.stage_model?.find((s) => s.stage === kase.stage)?.description
                    ?? 'This is the only place the enforcement stage advances.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {(view?.stage_model ?? []).filter((s) => s.stage !== 'WITHDRAWN').map((s) => {
                    const done = (kase.stage_seq ?? 0) > s.seq;
                    const current = s.stage === kase.stage;
                    return (
                      <li key={s.stage} className={`flex items-center gap-1 ${current ? 'font-semibold text-primary' : done ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                        {done ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}{s.label}
                      </li>
                    );
                  })}
                </ol>

                {blockers.length ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                    <div className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />Resolve before the case can progress
                    </div>
                    <ul className="mt-1 space-y-0.5 pl-5">
                      {blockers.map((b) => <li key={b.code} className="list-disc text-muted-foreground">{b.label}</li>)}
                    </ul>
                  </div>
                ) : null}

                {kase.is_terminal ? (
                  <p className="text-sm text-muted-foreground">
                    This case is {kase.stage === 'WITHDRAWN' ? 'withdrawn' : 'closed'}. No further lifecycle
                    actions are available; the record remains for audit and supervisory history.
                  </p>
                ) : (
                  <>
                    {advancing.length ? (
                      <div className="space-y-2">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Lifecycle decisions</div>
                        <div className="flex flex-wrap gap-2">
                          {advancing.map((a) => (
                            <Button
                              key={`${a.action_code}-${a.to_stage}`}
                              size="sm"
                              variant={a.action_code === nextAction?.action_code ? 'default' : 'outline'}
                              disabled={!a.permitted}
                              onClick={() => openAction(a)}
                              data-rbac={`enforcement_management.${a.permission_action}`}
                              title={a.permitted ? a.description ?? undefined : `Requires the ${a.permission_action} authority`}
                            >
                              {a.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {recording.length ? (
                      <div className="space-y-2">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Record on this step</div>
                        <div className="flex flex-wrap gap-2">
                          {recording.map((a) => (
                            <Button
                              key={a.action_code}
                              size="sm"
                              variant="secondary"
                              disabled={!a.permitted}
                              onClick={() => openAction(a)}
                              data-rbac={`enforcement_management.${a.permission_action}`}
                            >
                              {a.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------ case overview */}
          <TabsContent value="case" className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Referral and provenance</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Referred from">{sourceLabel}</Detail>
                <Detail label="Source record">
                  {kase.source_href ? (
                    <Link to={kase.source_href} className="inline-flex items-center gap-1 text-primary hover:underline">
                      {kase.source_reference ?? 'Open source record'} <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  ) : (kase.source_reference ?? '—')}
                </Detail>
                <Detail label="Referred by">{kase.referred_by_name ?? '—'}</Detail>
                <Detail label="Referred at">{kase.referred_at ? formatDateTime(kase.referred_at) : '—'}</Detail>
                <Detail label="Legal basis">{kase.legal_basis ?? 'Not yet recorded'}</Detail>
                <Detail label="Severity"><span className="capitalize">{kase.severity ?? '—'}</span></Detail>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Detail label="Referral reason">{kase.referral_reason ?? '—'}</Detail>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Detail label="Assessment findings">{kase.findings ?? 'Not yet recorded'}</Detail>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Decision</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Decision taken">{kase.decision_at ? formatDateTime(kase.decision_at) : 'Not yet decided'}</Detail>
                <Detail label="Outcome"><span className="capitalize">{(kase.decision_outcome ?? '').replace(/_/g, ' ') || '—'}</span></Detail>
                <Detail label="Sanction"><span className="capitalize">{(kase.sanction_type ?? '').replace(/_/g, ' ') || '—'}</span></Detail>
                <Detail label="Sanction imposed">{kase.sanction_imposed_at ? formatDateTime(kase.sanction_imposed_at) : '—'}</Detail>
                <Detail label="Closed">{kase.closed_at ? formatDateTime(kase.closed_at) : '—'}</Detail>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Detail label="Closure rationale">{kase.closure_rationale ?? '—'}</Detail>
                </div>
              </CardContent>
            </Card>

            <CommunicationTimeline objectType="enforcement_action" objectId={kase.id} />
          </TabsContent>

          {/* ---------------------------------------- notice & representations */}
          <TabsContent value="evidence" className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Notice</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Notice reference">{kase.notice_reference ?? '—'}</Detail>
                <Detail label="Issued">{kase.notice_issued_at ? formatDateTime(kase.notice_issued_at) : 'Not issued'}</Detail>
                <Detail label="Representation deadline">{kase.representation_deadline ? formatDateOnly(kase.representation_deadline) : '—'}</Detail>
                <Detail label="Representations received">{kase.representation_count}</Detail>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Representations</CardTitle>
                <CardDescription>Recorded through the governed action on the current step.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Received</TableHead><TableHead>From</TableHead>
                      <TableHead>Channel</TableHead><TableHead>Summary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(view?.representations ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">No representations recorded.</TableCell></TableRow>
                    ) : view!.representations.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{formatDateTime(r.received_at)}</TableCell>
                        <TableCell className="text-sm">{r.received_from ?? '—'}</TableCell>
                        <TableCell className="text-sm capitalize">{r.channel ?? '—'}</TableCell>
                        <TableCell className="text-sm">{r.summary}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------- sanction, obligations, penalty */}
          <TabsContent value="obligations" className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Monetary penalty</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Imposed">{kase.penalty_amount ? `${currency} ${Number(kase.penalty_amount).toLocaleString()}` : '—'}</Detail>
                <Detail label="Settled">{kase.penalty_paid_amount ? `${currency} ${Number(kase.penalty_paid_amount).toLocaleString()}` : '—'}</Detail>
                <Detail label="Waived">{kase.penalty_waived_amount ? `${currency} ${Number(kase.penalty_waived_amount).toLocaleString()}` : '—'}</Detail>
                <Detail label="Outstanding">
                  <span className={outstanding > 0 ? 'font-medium text-destructive' : ''}>
                    {kase.penalty_amount ? `${currency} ${outstanding.toLocaleString()}` : '—'}
                  </span>
                </Detail>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Compliance obligations</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Obligation</TableHead><TableHead>Deadline</TableHead>
                      <TableHead>Status</TableHead><TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(view?.obligations ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">No obligations recorded.</TableCell></TableRow>
                    ) : view!.obligations.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-sm font-medium">{o.obligation}</TableCell>
                        <TableCell className="text-sm">{o.deadline ? formatDateOnly(o.deadline) : '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{String(o.status).replace(/_/g, ' ')}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{o.detail ?? o.breach_note ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Penalty settlement record</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Kind</TableHead>
                      <TableHead>Amount</TableHead><TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(view?.payments ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">Nothing recorded against the penalty.</TableCell></TableRow>
                    ) : view!.payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{formatDateOnly(p.paid_on)}</TableCell>
                        <TableCell className="text-sm capitalize">{p.kind}</TableCell>
                        <TableCell className="text-sm">{p.currency} {Number(p.amount).toLocaleString()}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.payment_reference ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------------- appeals */}
          <TabsContent value="appeals" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Appeals</CardTitle>
                <CardDescription>
                  Appeal outcomes never overwrite the original decision — the decision, the appeal and its
                  effect are all preserved.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lodged</TableHead><TableHead>Appellant</TableHead>
                      <TableHead>Review body</TableHead><TableHead>Status</TableHead>
                      <TableHead>Decision</TableHead><TableHead>Effect</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(view?.appeals ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No appeal has been lodged.</TableCell></TableRow>
                    ) : view!.appeals.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm">{formatDateTime(a.lodged_at)}</TableCell>
                        <TableCell className="text-sm">{a.appellant ?? '—'}</TableCell>
                        <TableCell className="text-sm">{a.review_body ?? '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{a.status}</Badge></TableCell>
                        <TableCell className="text-sm capitalize">{(a.decision ?? '').replace(/_/g, ' ') || '—'}</TableCell>
                        <TableCell className="text-sm">{a.effect_on_action ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ----------------------------------------------------- AI (advisory) */}
          <TabsContent value="ai">
            <AiReportsTab
              description="AI-assisted analysis of the recorded case. These reports interpret what is on file — they change no stage, decision, sanction or penalty."
              blocks={[
                {
                  id: 'ai-case-chronology',
                  label: 'Case chronology and summary',
                  hint: 'built from recorded case events',
                  node: (
                    <SupervisoryAiPanel
                      module="enforcement" analysisType="case_chronology" scopeId={kase.id}
                      label={`Case ${kase.case_number}`} title="AI case chronology and summary"
                      actionLabel="Summarise case"
                      description="Chronology and summary built from the recorded case events. It does not change the case stage, outcome or penalty."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-evidence',
                  label: 'Evidence completeness observations',
                  hint: 'what the record supports and where it looks incomplete',
                  node: (
                    <SupervisoryAiPanel
                      module="enforcement" analysisType="evidence_assessment" scopeId={kase.id}
                      label={`Case ${kase.case_number}`} title="AI evidence completeness observations"
                      actionLabel="Review evidence"
                      description="Observations on what the recorded evidence supports and where it looks incomplete. It never concludes that a breach is established."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-sanction-factors',
                  label: 'Aggravating and mitigating factors',
                  hint: 'factors visible in the record for the decision maker',
                  node: (
                    <SupervisoryAiPanel
                      module="enforcement" analysisType="sanction_factors" scopeId={kase.id}
                      label={`Case ${kase.case_number}`} title="AI aggravating and mitigating factors observed"
                      actionLabel="List factors"
                      description="Factors visible in the record for the decision maker to weigh. No sanction, amount or outcome is proposed."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-precedents',
                  label: 'Comparison with recorded past actions',
                  hint: 'consistency remains a human judgement',
                  node: (
                    <SupervisoryAiPanel
                      module="enforcement" analysisType="precedent_comparison" scopeId={kase.id}
                      label={`Case ${kase.case_number}`} title="AI comparison with recorded past actions"
                      actionLabel="Compare with past cases"
                      description="Comparison against past actions already recorded in the register. Consistency remains a human judgement."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-draft-notice',
                  label: 'Draft notice text',
                  hint: 'suggested wording only, not saved to the case',
                  node: (
                    <SupervisoryAiPanel
                      module="enforcement" analysisType="enforcement_draft" scopeId={kase.id}
                      label={`Case ${kase.case_number}`} title="AI draft notice text"
                      actionLabel="Draft notice text"
                      description="Suggested wording only, not saved to the case. Issuance, decision and closure stay in the enforcement process."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
              ]}
            />
          </TabsContent>

          {/* ------------------------------------------------------- history */}
          <TabsContent value="history">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Case history</CardTitle>
                <CardDescription>Immutable record of every governed action on this case.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(view?.timeline ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events recorded.</p>
                ) : view!.timeline.map((e) => (
                  <div key={e.id} className="rounded-md border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-[10px] capitalize">{e.event_type.replace(/_/g, ' ').toLowerCase()}</Badge>
                      <span className="text-muted-foreground">{formatDateTime(e.created_at)}</span>
                      <span className="text-muted-foreground">· {e.actor_name ?? 'System'}</span>
                      {e.detail?.from_stage && e.detail?.to_stage && e.detail.from_stage !== e.detail.to_stage ? (
                        <span className="text-xs text-muted-foreground">
                          {String(e.detail.from_stage).toLowerCase().replace(/_/g, ' ')} → {String(e.detail.to_stage).toLowerCase().replace(/_/g, ' ')}
                        </span>
                      ) : null}
                    </div>
                    {e.note ? <p className="mt-1 text-sm">{e.note}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* --------------------------------------------- governed action dialog */}
      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pending?.label}</DialogTitle>
            <DialogDescription>
              {pending?.description
                ?? 'The enforcement process validates authority, prerequisites and sequencing before this is recorded.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {pending?.requires_maker_checker ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Maker/checker applies: the officer who referred this matter cannot also take this decision
                unless they hold decision authority.
              </div>
            ) : null}

            {(ACTION_FIELDS[pending?.action_code ?? ''] ?? []).map((f) => (
              <div key={f.name} className="space-y-2">
                {f.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!fields[f.name]}
                      onCheckedChange={(v) => setFields((s) => ({ ...s, [f.name]: !!v }))}
                    />
                    {f.label}
                  </label>
                ) : (
                  <>
                    <Label>{f.label}{f.required ? <span className="text-destructive"> *</span> : null}</Label>
                    {f.type === 'textarea' ? (
                      <Textarea rows={3} value={fields[f.name] ?? ''} onChange={(e) => setFields((s) => ({ ...s, [f.name]: e.target.value }))} />
                    ) : f.type === 'select' ? (
                      <Select value={fields[f.name] ?? ''} onValueChange={(v) => setFields((s) => ({ ...s, [f.name]: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {(f.options ?? []).map((o) => (
                            <SelectItem key={o} value={o} className="capitalize">{o.replace(/_/g, ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                        value={fields[f.name] ?? ''}
                        onChange={(e) => setFields((s) => ({ ...s, [f.name]: e.target.value }))}
                      />
                    )}
                    {f.hint ? <p className="text-xs text-muted-foreground">{f.hint}</p> : null}
                  </>
                )}
              </div>
            ))}

            {pending?.action_code === 'IMPOSE_SANCTION' ? (
              <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Penalty currency</Label>
                {penaltyCurrency.isLoading ? (
                  <p className="text-sm text-muted-foreground">Resolving the regulator's governed currency…</p>
                ) : penaltyCurrency.error ? (
                  <p className="text-sm text-destructive">
                    The penalty currency cannot be resolved for this entity — a regulator body monetary
                    configuration is required before a monetary penalty can be imposed.
                  </p>
                ) : penaltyCurrency.data ? (
                  <>
                    <p className="text-sm font-medium">
                      {penaltyCurrency.data.currency} — regulator base currency
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Derived server-side from the applicable regulator body's monetary configuration
                      ({PENALTY_CURRENCY_POLICY_LABELS[penaltyCurrency.data.policy]}). It is not entered here and
                      is fixed on the sanction once imposed.
                    </p>
                    {penaltyCurrency.data.policy === 'EXPLICIT_ALLOWED_CURRENCIES'
                      && (penaltyCurrency.data.allowed_currencies ?? []).length > 0 ? (
                      <div className="space-y-2 pt-2">
                        <Label>Denominate in an approved non-base currency (optional)</Label>
                        <Select value={overrideCurrency} onValueChange={setOverrideCurrency}>
                          <SelectTrigger><SelectValue placeholder={`Keep ${penaltyCurrency.data.base_currency}`} /></SelectTrigger>
                          <SelectContent>
                            {(penaltyCurrency.data.allowed_currencies ?? []).map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {overrideCurrency && overrideCurrency !== penaltyCurrency.data.base_currency ? (
                          <Textarea
                            rows={2}
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="Legal or configuration basis for denominating this penalty in a non-base currency (minimum 10 characters)."
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}



            {pending?.requires_rationale ? (
              <div className="space-y-2">
                <Label>Rationale <span className="text-destructive">*</span></Label>
                <Textarea
                  rows={4}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder={`Recorded on the case and in the audit trail (minimum ${pending.min_rationale_length} characters).`}
                />
                <p className="text-xs text-muted-foreground">{rationale.trim().length}/{pending.min_rationale_length} characters</p>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button
              onClick={run}
              disabled={
                act.isPending
                || (!!pending?.requires_rationale && rationale.trim().length < (pending?.min_rationale_length ?? 0))
              }
              data-rbac={pending ? `enforcement_management.${pending.permission_action}` : undefined}
            >
              {act.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
