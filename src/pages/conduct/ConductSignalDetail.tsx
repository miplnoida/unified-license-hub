/**
 * MC-05 — Signal detail workspace.
 *
 * Served entirely by the governed case read model. Every action runs through a
 * governed operation that enforces permission, regulator scope, state and the
 * mandatory rationale. The three objects stay distinct throughout:
 *   Signal    — supervisory intelligence item (this page)
 *   Alert     — attention/threshold mechanism (linked, never merged)
 *   Complaint — individual consumer case (linked, never merged)
 */
import { useMemo, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, ArrowUpRight, Bell, FileText, Loader2, Lock, Radar, ShieldCheck } from 'lucide-react';
import {
  useAssignSignal, useDismissSignal, useEscalateSignal, useLinkSignalAlert,
  useLinkSignalEvidence, useReopenSignal, useSignalCase, useValidateSignal,
} from '@/hooks/useConductSignals';
import { useAlertRegister } from '@/hooks/useConductRegisters';
import { useEvidence } from '@/hooks/useMarketConduct';
import { useInternalUsers } from '@/hooks/useInternalUsers';
import { useCan } from '@/hooks/useCan';
import { formatDateTime } from '@/lib/datetime';
import {
  ALERT_LINK_LABEL, EVIDENCE_TYPE_LABEL, SEVERITY_LABEL, SEVERITY_VARIANT,
  SIGNAL_HISTORY_LABEL, SIGNAL_SOURCE_LABEL, SIGNAL_STATUS_LABEL, STATUS_VARIANT,
  SYSTEMIC_LABEL, humanise, label,
} from '@/lib/conductSignalLabels';

type ActionKind = 'assign' | 'validate' | 'dismiss' | 'escalate' | 'link_alert' | 'reopen' | 'link_evidence' | null;

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const SYSTEMIC = ['unassessed', 'none', 'low', 'medium', 'high'];

