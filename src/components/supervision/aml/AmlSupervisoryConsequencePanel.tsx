/**
 * AML-08 — Post-publication supervisory consequence and action linkage.
 *
 * This surface shows the supervisor what the published AML/CFT risk-of-record
 * says, where that rating came from, and which governed supervisory
 * consequences the server permits right now. Every judgment is the server's:
 * the action list, availability, required permission, missing prerequisite,
 * duplicate warning and refusal wording are rendered exactly as returned.
 *
 * The screen deliberately never proposes an action from a rating, never
 * enables a blocked action and never invents an outcome from a rating that
 * cannot be calculated.
 */
import { useMemo, useState } from 'react';
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
import { AlertTriangle, GitBranch, Scale, ShieldCheck } from 'lucide-react';
import {
  CALCULATION_AVAILABILITY_LABEL,
  CONSEQUENCE_ACTION_LABEL,
  CONSEQUENCE_BLOCKER_LABEL,
  CONSEQUENCE_REASON_LABEL,
  PROVENANCE_LABEL,
  SOURCE_KIND_LABEL,
  TARGET_KIND_LABEL,
  consequenceErrorMessage,
  useRecordSupervisoryConsequence,
  useSupervisoryConsequenceView,
  useWithdrawSupervisoryConsequence,
  type ConsequenceAction,
} from '@/hooks/useAmlSupervisoryConsequence';
import { AmlResponsePolicyPanel } from './AmlResponsePolicyPanel';
import { AmlResponseSlaPanel } from './AmlResponseSlaPanel';

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const when = (v: unknown) => (v ? new Date(String(v)).toLocaleString() : '—');

