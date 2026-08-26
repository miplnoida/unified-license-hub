/**
 * MC-10 — Supervisory intervention case file.
 *
 * The basis, the decision and the outcome are all recorded human acts. Actions
 * on this page call governed operations that re-check authority server-side,
 * keep the proposer and the decider apart, and append to the history.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/useCan';
import { formatDate, formatDateTime } from '@/lib/datetime';
import {
  INTERVENTION_STATUS_LABEL, INTERVENTION_TYPE_LABEL, planningErrorMessage,
  useDecideIntervention, useInterventionCase, useTransitionIntervention,
} from '@/hooks/useConductPlanning';

export default function InterventionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canApprove = useCan('market_conduct', 'approve');
  const canOperate = useCan('market_conduct', 'run_conduct_analytics') || useCan('market_conduct', 'manage_complaints');

  const [rationale, setRationale] = useState('');
  const { data, isLoading, isError, error } = useInterventionCase(id);
  const decide = useDecideIntervention(id);
  const transition = useTransitionIntervention(id);

  const iv = data?.intervention;
  const fail = (e: unknown) => toast.error(planningErrorMessage(String((e as Error)?.message ?? '')));
  const done = (msg: string) => { setRationale(''); toast.success(msg); };

  const field = (label: string, value: string | null | undefined) => (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={iv ? `${iv.reference} — ${iv.title}` : 'Supervisory intervention'}
          description="Planned supervisory action, its written basis, the officer decisions taken on it and its outcome."
          actions={<Button variant="outline" onClick={() => navigate('/conduct/interventions')}>Back to register</Button>}
        />

        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">This intervention could not be opened</AlertTitle>
            <AlertDescription className="text-xs">
              {planningErrorMessage(String((error as Error)?.message ?? ''))}
            </AlertDescription>
          </Alert>
        )}

        {isLoading && <Skeleton className="h-48 w-full" />}

        {iv && (
          <>
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Case record</CardTitle>
                <Badge>{INTERVENTION_STATUS_LABEL[iv.status] ?? iv.status}</Badge>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                {field('Intervention', INTERVENTION_TYPE_LABEL[iv.intervention_type] ?? iv.intervention_type)}
                {field('Entity', data?.licensee_name)}
                {field('Theme', iv.theme)}
                {field('Linked emerging risk', data?.emerging_risk_reference)}
                {field('Proposed by', `${data?.proposed_by_name ?? 'Officer'} · ${formatDate(iv.proposed_at)}`)}
                {field('Decided by', iv.decided_at ? `${data?.decided_by_name ?? 'Officer'} · ${formatDate(iv.decided_at)}` : null)}
                {field('Planned start', iv.planned_start ? formatDate(iv.planned_start) : null)}
                {field('Planned end', iv.planned_end ? formatDate(iv.planned_end) : null)}
                {field('Owner', data?.owner_name)}
                <div className="md:col-span-3">{field('Supervisory basis', iv.basis)}</div>
                <div className="md:col-span-3">{field('Expected outcome', iv.expected_outcome)}</div>
                <div className="md:col-span-3">{field('Decision rationale', iv.decision_rationale)}</div>
                <div className="md:col-span-3">{field('Outcome', iv.outcome_note)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recorded decision</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Every action requires a rationale of at least 10 characters and is attributed to you in the history
                  below. An officer cannot decide an intervention they proposed themselves.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Rationale</Label>
                  <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)}
                            placeholder="Record the reason for this decision." />
                </div>
                <div className="flex flex-wrap gap-2">
                  {iv.status === 'PROPOSED' && canApprove && (
                    <>
                      <Button disabled={decide.isPending || rationale.trim().length < 10}
                              onClick={() => decide.mutate({ decision: 'endorse', rationale: rationale.trim() },
                                { onSuccess: () => done('Intervention endorsed.'), onError: fail })}>
                        Endorse
                      </Button>
                      <Button variant="destructive" disabled={decide.isPending || rationale.trim().length < 10}
                              onClick={() => decide.mutate({ decision: 'reject', rationale: rationale.trim() },
                                { onSuccess: () => done('Intervention not approved.'), onError: fail })}>
                        Do not approve
                      </Button>
                    </>
                  )}
                  {iv.status === 'ENDORSED' && canOperate && (
                    <Button disabled={transition.isPending || rationale.trim().length < 10}
                            onClick={() => transition.mutate({ toStatus: 'ACTIVE', rationale: rationale.trim() },
                              { onSuccess: () => done('Intervention is now in progress.'), onError: fail })}>
                      Start intervention
                    </Button>
                  )}
                  {iv.status === 'ACTIVE' && canOperate && (
                    <Button disabled={transition.isPending || rationale.trim().length < 10}
                            onClick={() => transition.mutate({ toStatus: 'COMPLETED', rationale: rationale.trim() },
                              { onSuccess: () => done('Intervention completed.'), onError: fail })}>
                      Complete with outcome
                    </Button>
                  )}
                  {['PROPOSED', 'ENDORSED', 'ACTIVE'].includes(iv.status) && canOperate && (
                    <Button variant="outline" disabled={transition.isPending || rationale.trim().length < 10}
                            onClick={() => transition.mutate({ toStatus: 'CANCELLED', rationale: rationale.trim() },
                              { onSuccess: () => done('Intervention cancelled.'), onError: fail })}>
                      Cancel
                    </Button>
                  )}
                  {!canApprove && iv.status === 'PROPOSED' && (
                    <Badge variant="outline">Awaiting an officer with approval authority</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">History</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(data?.events ?? []).map((e) => (
                  <div key={e.id} className="border-l-2 pl-3">
                    <p className="text-sm font-medium">
                      {e.from_status ? `${e.from_status} → ${e.to_status}` : e.to_status ?? e.event_type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.actor_name ?? 'Officer'} · {formatDateTime(e.created_at)}
                    </p>
                    {e.rationale && <p className="mt-1 text-sm">{e.rationale}</p>}
                  </div>
                ))}
                {(data?.events ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No history recorded.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
