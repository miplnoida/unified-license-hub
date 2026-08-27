/**
 * MC-10 — Supervisory planning drill-through for one entity.
 *
 * Lists the recorded attention items, plans and interventions that involve this
 * entity so an officer can move from its conduct position into the planning
 * workflow. Nothing is planned, prioritised or closed here; the card only links
 * to the governed records.
 */
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/datetime';
import {
  ATTENTION_STATUS_LABEL, OUTCOME_RESULT_LABEL, PLAN_STATUS_LABEL, PRIORITY_BAND_LABEL,
  useEntityPlanningLinks,
} from '@/hooks/useConductAttention';

export function EntityPlanningLinksCard({ licenseeId }: { licenseeId: string | undefined }) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useEntityPlanningLinks(licenseeId);

  const attention = data?.attention_items ?? [];
  const plans = data?.plans ?? [];
  const interventions = data?.interventions ?? [];
  const risks = data?.emerging_risks ?? [];
  const empty = attention.length + plans.length + interventions.length + risks.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Supervisory planning on this entity</CardTitle>
        <CardDescription>
          Recorded supervisory attention, plans and interventions involving this entity, within the sectors you
          supervise. Each opens its own governed record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && (
          <p className="text-sm text-muted-foreground">
            Supervisory planning records could not be read for this entity.
          </p>
        )}
        {!isLoading && !isError && empty && (
          <p className="text-sm text-muted-foreground">
            No open supervisory attention, plan or intervention is recorded for this entity.
          </p>
        )}

        {attention.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Supervisory attention</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Matter</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {attention.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.reference}</TableCell>
                    <TableCell className="text-sm">{a.title}</TableCell>
                    <TableCell className="text-xs">
                      {a.confirmed_priority
                        ? PRIORITY_BAND_LABEL[a.confirmed_priority]
                        : a.calculated_priority
                          ? `${PRIORITY_BAND_LABEL[a.calculated_priority]} (calculated, awaiting confirmation)`
                          : 'Not calculated'}
                    </TableCell>
                    <TableCell><Badge variant="outline">{ATTENTION_STATUS_LABEL[a.status]}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/conduct/attention/${a.id}`)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {plans.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Supervisory plans</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                    <TableCell className="text-sm">{p.title}</TableCell>
                    <TableCell><Badge variant="outline">{PLAN_STATUS_LABEL[p.status]}</Badge></TableCell>
                    <TableCell className="text-xs">
                      {p.target_completion ? formatDate(p.target_completion) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/conduct/plans/${p.id}`)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {interventions.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Interventions</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Intervention</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {interventions.map((iv) => (
                  <TableRow key={iv.id}>
                    <TableCell className="font-mono text-xs">{iv.reference}</TableCell>
                    <TableCell className="text-sm">{iv.title}</TableCell>
                    <TableCell><Badge variant="outline">{iv.status}</Badge></TableCell>
                    <TableCell className="text-xs">
                      {iv.outcome_result
                        ? (OUTCOME_RESULT_LABEL[iv.outcome_result] ?? iv.outcome_result)
                        : 'Not recorded'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {iv.followup_completed_at
                        ? `Completed ${formatDate(iv.followup_completed_at)}`
                        : iv.followup_due_date ? `Due ${formatDate(iv.followup_due_date)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/conduct/interventions/${iv.id}`)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {risks.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              Emerging conduct risks behind this work
            </p>
            <div className="flex flex-wrap gap-2">
              {risks.map((r) => (
                <Button data-rbac="market_conduct.manage_complaints"
                  key={r.id}
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/conduct/emerging-risks/${r.id}`)}
                >
                  {r.reference} — {r.title}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