export function AmlSupervisoryConsequencePanel({
  entityId,
  assessmentId,
  domainCode = 'AML_CFT',
}: {
  entityId: string;
  assessmentId?: string | null;
  domainCode?: string;
}) {
  const { data: view, isLoading } = useSupervisoryConsequenceView(entityId, domainCode, assessmentId ?? null);
  const record = useRecordSupervisoryConsequence();
  const withdraw = useWithdrawSupervisoryConsequence();

  const [selectedAction, setSelectedAction] = useState<string>('');
  const [mode, setMode] = useState<string>('');
  const [rationale, setRationale] = useState('');
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [targetId, setTargetId] = useState('');
  const [sourceFindingId, setSourceFindingId] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [withdrawId, setWithdrawId] = useState('');

  const action: ConsequenceAction | null = useMemo(
    () => view?.actions?.find((a) => a.action === selectedAction) ?? null,
    [view, selectedAction],
  );

  const candidates = useMemo(
    () => (view?.link_candidates ?? []).filter((c) => c.target_kind === action?.target_kind),
    [view, action],
  );

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading the governed supervisory consequence record…</p>;
  }
  if (!view) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Supervisory consequence record unavailable</AlertTitle>
        <AlertDescription>
          The server did not return a consequence record for this entity, or it falls outside your supervisory authority.
        </AlertDescription>
      </Alert>
    );
  }

  const src = view.source;
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const res = (await fn()) as Record<string, unknown> | undefined;
      if (res?.duplicate) {
        toast.info(String(res.reason ?? 'An equivalent record is already linked.'));
      } else if (res?.idempotent) {
        toast.info('This decision was already recorded — the existing record was returned.');
      } else {
        toast.success(label);
      }
    } catch (e) {
      toast.error(consequenceErrorMessage(e));
    }
  };

  const TargetLink = ({ target }: { target: { route: string | null; reference: string | null; id: string } | null }) => {
    if (!target) return <span className="text-muted-foreground">—</span>;
    const text = target.reference ?? target.id;
    return target.route ? (
      <Link className="underline" to={target.route}>{text}</Link>
    ) : (
      <span className="font-mono text-xs">{text}</span>
    );
  };

  const rationaleReady = rationale.trim().length >= 20;
  const canSubmit =
    !!action && action.available && !!mode && rationaleReady && !record.isPending
    && (mode !== 'LINK' || !!targetId)
    && (selectedAction !== 'REFER_TO_ENFORCEMENT' || mode === 'LINK' || !!sourceFindingId);

  return (
    <div className="space-y-4" data-testid="aml-consequence-panel">
      {/* -------------------------------------------------- risk-of-record -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Published risk-of-record used for supervisory judgment
          </CardTitle>
          <CardDescription>
            A risk rating is an input to supervisory judgment, never an instruction. Nothing on this screen turns a
            rating into an action — an officer decides, with a written reason, and the server records it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{SOURCE_KIND_LABEL[src.source_kind] ?? src.source_kind}</Badge>
            <Badge variant="outline">Rating {dash(src.current_rating)}</Badge>
            <Badge variant="outline">{PROVENANCE_LABEL[src.rating_provenance] ?? src.rating_provenance}</Badge>
            <Badge variant="outline">
              {CALCULATION_AVAILABILITY_LABEL[src.calculation_availability] ?? src.calculation_availability}
            </Badge>
          </div>

          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="w-72 text-muted-foreground">Effective from</TableCell>
                <TableCell className="text-xs">{dash(src.effective_from)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Publication</TableCell>
                <TableCell className="font-mono text-xs">{dash(src.publication?.id)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Approval decision</TableCell>
                <TableCell className="font-mono text-xs">{dash(src.approval_decision?.id)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Driving assessment</TableCell>
                <TableCell className="font-mono text-xs">
                  {dash(src.assessment?.reference ?? src.assessment?.id)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Bound calculation run</TableCell>
                <TableCell className="font-mono text-xs">
                  {src.calculation_run?.run_seq != null ? `#${src.calculation_run.run_seq} · ` : ''}
                  {dash(src.calculation_run?.result_hash)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Conditions reported by the server</h4>
            {(src.blockers ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">The server reports no condition on this risk-of-record.</p>
            ) : (
              <ul className="space-y-1">
                {src.blockers.map((b) => (
                  <li key={b.code} className="rounded-md border p-2 text-sm">
                    <span className="font-mono text-xs">{b.code}</span>{' — '}
                    {CONSEQUENCE_BLOCKER_LABEL[b.code] ?? b.code}
                    {b.blocking ? <Badge className="ml-2" variant="destructive">Blocking</Badge> : null}
                    <div className="text-xs text-muted-foreground">{b.detail}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------ PCOMP-R2C response policy expectations -- */}
      <AmlResponsePolicyPanel entityId={entityId} assessmentId={assessmentId ?? null} domainCode={domainCode} />
      <AmlResponseSlaPanel entityId={entityId} assessmentId={assessmentId ?? null} domainCode={domainCode} />

      {/* ---------------------------------------------- permitted consequences -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4" /> Permitted supervisory consequences
          </CardTitle>
          <CardDescription>
            The list, the permission each one needs and the reason anything is unavailable are the server's decision.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Consequence</TableHead><TableHead>Available</TableHead>
                <TableHead>Permission</TableHead><TableHead>Server reason</TableHead>
                <TableHead>Already recorded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.actions.map((a) => (
                <TableRow key={a.action}>
                  <TableCell>{CONSEQUENCE_ACTION_LABEL[a.action] ?? a.label}</TableCell>
                  <TableCell>{a.available ? 'Yes' : 'No'}</TableCell>
                  <TableCell className="font-mono text-xs">{a.required_permission}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {CONSEQUENCE_REASON_LABEL[a.reason_code] ?? a.reason_code}
                    {a.reason ? <div>{a.reason}</div> : null}
                  </TableCell>
                  <TableCell className="text-xs">{(a.existing ?? []).length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* ------------------------------------------------ record a decision -- */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-semibold">Record a supervisory consequence</h4>

            <Label>Consequence</Label>
            <Select
              value={selectedAction}
              onValueChange={(v) => {
                setSelectedAction(v);
                setMode('');
                setTargetId('');
              }}
            >
              <SelectTrigger className="w-96" aria-label="Consequence">
                <SelectValue placeholder="Choose a supervisory consequence" />
              </SelectTrigger>
              <SelectContent>
                {view.actions.map((a) => (
                  <SelectItem key={a.action} value={a.action} disabled={!a.available}>
                    {CONSEQUENCE_ACTION_LABEL[a.action] ?? a.label}
                    {a.available ? '' : ` — ${CONSEQUENCE_REASON_LABEL[a.reason_code] ?? a.reason_code}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {action && !action.available ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{CONSEQUENCE_REASON_LABEL[action.reason_code] ?? action.reason_code}</AlertTitle>
                <AlertDescription>{action.reason}</AlertDescription>
              </Alert>
            ) : null}

            {action ? (
              <>
                <Label>How to link</Label>
                <Select value={mode} onValueChange={(v) => { setMode(v); setTargetId(''); }}>
                  <SelectTrigger className="w-72" aria-label="How to link">
                    <SelectValue placeholder="Create a new record or link an existing one" />
                  </SelectTrigger>
                  <SelectContent>
                    {(action.linkage_modes ?? []).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m === 'CREATE' ? 'Create a new record' : m === 'LINK' ? 'Link an existing record' : 'Record the decision only'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}

            {action?.target_kind && mode === 'LINK' ? (
              <>
                <Label>Existing {TARGET_KIND_LABEL[action.target_kind] ?? action.target_kind}</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="w-96" aria-label="Existing record">
                    <SelectValue placeholder="Choose an existing record" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.length === 0 ? (
                      <SelectItem value="none" disabled>The server offers no linkable record</SelectItem>
                    ) : candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.reference ?? c.id} — {c.title ?? ''} ({c.status ?? '—'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}

            {selectedAction === 'REFER_TO_ENFORCEMENT' && mode === 'CREATE' ? (
              <>
                <Label htmlFor="conseq-finding">Supervisory finding being referred</Label>
                <Select value={sourceFindingId} onValueChange={setSourceFindingId}>
                  <SelectTrigger className="w-96" id="conseq-finding" aria-label="Supervisory finding being referred">
                    <SelectValue placeholder="Choose the finding" />
                  </SelectTrigger>
                  <SelectContent>
                    {(view.link_candidates ?? [])
                      .filter((c) => c.target_kind === 'SUPERVISORY_FINDING')
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.reference ?? c.id}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}

            {mode === 'CREATE' ? (
              <>
                <Label htmlFor="conseq-title">Title</Label>
                <Input id="conseq-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <Label htmlFor="conseq-objective">Supervisory objective (optional)</Label>
                <Input id="conseq-objective" value={objective} onChange={(e) => setObjective(e.target.value)} />
                <Label htmlFor="conseq-due">Target date (optional)</Label>
                <Input id="conseq-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </>
            ) : null}

            <Label htmlFor="conseq-rationale">Supervisory reasoning (at least 20 characters)</Label>
            <Textarea id="conseq-rationale" rows={3} value={rationale}
              onChange={(e) => setRationale(e.target.value)} />

            <Button
              data-rbac="aml_supervision.review"
              disabled={!canSubmit}
              onClick={() => void run('The supervisory consequence was recorded.', () =>
                record.mutateAsync({
                  entityId,
                  domainCode,
                  assessmentId: assessmentId ?? null,
                  actionType: selectedAction,
                  linkageMode: mode as 'CREATE' | 'LINK' | 'RECORD_ONLY',
                  rationale,
                  targetId: mode === 'LINK' ? targetId : null,
                  title: title || null,
                  supervisoryObjective: objective || null,
                  dueDate: dueDate || null,
                  sourceFindingId: sourceFindingId || null,
                }))}
            >
              Record supervisory consequence
            </Button>
            {!rationaleReady ? (
              <p className="text-xs text-muted-foreground">
                A written reason of at least 20 characters is required before any consequence can be recorded.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ linked records -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4" /> Supervisory records linked to this risk-of-record
          </CardTitle>
          <CardDescription>
            These are the canonical plans, reassessments, interventions, examinations, findings and enforcement cases
            themselves — this screen keeps no copy of them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(view.linked_records ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No supervisory record is linked to this risk-of-record yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consequence</TableHead><TableHead>Record</TableHead>
                  <TableHead>Reference</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.linked_records.map((l) => (
                  <TableRow key={l.decision_id}>
                    <TableCell>{CONSEQUENCE_ACTION_LABEL[l.action_type] ?? l.action_type}</TableCell>
                    <TableCell>{TARGET_KIND_LABEL[l.target?.kind ?? ''] ?? dash(l.target?.kind)}</TableCell>
                    <TableCell><TargetLink target={l.target as any} /></TableCell>
                    <TableCell className="text-xs">{dash(l.target?.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------------- decision history -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Consequence decision history</CardTitle>
          <CardDescription>
            Each entry keeps the exact risk source, rating provenance, officer, time and reasoning it was taken on.
            A mistake is withdrawn — never edited or deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(view.decisions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No supervisory consequence has been recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Decided</TableHead><TableHead>Consequence</TableHead>
                  <TableHead>Record</TableHead><TableHead>Risk source</TableHead>
                  <TableHead>Reasoning</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.decisions.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs">
                      <div>{when(d.decided_at)}</div>
                      <div className="font-mono text-muted-foreground">{dash(d.decided_by)}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {CONSEQUENCE_ACTION_LABEL[d.action_type] ?? d.action_type}
                      <div className="text-muted-foreground">{d.linkage_mode}</div>
                    </TableCell>
                    <TableCell className="text-xs"><TargetLink target={d.target as any} /></TableCell>
                    <TableCell className="text-xs">
                      <div>{SOURCE_KIND_LABEL[d.source_kind] ?? d.source_kind}</div>
                      <div className="text-muted-foreground">
                        {dash(d.source_rating)} · {PROVENANCE_LABEL[d.rating_provenance] ?? d.rating_provenance}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md text-xs">{d.rationale}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{d.status}</Badge>
                      {d.withdrawal_reason ? (
                        <div className="mt-1 text-muted-foreground">{d.withdrawal_reason}</div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="space-y-2 border-t pt-4">
            <Label>Withdraw a recorded decision</Label>
            <Select value={withdrawId} onValueChange={setWithdrawId}>
              <SelectTrigger className="w-96" aria-label="Withdraw a recorded decision">
                <SelectValue placeholder="Choose a recorded decision" />
              </SelectTrigger>
              <SelectContent>
                {(view.decisions ?? []).filter((d) => d.status === 'RECORDED').map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {(CONSEQUENCE_ACTION_LABEL[d.action_type] ?? d.action_type)} · {when(d.decided_at)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label htmlFor="conseq-withdraw">Withdrawal reason (at least 20 characters)</Label>
            <Textarea id="conseq-withdraw" rows={2} value={withdrawalReason}
              onChange={(e) => setWithdrawalReason(e.target.value)} />
            <Button
              data-rbac="aml_supervision.review"
              variant="outline"
              disabled={!withdrawId || withdrawalReason.trim().length < 20 || withdraw.isPending}
              onClick={() => void run('The supervisory consequence decision was withdrawn.', () =>
                withdraw.mutateAsync({ decisionId: withdrawId, rationale: withdrawalReason }))}
            >
              Withdraw decision
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AmlSupervisoryConsequencePanel;
