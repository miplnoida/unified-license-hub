/**
 * AML-09 — Monitoring & Reassessment.
 *
 * The screen shows when AML/CFT risk was last established, where the next
 * review date comes from, whether the review is current, due, overdue,
 * unscheduled, event-triggered or blocked, which canonical events need
 * consideration, whether a reassessment is already open, and what the server
 * permits. Every one of those judgments is read from the server exactly as
 * returned. A due or overdue review is a workflow condition: nothing here
 * changes the entity's risk rating.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CalendarClock, History, RefreshCw } from 'lucide-react';
import {
  DUE_DATE_BASIS_LABEL,
  MONITORING_ACTION_LABEL,
  MONITORING_BLOCKER_LABEL,
  MONITORING_EVENT_LABEL,
  MONITORING_REASON_LABEL,
  MONITORING_STATE_LABEL,
  monitoringErrorMessage,
  useAmlRiskMonitoringView,
  useRequireAmlReassessment,
  useRescheduleAmlReview,
} from '@/hooks/useAmlRiskMonitoring';
import { PROVENANCE_LABEL, CALCULATION_AVAILABILITY_LABEL } from '@/hooks/useAmlSupervisoryConsequence';

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const when = (v: unknown) => (v ? new Date(String(v)).toLocaleString() : '—');

const stateTone = (state: string) =>
  state === 'OVERDUE' || state === 'EVENT_TRIGGERED'
    ? 'destructive'
    : state === 'DUE'
      ? 'default'
      : 'outline';

export function AmlRiskMonitoringPanel({
  entityId,
  domainCode = 'AML_CFT',
}: {
  entityId: string;
  domainCode?: string;
}) {
  const { data: view, isLoading, refetch, isFetching } = useAmlRiskMonitoringView(entityId, domainCode);
  const require = useRequireAmlReassessment();
  const reschedule = useRescheduleAmlReview();

  const [rationale, setRationale] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [scheduleRationale, setScheduleRationale] = useState('');
  const [disposition, setDisposition] = useState<'RESCHEDULED' | 'DEFERRED'>('RESCHEDULED');
  const [revisedDate, setRevisedDate] = useState('');

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading the governed monitoring record…</p>;
  }
  if (!view) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Monitoring record unavailable</AlertTitle>
        <AlertDescription>
          The server did not return a monitoring record for this entity, or it falls outside your supervisory authority.
        </AlertDescription>
      </Alert>
    );
  }

  const reassessAction = view.permitted_actions.find((a) => a.action === 'REQUIRE_REASSESSMENT') ?? null;
  const rescheduleAction = view.permitted_actions.find((a) => a.action === 'RESCHEDULE_REVIEW') ?? null;
  const selectedEvent = view.events.find((e) => `${e.event_type}:${e.source_id}` === eventKey) ?? null;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const res = (await fn()) as Record<string, unknown> | undefined;
      if (res?.duplicate) {
        toast.info(String(res.reason ?? 'A reassessment is already open — the existing one was returned.'));
      } else if (res?.idempotent) {
        toast.info('This decision was already recorded — the existing record was returned.');
      } else {
        toast.success(label);
      }
    } catch (e) {
      toast.error(monitoringErrorMessage(e));
    }
  };

  const s = view.schedule;

  return (
    <div className="space-y-4" data-testid="aml-monitoring-panel">
      {/* --------------------------------------------------- review-cycle state -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" /> Monitoring &amp; Reassessment
          </CardTitle>
          <CardDescription>
            A due or overdue review is a workflow condition, not a new risk rating. The current rating stays exactly as
            published until a governed reassessment changes it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={stateTone(view.monitoring_state) as never} data-testid="monitoring-state">
              {MONITORING_STATE_LABEL[view.monitoring_state] ?? view.monitoring_state}
            </Badge>
            <Badge variant="outline">Rating {dash(view.risk.current_rating)}</Badge>
            <Badge variant="outline">
              {PROVENANCE_LABEL[view.risk.rating_provenance ?? ''] ?? dash(view.risk.rating_provenance)}
            </Badge>
            <Badge variant="outline">
              {CALCULATION_AVAILABILITY_LABEL[view.risk.calculation_availability ?? '']
                ?? dash(view.risk.calculation_availability)}
            </Badge>
            <Button
              variant="ghost" size="icon" aria-label="Refresh monitoring record"
              onClick={() => void refetch()} disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <Alert>
            <AlertTitle data-testid="monitoring-reason-code">
              {MONITORING_REASON_LABEL[view.reason_code] ?? view.reason_code}
            </AlertTitle>
            <AlertDescription>{view.reason}</AlertDescription>
          </Alert>

          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="w-80 text-muted-foreground">Risk effective from</TableCell>
                <TableCell className="text-xs">{dash(view.risk.effective_from)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Risk last established</TableCell>
                <TableCell className="text-xs">{dash(s.last_review_date)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Last completed assessment</TableCell>
                <TableCell className="text-xs">
                  {s.last_completed_assessment ? (
                    <Link className="underline" to={s.last_completed_assessment.route}>
                      {dash(s.last_completed_assessment.reference ?? s.last_completed_assessment.id)}
                    </Link>
                  ) : 'No completed AML/CFT assessment'}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Next review date</TableCell>
                <TableCell className="text-xs" data-testid="monitoring-next-review">
                  {dash(s.next_review_date)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Where that date comes from</TableCell>
                <TableCell className="text-xs" data-testid="monitoring-basis">
                  {DUE_DATE_BASIS_LABEL[s.due_date_basis] ?? s.due_date_basis}
                  <div className="text-muted-foreground">{s.due_date_basis_detail}</div>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Programme and version</TableCell>
                <TableCell className="text-xs">
                  {s.programme
                    ? `${dash(s.programme.programme_code)} · ${dash(s.programme.recurrence_months)} months · set ${dash(s.programme.set_version)}`
                    : 'No assessment programme is bound'}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">As of</TableCell>
                <TableCell className="text-xs">{dash(view.as_of)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Conditions reported by the server</h4>
            {(view.blockers ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">The server reports no condition on this risk-of-record.</p>
            ) : (
              <ul className="space-y-1">
                {view.blockers.map((b) => (
                  <li key={b.code} className="rounded-md border p-2 text-sm">
                    <span className="font-mono text-xs">{b.code}</span>
                    <div className="text-xs text-muted-foreground">{b.detail}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* --------------------------------------------------------------- events -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Canonical events for consideration</CardTitle>
          <CardDescription>
            These are the platform's own findings, examinations and enforcement cases. An event can make reassessment
            available; it never creates one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {view.events.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="monitoring-no-events">
              The server recognises no supervisory event since the current risk-of-record took effect.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead><TableHead>Record</TableHead><TableHead>Date</TableHead>
                  <TableHead>Server reason</TableHead><TableHead>Reassessment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.events.map((e) => (
                  <TableRow key={`${e.event_type}:${e.source_id}`}>
                    <TableCell>{MONITORING_EVENT_LABEL[e.event_type] ?? e.event_type}</TableCell>
                    <TableCell className="text-xs">
                      {e.route ? <Link className="underline" to={e.route}>{dash(e.reference ?? e.source_id)}</Link>
                        : dash(e.reference)}
                    </TableCell>
                    <TableCell className="text-xs">{dash(e.event_date)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.reason}</TableCell>
                    <TableCell className="text-xs">
                      {e.reassessment_available ? 'Available' : (MONITORING_BLOCKER_LABEL[e.blocker ?? ''] ?? dash(e.blocker))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------- reassessment + schedule -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Permitted monitoring actions</CardTitle>
          <CardDescription>
            The action list, the permission each one needs and the reason anything is unavailable are the server's
            decision.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead><TableHead>Available</TableHead>
                <TableHead>Permission</TableHead><TableHead>Server reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.permitted_actions.map((a) => (
                <TableRow key={a.action}>
                  <TableCell>{MONITORING_ACTION_LABEL[a.action] ?? a.label}</TableCell>
                  <TableCell>{a.available ? 'Yes' : 'No'}</TableCell>
                  <TableCell className="font-mono text-xs">{dash(a.required_permission)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {MONITORING_BLOCKER_LABEL[a.reason_code] ?? a.reason_code}
                    {a.reason ? <div>{a.reason}</div> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {view.open_reassessment ? (
            <Alert data-testid="monitoring-open-reassessment">
              <AlertTitle>A reassessment is already open</AlertTitle>
              <AlertDescription>
                {dash(view.open_reassessment.requested_type)} reassessment, status {dash(view.open_reassessment.status)},
                due {dash(view.open_reassessment.due_date)}. Requesting another returns this one.
              </AlertDescription>
            </Alert>
          ) : null}

          {/* -------------------------------------------- require a reassessment -- */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-semibold">Require a reassessment</h4>

            {view.events.length > 0 ? (
              <>
                <Label>Triggering event (optional)</Label>
                <Select value={eventKey} onValueChange={setEventKey}>
                  <SelectTrigger className="w-96" aria-label="Triggering event">
                    <SelectValue placeholder="Choose a recognised event" />
                  </SelectTrigger>
                  <SelectContent>
                    {view.events.map((e) => (
                      <SelectItem key={`${e.event_type}:${e.source_id}`} value={`${e.event_type}:${e.source_id}`}>
                        {(MONITORING_EVENT_LABEL[e.event_type] ?? e.event_type)} — {dash(e.reference ?? e.source_id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}

            <Label htmlFor="mon-rationale">Supervisory reasoning (at least 20 characters)</Label>
            <Textarea id="mon-rationale" rows={3} value={rationale}
              onChange={(ev) => setRationale(ev.target.value)} />

            <Button
              data-rbac="aml_supervision.review"
              disabled={!reassessAction?.available || rationale.trim().length < 20 || require.isPending}
              onClick={() => void run('The reassessment requirement was recorded.', () =>
                require.mutateAsync({
                  entityId,
                  domainCode,
                  rationale,
                  eventType: selectedEvent?.event_type ?? null,
                  eventSourceId: selectedEvent?.source_id ?? null,
                }))}
            >
              Require a reassessment
            </Button>
            {rationale.trim().length < 20 ? (
              <p className="text-xs text-muted-foreground">
                A written reason of at least 20 characters is required before a reassessment can be required.
              </p>
            ) : null}
          </div>

          {/* ---------------------------------------------- governed rescheduling -- */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-semibold">Reschedule or defer the next review</h4>
            <p className="text-xs text-muted-foreground">
              The original schedule decision is never overwritten. Each governed decision is added to the history below.
              Waiving a review is not offered: no canonical authority for it exists.
            </p>

            <Label>Disposition</Label>
            <Select value={disposition} onValueChange={(v) => setDisposition(v as 'RESCHEDULED' | 'DEFERRED')}>
              <SelectTrigger className="w-72" aria-label="Disposition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RESCHEDULED">Reschedule to a new date</SelectItem>
                <SelectItem value="DEFERRED">Defer to a later date</SelectItem>
              </SelectContent>
            </Select>

            <Label htmlFor="mon-revised">Revised review date</Label>
            <Input id="mon-revised" type="date" value={revisedDate}
              onChange={(ev) => setRevisedDate(ev.target.value)} />

            <Label htmlFor="mon-schedule-rationale">Supervisory reasoning (at least 20 characters)</Label>
            <Textarea id="mon-schedule-rationale" rows={3} value={scheduleRationale}
              onChange={(ev) => setScheduleRationale(ev.target.value)} />

            <Button
              variant="outline"
              data-rbac="aml_supervision.approve"
              disabled={!rescheduleAction?.available || !revisedDate
                || scheduleRationale.trim().length < 20 || reschedule.isPending}
              onClick={() => void run('The schedule decision was recorded.', () =>
                reschedule.mutateAsync({
                  entityId, domainCode, rationale: scheduleRationale,
                  disposition, revisedDueDate: revisedDate,
                }))}
            >
              Record schedule decision
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------------- history -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Schedule and reassessment history
          </CardTitle>
          <CardDescription>Append-only. Each entry keeps the reason, the basis and the lineage recorded at the time.</CardDescription>
        </CardHeader>
        <CardContent>
          {view.history.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="monitoring-no-history">
              No governed monitoring decision has been recorded for this entity yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Decision</TableHead><TableHead>State at the time</TableHead>
                  <TableHead>Dates</TableHead><TableHead>Reason</TableHead><TableHead>Recorded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs">
                      {h.decision_kind === 'RESCHEDULE' ? `Schedule — ${dash(h.disposition)}` : 'Reassessment required'}
                      {h.event_type ? <div className="text-muted-foreground">{MONITORING_EVENT_LABEL[h.event_type] ?? h.event_type}</div> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {MONITORING_STATE_LABEL[h.monitoring_state ?? ''] ?? dash(h.monitoring_state)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {dash(h.original_due_date)}{h.revised_due_date ? ` → ${h.revised_due_date}` : ''}
                      <div className="text-muted-foreground">{DUE_DATE_BASIS_LABEL[h.due_date_basis ?? ''] ?? dash(h.due_date_basis)}</div>
                    </TableCell>
                    <TableCell className="text-xs">{h.rationale}</TableCell>
                    <TableCell className="text-xs">{when(h.decided_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="mt-4 space-y-1 border-t pt-3 text-xs text-muted-foreground" data-testid="monitoring-lineage">
            <h4 className="font-semibold text-foreground">Lineage recorded by the server</h4>
            {Object.entries(view.lineage ?? {}).map(([k, v]) => (
              <div key={k}><span className="font-mono">{k}</span>: {dash(v as unknown)}</div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