export default function ConductSignalDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useSignalCase(id);
  const [action, setAction] = useState<ActionKind>(null);

  const canComplaints = useCan('market_conduct', 'manage_complaints');
  const canAnalytics = useCan('market_conduct', 'run_conduct_analytics');
  const canRules = useCan('market_conduct', 'manage_monitoring_rules');
  const canInvestigate = useCan('market_conduct', 'initiate_investigation');
  const canManage = canComplaints || canAnalytics || canRules;
  const canEscalate = canRules || canInvestigate || canComplaints;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-2 text-sm">Loading signal…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !data?.signal) {
    return (
      <DashboardLayout>
        <div className="p-16 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
          <p className="mt-2 text-sm text-muted-foreground">
            {(error as Error)?.message === 'signal_not_found'
              ? 'This signal could not be found.'
              : (error as Error)?.message || 'The signal could not be loaded.'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
            <Button variant="ghost" size="sm" asChild><Link to="/conduct/signals">Back to signals</Link></Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const s = data.signal;
  const open = !['dismissed', 'closed', 'escalated'].includes(s.status);
  const reopenable = ['dismissed', 'closed'].includes(s.status);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          backHref="/conduct/signals"
          backLabel="Signals"
          breadcrumbLabel={s.reference}
          title={s.title}
          description={`Supervisory intelligence item ${s.reference} — assessed separately from the alerts and consumer complaints it relates to.`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {!canManage && <Badge variant="outline">View only</Badge>}
              {canManage && open && (
                <>
                  <GuardedButton module="market_conduct" action="manage_complaints" data-rbac="market_conduct.manage_complaints" variant="outline" size="sm" onClick={() => setAction('assign')}>Assign owner</GuardedButton>
                  {['new', 'under_review'].includes(s.status) && (
                    <Button data-rbac="market_conduct.manage_complaints" size="sm" onClick={() => setAction('validate')}>Validate</Button>
                  )}
                  <Button data-rbac="market_conduct.manage_complaints" variant="outline" size="sm" onClick={() => setAction('dismiss')}>Dismiss</Button>
                  {s.status === 'validated' && canEscalate && !s.escalated_alert_id && (
                    <Button data-rbac="market_conduct.manage_complaints" size="sm" onClick={() => setAction('escalate')}>Escalate to alert</Button>
                  )}
                  <Button data-rbac="market_conduct.manage_complaints" variant="outline" size="sm" onClick={() => setAction('link_alert')}>Link existing alert</Button>
                </>
              )}
              {canManage && reopenable && (
                <GuardedButton module="market_conduct" action="manage_complaints" data-rbac="market_conduct.manage_complaints" variant="outline" size="sm" onClick={() => setAction('reopen')}>Reopen</GuardedButton>
              )}
            </div>
          }
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="whitespace-pre-wrap">{s.summary || 'No summary recorded.'}</p>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Entity" value={s.entity_name || 'No entity recorded'} />
                <Field label="Product" value={s.product_name || '—'} />
                <Field label="Channel" value={s.channel_name || '—'} />
                <Field label="Conduct risk category" value={s.risk_category_name || (s.signal_category ? humanise(s.signal_category) : '—')} />
                <Field label="Where it came from" value={label(SIGNAL_SOURCE_LABEL, s.source_type)} />
                <Field label="Raised" value={formatDateTime(s.created_at)} />
              </div>
              <Separator />
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Supervisory rationale</p>
                <p className="mt-1 whitespace-pre-wrap">{s.rationale || 'No rationale recorded.'}</p>
              </div>
              {s.disposition_reason && (
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Disposition reason</p>
                  <p className="mt-1 whitespace-pre-wrap">{s.disposition_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Risk &amp; ownership</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={STATUS_VARIANT[s.status] ?? 'outline'}>{label(SIGNAL_STATUS_LABEL, s.status)}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Severity</span>
                <Badge variant={SEVERITY_VARIANT[s.severity] ?? 'outline'}>{label(SEVERITY_LABEL, s.severity)}</Badge>
              </div>
              <Field label="Risk score" value={s.risk_score != null ? String(Number(s.risk_score)) : 'Not scored'} />
              <Field label="Systemic potential" value={label(SYSTEMIC_LABEL, s.systemic_potential)} />
              <Separator />
              <Field label="Owner" value={s.owner_name || 'Unassigned'} />
              <Field label="Assigned" value={s.assigned_at ? formatDateTime(s.assigned_at) : '—'} />
              <Field label="Validated" value={s.validated_at ? formatDateTime(s.validated_at) : '—'} />
              <Field label="Escalated" value={s.escalated_at ? formatDateTime(s.escalated_at) : '—'} />
              <Field label="Dismissed" value={s.dismissed_at ? formatDateTime(s.dismissed_at) : '—'} />
            </CardContent>
          </Card>
        </div>

        <SourcesCard sources={data.sources} />

        <AlertsCard
          alerts={data.alerts}
          escalatedAlertId={s.escalated_alert_id}
        />

        <EvidenceCard
          items={data.evidence}
          canManage={canManage && open}
          onLink={() => setAction('link_evidence')}
        />

        <Card>
          <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
          <CardContent className="p-0">
            {data.history.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Status change</TableHead>
                    <TableHead>Reason / note</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm">{label(SIGNAL_HISTORY_LABEL, h.action_code)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {h.from_status || h.to_status
                          ? `${label(SIGNAL_STATUS_LABEL, h.from_status) } → ${label(SIGNAL_STATUS_LABEL, h.to_status)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="max-w-[420px] text-xs">{h.reason || '—'}</TableCell>
                      <TableCell className="text-right text-xs">{formatDateTime(h.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <ActionDialogs
        signalId={s.id}
        entityId={s.licensee_id}
        currentOwnerId={s.owner_id}
        currentSeverity={s.severity}
        currentSystemic={s.systemic_potential}
        action={action}
        close={() => setAction(null)}
      />
    </DashboardLayout>
  );
}

function Field({ label: l, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">{l}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}

/* --------------------------------------------------------------- sections */

function SourcesCard({ sources }: { sources: { id: string; source_type: string; source_id: string | null; source_table: string | null; source_reference: string | null; note: string | null; created_at: string }[] }) {
  const hrefFor = (t: string, sourceId: string | null) => {
    if (!sourceId) return null;
    if (t === 'complaint' || t === 'complaint_outcome') return `/complaints/${sourceId}`;
    if (t === 'conduct_alert') return '/conduct/alerts';
    return null;
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sources</CardTitle>
        <CardDescription>Where this intelligence originated. Source records keep their own lifecycle.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {sources.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No sources have been linked to this signal.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Linked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((src) => {
                const href = hrefFor(src.source_type, src.source_id);
                return (
                  <TableRow key={src.id}>
                    <TableCell className="text-sm">{label(SIGNAL_SOURCE_LABEL, src.source_type)}</TableCell>
                    <TableCell className="text-xs">
                      {href ? (
                        <Link to={href} className="inline-flex items-center gap-1 underline">
                          {src.source_reference || 'Open record'} <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      ) : (src.source_reference || '—')}
                    </TableCell>
                    <TableCell className="max-w-[360px] text-xs">{src.note || '—'}</TableCell>
                    <TableCell className="text-right text-xs">{formatDateTime(src.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AlertsCard({ alerts, escalatedAlertId }: {
  alerts: { link_id: string; link_type: string; rationale: string | null; alert_id: string; alert_title: string | null; alert_status: string | null; alert_severity: string | null; alert_created_at: string | null }[];
  escalatedAlertId: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" /> Linked alerts</CardTitle>
        <CardDescription>
          An alert is the attention mechanism that puts a matter in front of a supervisor. It remains a separate
          record with its own disposition — linking never merges it into this signal.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {alerts.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No alerts are linked to this signal.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alert</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Alert status</TableHead>
                <TableHead>Reason for link</TableHead>
                <TableHead className="text-right">Raised</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((a) => (
                <TableRow key={a.link_id}>
                  <TableCell className="text-sm">
                    <Link to="/conduct/alerts" className="inline-flex items-center gap-1 underline">
                      {a.alert_title || 'Conduct alert'} <ArrowUpRight className="h-3 w-3" />
                    </Link>
                    {a.alert_id === escalatedAlertId && (
                      <Badge variant="secondary" className="ml-2">Raised by escalation</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{label(ALERT_LINK_LABEL, a.link_type)}</TableCell>
                  <TableCell>
                    <Badge variant={SEVERITY_VARIANT[a.alert_severity ?? ''] ?? 'outline'}>
                      {label(SEVERITY_LABEL, a.alert_severity)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{humanise(a.alert_status)}</TableCell>
                  <TableCell className="max-w-[320px] text-xs">{a.rationale || '—'}</TableCell>
                  <TableCell className="text-right text-xs">{a.alert_created_at ? formatDateTime(a.alert_created_at) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceCard({ items, canManage, onLink }: {
  items: { id: string; title: string | null; evidence_type: string | null; restricted: boolean | null; uploaded_at: string | null }[];
  canManage: boolean;
  onLink: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Evidence</CardTitle>
          <CardDescription>
            Items held in the conduct evidence repository. Evidence is stored once and attached where it is relevant.
          </CardDescription>
        </div>
        {canManage && <Button data-rbac="market_conduct.manage_complaints" variant="outline" size="sm" onClick={onLink}>Attach evidence</Button>}
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No evidence is attached to this signal.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="text-right">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{e.title || 'Untitled item'}</TableCell>
                  <TableCell className="text-xs">{label(EVIDENCE_TYPE_LABEL, e.evidence_type)}</TableCell>
                  <TableCell className="text-xs">
                    {e.restricted
                      ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Restricted</span>
                      : <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Internal</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs">{e.uploaded_at ? formatDateTime(e.uploaded_at) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- actions */

function ActionDialogs({ signalId, entityId, currentOwnerId, currentSeverity, currentSystemic, action, close }: {
  signalId: string;
  entityId: string | null;
  currentOwnerId: string | null;
  currentSeverity: string;
  currentSystemic: string;
  action: ActionKind;
  close: () => void;
}) {
  const assign = useAssignSignal();
  const validate = useValidateSignal();
  const dismiss = useDismissSignal();
  const reopen = useReopenSignal();
  const escalate = useEscalateSignal();
  const linkAlert = useLinkSignalAlert();
  const linkEvidence = useLinkSignalEvidence();

  const { data: staff = [] } = useInternalUsers();
  const { data: alerts = [] } = useAlertRegister({ statuses: null, includeClosed: true, limit: 50 });
  const { data: evidence = [] } = useEvidence(entityId ? { entity_id: entityId } : {});

  const [owner, setOwner] = useState(currentOwnerId ?? '');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [severity, setSeverity] = useState(currentSeverity);
  const [systemic, setSystemic] = useState(currentSystemic);
  const [riskScore, setRiskScore] = useState('');
  const [alertId, setAlertId] = useState('');
  const [linkType, setLinkType] = useState<'related' | 'source'>('related');
  const [evidenceId, setEvidenceId] = useState('');

  const busy = assign.isPending || validate.isPending || dismiss.isPending || reopen.isPending
    || escalate.isPending || linkAlert.isPending || linkEvidence.isPending;

  const dismissAll = () => { setReason(''); setNote(''); setRiskScore(''); setAlertId(''); setEvidenceId(''); close(); };

  const openState = (kind: ActionKind) => action === kind;

  const staffOptions = useMemo(() => staff.map((u) => ({
    id: u.id, name: u.full_name || u.email || 'Officer',
  })), [staff]);

  return (
    <>
      {/* Assign */}
      <Dialog open={openState('assign')} onOpenChange={(v) => !v && dismissAll()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign signal owner</DialogTitle>
            <DialogDescription>The owner is accountable for assessing and dispositioning this signal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Owner</Label>
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger><SelectValue placeholder="Select an officer" /></SelectTrigger>
                <SelectContent>
                  {staffOptions.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismissAll}>Cancel</Button>
            <GuardedButton module="market_conduct" action="manage_complaints" data-rbac="market_conduct.manage_complaints" disabled={!owner || busy} onClick={async () => {
              await assign.mutateAsync({ id: signalId, ownerId: owner, note: note.trim() || undefined });
              dismissAll();
            }}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Assign</GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validate */}
      <Dialog open={openState('validate')} onOpenChange={(v) => !v && dismissAll()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Validate signal</DialogTitle>
            <DialogDescription>
              Confirm the intelligence is credible and record the assessed risk. A rationale of at least 20 characters is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Severity</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((v) => <SelectItem key={v} value={v}>{SEVERITY_LABEL[v]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Systemic potential</Label>
                <Select value={systemic} onValueChange={setSystemic}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SYSTEMIC.map((v) => <SelectItem key={v} value={v}>{SYSTEMIC_LABEL[v]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Risk score (optional)</Label>
                <Input value={riskScore} onChange={(e) => setRiskScore(e.target.value)} placeholder="0 – 100" inputMode="decimal" />
              </div>
            </div>
            <div>
              <Label>Validation rationale</Label>
              <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Why the signal is credible and how the risk was assessed (at least 20 characters)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismissAll}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" disabled={reason.trim().length < 20 || busy} onClick={async () => {
              await validate.mutateAsync({
                id: signalId, rationale: reason.trim(), severity, systemicPotential: systemic,
                riskScore: riskScore.trim() === '' ? null : Number(riskScore),
              });
              dismissAll();
            }}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Validate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dismiss */}
      <ReasonDialog
        open={openState('dismiss')}
        title="Dismiss signal"
        description="Record why no supervisory action is warranted. At least 10 characters are required."
        minLength={10}
        confirmLabel="Dismiss"
        value={reason}
        onChange={setReason}
        busy={busy}
        onCancel={dismissAll}
        onConfirm={async () => { await dismiss.mutateAsync({ id: signalId, reason: reason.trim() }); dismissAll(); }}
      />

      {/* Reopen */}
      <ReasonDialog
        open={openState('reopen')}
        title="Reopen signal"
        description="Explain what new information justifies reopening. At least 20 characters are required."
        minLength={20}
        confirmLabel="Reopen"
        value={reason}
        onChange={setReason}
        busy={busy}
        onCancel={dismissAll}
        onConfirm={async () => { await reopen.mutateAsync({ id: signalId, reason: reason.trim() }); dismissAll(); }}
      />

      {/* Escalate */}
      <Dialog open={openState('escalate')} onOpenChange={(v) => !v && dismissAll()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate to alert</DialogTitle>
            <DialogDescription>
              This raises a conduct alert so the matter enters the supervisory attention queue. The signal remains the
              intelligence record and stays linked to the new alert. At least 20 characters are required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Alert severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((v) => <SelectItem key={v} value={v}>{SEVERITY_LABEL[v]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Escalation rationale</Label>
              <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismissAll}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" disabled={reason.trim().length < 20 || busy} onClick={async () => {
              await escalate.mutateAsync({ id: signalId, rationale: reason.trim(), severity });
              dismissAll();
            }}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Escalate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link existing alert */}
      <Dialog open={openState('link_alert')} onOpenChange={(v) => !v && dismissAll()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link an existing alert</DialogTitle>
            <DialogDescription>
              Records the relationship between this intelligence item and an existing alert. Both records keep their own
              status and disposition. At least 10 characters are required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Alert</Label>
              <Select value={alertId} onValueChange={setAlertId}>
                <SelectTrigger><SelectValue placeholder="Select an alert" /></SelectTrigger>
                <SelectContent>
                  {alerts.length === 0 && <SelectItem value="none" disabled>No alerts available</SelectItem>}
                  {alerts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.reference} — {a.title || a.entity_name || 'Conduct alert'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Relationship</Label>
              <Select value={linkType} onValueChange={(v) => setLinkType(v as 'related' | 'source')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="related">Related alert</SelectItem>
                  <SelectItem value="source">Alert that originated this signal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason for the link</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismissAll}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" disabled={!alertId || alertId === 'none' || reason.trim().length < 10 || busy} onClick={async () => {
              await linkAlert.mutateAsync({ id: signalId, alertId, rationale: reason.trim(), linkType });
              dismissAll();
            }}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Link alert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attach existing evidence */}
      <Dialog open={openState('link_evidence')} onOpenChange={(v) => !v && dismissAll()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach evidence</DialogTitle>
            <DialogDescription>
              Select an item already held in the conduct evidence repository. Evidence is never duplicated for a signal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Evidence item</Label>
              <Select value={evidenceId} onValueChange={setEvidenceId}>
                <SelectTrigger><SelectValue placeholder="Select an item" /></SelectTrigger>
                <SelectContent>
                  {evidence.length === 0 && <SelectItem value="none" disabled>No evidence available for this entity</SelectItem>}
                  {evidence.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.title || 'Untitled item'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!entityId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  This signal has no entity recorded, so the repository cannot be narrowed automatically.
                </p>
              )}
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismissAll}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" disabled={!evidenceId || evidenceId === 'none' || busy} onClick={async () => {
              await linkEvidence.mutateAsync({ id: signalId, evidenceId, note: note.trim() || undefined });
              dismissAll();
            }}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Attach</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReasonDialog({ open, title, description, minLength, confirmLabel, value, onChange, busy, onCancel, onConfirm }: {
  open: boolean; title: string; description: string; minLength: number; confirmLabel: string;
  value: string; onChange: (v: string) => void; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Radar className="h-4 w-4" /> {title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={value.trim().length < minLength || busy} onClick={onConfirm}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
