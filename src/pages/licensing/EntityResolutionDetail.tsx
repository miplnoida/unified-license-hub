/**
 * RDM-ENTITY-001 — Entity Resolution case workspace (maker-checker).
 *
 * Two distinct regulatory roles are served on this screen:
 *  - the resolution officer investigates candidates and records a
 *    RECOMMENDATION (existing organisation or new organisation), can request
 *    evidence, and submits the case for supervisory decision;
 *  - the supervisor (`entity_resolution.approve`) independently approves the
 *    recommendation, returns it for review with a reason, or requests more
 *    evidence.
 *
 * Every decision goes through `entity_resolution_decide`; the server enforces
 * permissions, maker-checker separation, binding updates and the audit ledger.
 * Where the governing policy does not require maker-checker the officer may
 * finalise directly — that is decided server-side and reported to the UI via
 * `requires_maker_checker`.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, ShieldCheck, Merge, AlertTriangle, FileQuestion, Gavel, Undo2, Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useResolutionCase, useResolutionMutations } from '@/hooks/useEntityRegistry';
import type { ResolutionAction } from '@/services/entityRegistry';
import { useCan } from '@/hooks/useCan';
import { formatDateTime } from '@/lib/datetime';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  PENDING_REVIEW: 'Awaiting review',
  EVIDENCE_REQUESTED: 'Evidence requested',
  ESCALATED: 'Awaiting supervisor decision',
  RESOLVED: 'Resolution complete',
  CLOSED: 'Closed',
};

const OUTCOME_LABEL: Record<string, string> = {
  EXACT_MATCH: 'Exact match',
  POSSIBLE_MATCH: 'Possible match',
  NO_MATCH: 'No match',
  PROVIDER_UNAVAILABLE: 'Register unavailable',
  RESOLVED_EXISTING: 'Resolved to existing organisation',
  CONFIRMED_NEW: 'Confirmed as new organisation',
  MERGED: 'Merged',
};

const RECOMMENDATION_LABEL: Record<string, string> = {
  RESOLVE_EXISTING: 'Recommended existing organisation',
  CONFIRM_NEW: 'Recommended new organisation',
};

const SUPERVISOR_DECISION_LABEL: Record<string, string> = {
  APPROVED: 'Approved',
  RETURNED: 'Returned for review',
  EVIDENCE_REQUESTED: 'More evidence requested',
};

const BINDING_LABEL: Record<string, string> = {
  PENDING_RESOLUTION: 'Pending organisation verification',
  BOUND_EXISTING: 'Bound to existing organisation',
  BOUND_PROVISIONAL: 'Bound to new provisional organisation',
};

const EVENT_LABEL: Record<string, string> = {
  'entity.resolution.requested': 'Identity resolution requested',
  'entity.resolution.evidence_requested': 'More evidence requested',
  'entity.resolution.recommended_existing': 'Officer recommended an existing organisation',
  'entity.resolution.recommended_new': 'Officer recommended a new organisation',
  'entity.resolution.escalated': 'Submitted for supervisor decision',
  'entity.resolution.approved': 'Supervisor approved the recommendation',
  'entity.resolution.returned': 'Supervisor returned the case for review',
  'entity.resolution.resolved_existing': 'Resolved to an existing organisation',
  'entity.resolution.confirmed_new': 'Confirmed as a new organisation',
};

const scoreLabel = (v: number) => `${Math.round(Number(v) <= 1 ? Number(v) * 100 : Number(v))}%`;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? '—'}</span>
    </div>
  );
}

export default function EntityResolutionDetail() {
  const { caseId = '' } = useParams();
  const { data, isLoading } = useResolutionCase(caseId || null);
  const { decide, previewMerge, executeMerge } = useResolutionMutations();
  const canResolve = useCan('entity_resolution', 'resolve');
  const canEscalate = useCan('entity_resolution', 'escalate');
  const canApprove = useCan('entity_resolution', 'approve');
  const canMerge = useCan('entity_resolution', 'merge');

  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [supervisorNotes, setSupervisorNotes] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const [preview, setPreview] = useState<Record<string, number> | null>(null);

  const detail = data?.detail;
  const journey = data?.journey;
  const candidates = data?.candidates ?? [];
  const events = data?.events ?? [];

  useEffect(() => {
    const preselected = candidates.find((c) => c.is_selected)?.entity_id
      ?? (detail?.recommended_entity_id ?? null);
    if (preselected) setSelectedEntity((prev) => prev ?? preselected);
  }, [candidates, detail?.recommended_entity_id]);

  const isClosed = !!detail && ['RESOLVED', 'CLOSED'].includes(detail.status);
  const isEscalated = detail?.status === 'ESCALATED';
  const makerChecker = detail?.requires_maker_checker !== false;

  const run = async (action: ResolutionAction, entityId: string | null, rationale: string) => {
    if (rationale.trim().length < 10) {
      toast.error('Please record a rationale of at least 10 characters.');
      return;
    }
    try {
      await decide.mutateAsync({ caseId, action, entityId, notes: rationale.trim() });
      toast.success('Decision recorded.');
      setNotes('');
      setSupervisorNotes('');
    } catch (e) {
      toast.error((e as Error).message || 'Decision failed.');
    }
  };

  const doPreview = async () => {
    if (!detail?.resolved_entity_id || !selectedEntity) {
      toast.error('Select the surviving entity and a duplicate to merge.');
      return;
    }
    try {
      setPreview(await previewMerge.mutateAsync({
        survivorEntityId: detail.resolved_entity_id,
        absorbedEntityId: selectedEntity,
      }));
    } catch (e) {
      toast.error((e as Error).message || 'Merge preview failed.');
    }
  };

  const doMerge = async () => {
    if (!detail?.resolved_entity_id || !selectedEntity) return;
    if (mergeReason.trim().length < 10) {
      toast.error('A merge reason of at least 10 characters is required.');
      return;
    }
    try {
      await executeMerge.mutateAsync({
        survivorEntityId: detail.resolved_entity_id,
        absorbedEntityId: selectedEntity,
        reason: mergeReason.trim(),
        caseId,
      });
      toast.success('Entities merged. Lineage preserved on the surviving record.');
      setPreview(null);
      setMergeReason('');
    } catch (e) {
      toast.error((e as Error).message || 'Merge failed.');
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
      </DashboardLayout>
    );
  }

  if (!detail) {
    return (
      <DashboardLayout>
        <PageHeader title="Resolution case" description="Case not found or not visible to you." backHref="/licensing/entity-resolution" backLabel="Back to queue" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title={`Resolution case ${detail.case_number}`}
          description={detail.subject_name}
          backHref="/licensing/entity-resolution"
          backLabel="Back to queue"
        />

        {isEscalated && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-500/5 p-3 text-sm">
            <Gavel className="h-4 w-4 text-amber-700" />
            <span className="font-medium">Awaiting supervisor decision</span>
            <span className="text-muted-foreground">
              Escalated by {detail.escalated_by_name || 'a resolution officer'} on {formatDateTime(detail.escalated_at)}.
            </span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Match candidates</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {candidates.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No candidates were returned — the subject appears to be a new organisation.
                  </p>
                )}
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedEntity(c.entity_id)}
                    className={`w-full rounded-md border p-3 text-left transition ${
                      selectedEntity === c.entity_id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          {c.entity_name || 'Unnamed register record'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.lifecycle ? `Status: ${c.lifecycle}` : 'Status unavailable'}
                          {c.licence_numbers?.length ? ` · Licences: ${c.licence_numbers.join(', ')}` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {scoreLabel(c.match_score)} · {c.match_basis}
                      </Badge>
                    </div>
                    {c.entity_id && (
                      <Link
                        to={`/entities/${c.entity_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 inline-block text-xs text-primary underline-offset-2 hover:underline"
                      >
                        Open organisation record
                      </Link>
                    )}
                    {c.is_selected && <p className="text-xs text-emerald-700 mt-1">Selected on this case</p>}
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Officer recommendation */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {makerChecker ? 'Officer recommendation' : 'Resolution decision'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {detail.recommended_action && (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                    <p className="font-medium">
                      {RECOMMENDATION_LABEL[detail.recommended_action] ?? detail.recommended_action}
                    </p>
                    {detail.recommended_entity_name && <p>Organisation: {detail.recommended_entity_name}</p>}
                    <p className="text-xs text-muted-foreground">
                      Recorded by {detail.recommended_by_name || 'a resolution officer'} on {formatDateTime(detail.recommended_at)}
                    </p>
                    {detail.recommendation_notes && <p className="text-xs">{detail.recommendation_notes}</p>}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="rationale">Rationale (recorded in the audit trail)</Label>
                  <Textarea
                    id="rationale"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Explain the identity evidence relied upon."
                    disabled={isClosed}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={!canResolve || isClosed || !selectedEntity || decide.isPending}
                      onClick={() => run(makerChecker ? 'RECOMMEND_EXISTING' : 'RESOLVE_EXISTING', selectedEntity, notes)}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {makerChecker ? 'Recommend selected existing organisation' : 'Resolve to selected organisation'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canResolve || isClosed || decide.isPending}
                      onClick={() => run(makerChecker ? 'RECOMMEND_NEW' : 'CONFIRM_NEW', null, notes)}
                    >
                      {makerChecker ? 'Recommend as new organisation' : 'Confirm as new organisation'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={!canResolve || isClosed || decide.isPending}
                      onClick={() => run('REQUEST_EVIDENCE', null, notes)}
                    >
                      <FileQuestion className="h-4 w-4" /> Request more evidence
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={!canEscalate || isClosed || isEscalated || decide.isPending}
                      onClick={() => run('ESCALATE', null, notes)}
                    >
                      <AlertTriangle className="h-4 w-4" /> Submit for supervisor review
                    </Button>
                  </div>
                  {makerChecker && (
                    <p className="text-xs text-muted-foreground">
                      This case requires supervisory approval — the recommendation is not final until a
                      supervisor approves it.
                    </p>
                  )}
                  {isClosed && (
                    <p className="text-xs text-muted-foreground">
                      Resolution is complete — no further decisions can be recorded on this case.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Supervisor decision */}
            {canApprove && (
              <Card className={isEscalated ? 'border-amber-300' : undefined}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gavel className="h-4 w-4" /> Supervisor decision
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {detail.supervisor_decision && (
                    <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                      <p className="font-medium">
                        {SUPERVISOR_DECISION_LABEL[detail.supervisor_decision] ?? detail.supervisor_decision}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {detail.supervisor_decided_by_name || 'Supervisor'} · {formatDateTime(detail.supervisor_decided_at)}
                      </p>
                      {detail.supervisor_notes && <p className="text-xs">{detail.supervisor_notes}</p>}
                    </div>
                  )}

                  {!isEscalated && !isClosed && (
                    <p className="text-sm text-muted-foreground">
                      A supervisory decision can only be recorded once the case has been submitted for
                      supervisor review.
                    </p>
                  )}

                  {isEscalated && (
                    <>
                      <div className="rounded-md border p-3 text-sm space-y-1">
                        <p className="text-xs text-muted-foreground">You are deciding on</p>
                        <p className="font-medium">
                          {detail.recommended_action
                            ? RECOMMENDATION_LABEL[detail.recommended_action] ?? detail.recommended_action
                            : 'No recommendation recorded — return the case for review'}
                        </p>
                        {detail.recommended_entity_name && <p>{detail.recommended_entity_name}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="supervisor-notes">Supervisory rationale (required)</Label>
                        <Textarea
                          id="supervisor-notes"
                          value={supervisorNotes}
                          onChange={(e) => setSupervisorNotes(e.target.value)}
                          rows={3}
                          placeholder="Record why you accept, return or need more evidence."
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={!detail.recommended_action || decide.isPending}
                            onClick={() => run('APPROVE', null, supervisorNotes)}
                          >
                            <ShieldCheck className="h-4 w-4" /> Approve recommendation
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={decide.isPending}
                            onClick={() => run('RETURN_FOR_REVIEW', null, supervisorNotes)}
                          >
                            <Undo2 className="h-4 w-4" /> Return for review
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={decide.isPending}
                            onClick={() => run('REQUEST_EVIDENCE', null, supervisorNotes)}
                          >
                            <FileQuestion className="h-4 w-4" /> Request more evidence
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Approving completes the governed resolution and updates the applicant's
                          registration. A supervisor cannot approve their own recommendation.
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Case</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Status" value={<Badge variant="outline">{STATUS_LABEL[detail.status] ?? detail.status}</Badge>} />
                <Row label="Outcome" value={detail.outcome ? OUTCOME_LABEL[detail.outcome] ?? detail.outcome : 'Pending'} />
                <Row label="Maker-checker" value={makerChecker ? 'Supervisory approval required' : 'Officer may finalise'} />
                <Row label="Register source" value={detail.provider_status} />
                <Row label="Authority mode" value={detail.authority_mode} />
                <Row label="Requested" value={formatDateTime(detail.requested_at)} />
                {detail.resolved_at && <Row label="Resolved" value={formatDateTime(detail.resolved_at)} />}
                {detail.resolved_entity_name && (
                  <Row
                    label="Resolved organisation"
                    value={
                      detail.resolved_entity_id
                        ? <Link className="text-primary underline-offset-2 hover:underline" to={`/entities/${detail.resolved_entity_id}`}>{detail.resolved_entity_name}</Link>
                        : detail.resolved_entity_name
                    }
                  />
                )}
                {detail.resolved_by_name && <Row label="Resolved by (officer)" value={detail.resolved_by_name} />}
                {detail.approved_at && <Row label="Approved" value={formatDateTime(detail.approved_at)} />}
                {detail.decision_notes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-muted-foreground text-xs">Decision notes</p>
                      <p>{detail.decision_notes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Registration context</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row
                  label="Journey"
                  value={journey?.journey_type === 'FORM_FIRST'
                    ? 'New applicant registration'
                    : journey?.journey_type === 'ENTITY_FIRST' ? 'Connect to an existing organisation' : '—'}
                />
                {journey?.registration_reference && <Row label="Reference" value={journey.registration_reference} />}
                {journey?.applicant_name && <Row label="Applicant" value={journey.applicant_name} />}
                {journey?.applicant_email && <Row label="Contact" value={journey.applicant_email} />}
                {journey?.sector_name && <Row label="Sector" value={journey.sector_name} />}
                {journey?.binding_status && (
                  <Row label="Organisation binding" value={BINDING_LABEL[journey.binding_status] ?? journey.binding_status} />
                )}
                {journey?.initiated_at && <Row label="Initiated" value={formatDateTime(journey.initiated_at)} />}
                <p className="pt-1 text-xs text-muted-foreground">
                  Resolving identity does not grant portal authority — user access is approved separately
                  under entity memberships.
                </p>
              </CardContent>
            </Card>

            {detail.escalated_at && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Escalation</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Escalated by" value={detail.escalated_by_name || '—'} />
                  <Row label="Escalated" value={formatDateTime(detail.escalated_at)} />
                  {detail.escalation_reason && (
                    <div>
                      <p className="text-muted-foreground text-xs">Reason</p>
                      <p>{detail.escalation_reason}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {canMerge && detail.resolved_entity_id && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Merge className="h-4 w-4" /> Controlled merge</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground text-xs">
                    Merges the selected candidate into the resolved organisation. Lineage is preserved — the
                    absorbed record stays queryable and points at the survivor.
                  </p>
                  <Button size="sm" variant="outline" onClick={doPreview} disabled={!selectedEntity || previewMerge.isPending}>
                    Preview impact
                  </Button>
                  {preview && (
                    <div className="rounded border p-2 space-y-1">
                      {Object.entries(preview).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Textarea
                    value={mergeReason}
                    onChange={(e) => setMergeReason(e.target.value)}
                    rows={2}
                    placeholder="Merge reason (required)"
                  />
                  <Button size="sm" variant="destructive" onClick={doMerge} disabled={!selectedEntity || executeMerge.isPending}>
                    Execute merge
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">History</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {events.length === 0 && <p className="text-sm text-muted-foreground">No events recorded.</p>}
                {events.map((e) => (
                  <div key={e.id} className="rounded border p-2 text-xs">
                    <p className="font-medium">{EVENT_LABEL[e.event_type] ?? e.event_type}</p>
                    <p className="text-muted-foreground">
                      {formatDateTime(e.created_at)}{e.actor_name ? ` · ${e.actor_name}` : ''}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
