/**
 * AML-10 — AML/CFT portfolio risk and management reporting surface.
 *
 * Every number on this screen is printed exactly as the server read model
 * (`supervisory_portfolio_report`) returned it. Nothing here sums, filters,
 * bands, orders by risk, classifies provenance, derives a review state or
 * decides a movement direction: filters are sent to the server and the server
 * returns the restated payload. Charts are decoration over a readable table —
 * no value exists only inside a bar.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Download, PieChart, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  MOVEMENT_DIRECTION_LABEL,
  PORTFOLIO_REASON_LABEL,
  PORTFOLIO_REVIEW_LABEL,
  PROVENANCE_BUCKET_DETAIL,
  PROVENANCE_BUCKET_LABEL,
  portfolioErrorMessage,
  useAmlPortfolioExport,
  useAmlPortfolioReport,
  type PortfolioFilters,
} from '@/hooks/useAmlPortfolio';

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

const BUCKETS = ['CALCULATED', 'APPROVED_OVERRIDE', 'LEGACY', 'NOT_CALCULABLE', 'NO_RISK'] as const;
const REVIEW_STATES = [
  'OVERDUE', 'DUE', 'EVENT_TRIGGERED', 'UNSCHEDULED', 'CURRENT', 'LEGACY', 'BLOCKED',
] as const;

/** Presentation-only bar. The number is always printed next to it. */
function Bar({ value, of }: { value: number; of: number }) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0;
  return (
    <span aria-hidden className="ml-2 inline-block h-2 w-24 rounded bg-muted align-middle">
      <span className="block h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
    </span>
  );
}

export function AmlPortfolioReport({ domainCode = 'AML_CFT' }: { domainCode?: string }) {
  const [state, setState] = useState('all');
  const [bucket, setBucket] = useState('all');
  const [risk, setRisk] = useState('all');
  const [asOf, setAsOf] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  const filters: PortfolioFilters = useMemo(() => ({
    domain_code: domainCode,
    as_of: asOf || null,
    period_from: periodFrom || null,
    period_to: periodTo || null,
    monitoring_state: state === 'all' ? null : state,
    provenance: bucket === 'all' ? null : bucket,
    risk_code: risk === 'all' ? null : risk,
  }), [domainCode, asOf, periodFrom, periodTo, state, bucket, risk]);

  const { data, isLoading, error, refetch, isFetching } = useAmlPortfolioReport(filters);
  const exporter = useAmlPortfolioExport();

  const s = data?.summary;
  const riskCodes = useMemo(
    () => Array.from(new Set((data?.risk_distribution ?? [])
      .map((r) => r.risk_code).filter((c) => c && c !== 'NONE'))),
    [data?.risk_distribution],
  );

  const cards: Array<{ key: string; label: string; value: number | undefined; hint: string }> = [
    { key: 'visible', label: 'Entities visible to you', value: s?.visible_entity_total, hint: 'Server-scoped by regulator, domain and supervisory perimeter.' },
    { key: 'reported', label: 'Entities in this report', value: s?.entity_total, hint: 'After the filters below were applied by the server.' },
    { key: 'with-risk', label: 'With a current risk-of-record', value: s?.entities_with_current_risk, hint: 'A published or legacy risk-of-record exists.' },
    { key: 'without-risk', label: 'Without a risk-of-record', value: s?.entities_without_risk, hint: 'No rating is inferred for these entities.' },
    { key: 'reassessment', label: 'With an open reassessment', value: s?.entities_with_open_reassessment, hint: 'Governed reassessment requirements already open.' },
    { key: 'consequence', label: 'With an open supervisory consequence', value: s?.entities_with_open_consequence, hint: 'Governed AML consequence decisions still open.' },
  ];

  return (
    <div className="space-y-4" data-testid="aml-portfolio-report">
      {/* ------------------------------------------------------------ filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PieChart className="h-4 w-4" /> AML/CFT portfolio
          </CardTitle>
          <CardDescription>
            Every total, bucket, distribution and trend below is calculated by the server for the
            entities you are permitted to see. Filters are applied by the server, not in this screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1">
              <Label htmlFor="port-state">Review status</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger id="port-state" data-testid="port-state" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All review statuses</SelectItem>
                  {REVIEW_STATES.map((v) => (
                    <SelectItem key={v} value={v}>{PORTFOLIO_REVIEW_LABEL[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="port-bucket">Rating provenance</Label>
              <Select value={bucket} onValueChange={setBucket}>
                <SelectTrigger id="port-bucket" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All provenance</SelectItem>
                  {BUCKETS.map((v) => (
                    <SelectItem key={v} value={v}>{PROVENANCE_BUCKET_LABEL[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="port-risk">Published risk</Label>
              <Select value={risk} onValueChange={setRisk}>
                <SelectTrigger id="port-risk" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All published risk codes</SelectItem>
                  {riskCodes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="port-as-of">As-of date</Label>
              <Input id="port-as-of" type="date" className="h-9" value={asOf}
                onChange={(e) => setAsOf(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="port-period-from">Trend from</Label>
              <Input id="port-period-from" type="date" className="h-9" value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="port-period-to">Trend to</Label>
              <Input id="port-period-to" type="date" className="h-9" value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline" size="sm" data-testid="port-export"
              onClick={() => exporter.mutate(filters)} disabled={exporter.isPending || isLoading}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporter.isPending ? 'Preparing export…' : 'Export management report'}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Refresh portfolio"
              onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            {data ? (
              <span className="text-sm text-muted-foreground" data-testid="port-as-of-label">
                As of {dash(data.as_of)} · generated {dash(data.generated_at)}
              </span>
            ) : null}
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Unable to load the AML/CFT portfolio</AlertTitle>
              <AlertDescription data-testid="port-error">{portfolioErrorMessage(error)}</AlertDescription>
            </Alert>
          ) : null}
          {exporter.error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>The export was refused</AlertTitle>
              <AlertDescription data-testid="port-export-error">
                {portfolioErrorMessage(exporter.error)}
              </AlertDescription>
            </Alert>
          ) : null}
          {data?.truncated ? (
            <Alert data-testid="port-truncated">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>The server limited the rows returned</AlertTitle>
              <AlertDescription>
                Totals cover every entity in scope; the table shows the first {data.row_count} rows.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {isLoading ? <Skeleton className="h-64 w-full" /> : null}

      {data && s ? (
        <>
          {/* ------------------------------------------------- summary cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="port-summary">
            {cards.map((c) => (
              <Card key={c.key} data-testid={`port-card-${c.key}`}>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  <p className="font-mono text-2xl">{dash(c.value)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ------------------------------------------- provenance buckets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Risk-of-record provenance</CardTitle>
              <CardDescription>
                Legacy and not-calculated records are reported in their own buckets and are never
                placed in a calculated risk band.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provenance</TableHead>
                    <TableHead className="w-40 text-right">Entities</TableHead>
                    <TableHead>What it means</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {BUCKETS.map((b) => {
                    const value = ({
                      CALCULATED: s.calculated_risk_total,
                      APPROVED_OVERRIDE: s.approved_override_total,
                      LEGACY: s.legacy_risk_total,
                      NOT_CALCULABLE: s.not_calculable_total,
                      NO_RISK: s.no_risk_total,
                    } as Record<string, number>)[b];
                    return (
                      <TableRow key={b} data-testid={`port-bucket-${b}`}>
                        <TableCell className="font-medium">{PROVENANCE_BUCKET_LABEL[b]}</TableCell>
                        <TableCell className="text-right font-mono">
                          {dash(value)}<Bar value={value ?? 0} of={s.entity_total} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {PROVENANCE_BUCKET_DETAIL[b]}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ------------------------------------------- risk distribution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Published risk distribution</CardTitle>
              <CardDescription>
                Grouped by canonical published risk code within each provenance bucket.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(data.risk_distribution ?? []).length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground" data-testid="port-distribution-empty">
                  No published risk code is in scope for this report.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Risk code</TableHead>
                      <TableHead>Provenance</TableHead>
                      <TableHead className="w-40 text-right">Entities</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.risk_distribution.map((r) => (
                      <TableRow key={`${r.provenance_bucket}-${r.risk_code}`}
                        data-testid={`port-dist-${r.provenance_bucket}-${r.risk_code}`}>
                        <TableCell className="font-mono">{dash(r.risk_code === 'NONE' ? null : r.risk_code)}</TableCell>
                        <TableCell>{PROVENANCE_BUCKET_LABEL[r.provenance_bucket] ?? r.provenance_bucket}</TableCell>
                        <TableCell className="text-right font-mono">
                          {r.entities}<Bar value={r.entities} of={s.entity_total} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* ------------------------------------------ review distribution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Review status</CardTitle>
              <CardDescription>
                Review status is read from the governed monitoring model. A due or overdue review is
                a workflow condition, not a new risk rating. The work queue remains on Supervised
                entities.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Review status</TableHead>
                    <TableHead className="w-40 text-right">Entities</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {REVIEW_STATES.map((st) => {
                    const value = ({
                      CURRENT: s.review_current_total,
                      DUE: s.review_due_total,
                      OVERDUE: s.review_overdue_total,
                      EVENT_TRIGGERED: s.review_event_triggered_total,
                      UNSCHEDULED: s.review_unscheduled_total,
                      BLOCKED: s.review_blocked_total,
                      LEGACY: s.review_legacy_total,
                    } as Record<string, number>)[st];
                    return (
                      <TableRow key={st} data-testid={`port-review-${st}`}>
                        <TableCell>{PORTFOLIO_REVIEW_LABEL[st]}</TableCell>
                        <TableCell className="text-right font-mono">
                          {dash(value)}<Bar value={value ?? 0} of={s.entity_total} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ------------------------------- supervisory consequence summary */}
          <Card data-testid="port-consequence-summary">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Open supervisory exposure</CardTitle>
              <CardDescription>
                Counts of open canonical supervisory records for the entities in this report.
                Restricted or confidential matters are excluded and reported as presence only.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['findings', 'Open findings', s.open_findings_total],
                ['examinations', 'Open examinations', s.open_examinations_total],
                ['interventions', 'Open interventions', s.open_interventions_total],
                ['enforcement', 'Open enforcement', s.open_enforcement_total],
              ].map(([k, label, value]) => (
                <div key={String(k)} data-testid={`port-exposure-${k}`} className="rounded-md border p-3">
                  <p className="text-sm text-muted-foreground">{String(label)}</p>
                  <p className="font-mono text-xl">{dash(value)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* -------------------------------- AML-11 outcome effectiveness counts */}
          <Card data-testid="port-outcome-summary">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Supervisory outcome and effectiveness</CardTitle>
              <CardDescription>
                {dash(data.outcome_summary?.note)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['completed', 'Completed actions', data.outcome_summary?.completed_actions_total],
                ['pending', 'Evaluations pending', data.outcome_summary?.evaluations_pending_total],
                ['effective', 'Effective', data.outcome_summary?.effective_total],
                ['partial', 'Partially effective', data.outcome_summary?.partially_effective_total],
                ['ineffective', 'Ineffective', data.outcome_summary?.ineffective_total],
                ['inconclusive', 'Inconclusive', data.outcome_summary?.inconclusive_total],
                ['unevaluated', 'Unevaluated actions', data.outcome_summary?.unevaluated_actions_total],
                ['legacy', 'Legacy lineage actions', data.outcome_summary?.legacy_lineage_actions_total],
              ].map(([k, label, value]) => (
                <div key={String(k)} data-testid={`port-outcome-${k}`} className="rounded-md border p-3">
                  <p className="text-sm text-muted-foreground">{String(label)}</p>
                  <p className="font-mono text-xl">{dash(value)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* --------------------------------------------------- trends */}
          <Card data-testid="port-trends">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Risk movement trend</CardTitle>
              <CardDescription>
                Built only from the immutable risk movement history between{' '}
                {dash(data.trends?.period_from)} and {dash(data.trends?.period_to)}. Historical
                values are never reconstructed from current records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3" data-testid="port-trend-upward">
                  <p className="text-sm text-muted-foreground">{MOVEMENT_DIRECTION_LABEL.UPWARD}</p>
                  <p className="font-mono text-xl">{dash(data.trends?.upward_movements)}</p>
                </div>
                <div className="rounded-md border p-3" data-testid="port-trend-downward">
                  <p className="text-sm text-muted-foreground">{MOVEMENT_DIRECTION_LABEL.DOWNWARD}</p>
                  <p className="font-mono text-xl">{dash(data.trends?.downward_movements)}</p>
                </div>
                <div className="rounded-md border p-3" data-testid="port-trend-unchanged">
                  <p className="text-sm text-muted-foreground">{MOVEMENT_DIRECTION_LABEL.UNCHANGED}</p>
                  <p className="font-mono text-xl">{dash(data.trends?.unchanged_movements)}</p>
                </div>
              </div>

              {(data.trends?.movements ?? []).length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground" data-testid="port-trends-empty">
                  No risk movement was recorded in this period.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.trends.movements.map((m) => (
                      <TableRow key={m.movement_id} data-testid={`port-movement-${m.movement_id}`}>
                        <TableCell>
                          <Link className="underline" to={`/entities/${m.entity_id}`}>
                            {dash(m.entity_name)}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{dash(m.occurred_on)}</TableCell>
                        <TableCell className="font-mono text-xs">{dash(m.previous_rating)}</TableCell>
                        <TableCell className="font-mono text-xs">{dash(m.new_rating)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {MOVEMENT_DIRECTION_LABEL[m.direction] ?? m.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.legacy_movement ? 'Legacy movement — no governed publication'
                            : m.source_publication_id ? 'Published risk-of-record'
                            : 'Approved assessment'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* -------------------------------------------------- entity table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Entities under AML/CFT supervision</CardTitle>
              <CardDescription>
                {data.row_count} row{data.row_count === 1 ? '' : 's'} returned by the server for the
                applied filters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(data.entities ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground" data-testid="port-entities-empty">
                  No entity in your supervisory scope matches these filters.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entity</TableHead>
                        <TableHead>Current risk</TableHead>
                        <TableHead>Provenance</TableHead>
                        <TableHead>Effective</TableHead>
                        <TableHead>Assessment</TableHead>
                        <TableHead>Review status</TableHead>
                        <TableHead>Next review</TableHead>
                        <TableHead className="text-right">Open consequences</TableHead>
                        <TableHead className="text-right">Findings / Exams / Interventions / Enforcement</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.entities.map((r) => (
                        <TableRow key={r.entity_id} data-testid={`port-entity-${r.entity_id}`}>
                          <TableCell>
                            <Link className="font-medium underline" to={`/entities/${r.entity_id}`}>
                              {dash(r.entity_name)}
                            </Link>
                            {r.restricted_matter_present ? (
                              <Badge variant="outline" className="ml-2"
                                data-testid={`port-restricted-${r.entity_id}`}>
                                <ShieldAlert className="mr-1 h-3 w-3" /> Restricted matter withheld
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono">{dash(r.current_risk)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {PROVENANCE_BUCKET_LABEL[r.provenance_bucket] ?? r.provenance_bucket}
                            </Badge>
                            {(r.reason_codes ?? []).map((rc) => (
                              <span key={`${rc.field}-${rc.code}`}
                                className="mt-1 block text-xs text-muted-foreground">
                                {PORTFOLIO_REASON_LABEL[rc.code] ?? rc.detail}
                              </span>
                            ))}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {dash(r.effective_from)}
                            {r.risk_age_days === null || r.risk_age_days === undefined ? null : (
                              <span className="block text-muted-foreground">
                                {r.risk_age_days} day{r.risk_age_days === 1 ? '' : 's'} old
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.routes?.assessment ? (
                              <Link className="underline" to={r.routes.assessment}>
                                {dash(r.assessment_reference ?? r.assessment_status)}
                              </Link>
                            ) : dash(null)}
                            <span className="block text-muted-foreground">{dash(r.assessment_status)}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {PORTFOLIO_REVIEW_LABEL[r.monitoring_state] ?? r.monitoring_state}
                            </Badge>
                            {r.open_reassessment_id ? (
                              <span className="mt-1 block text-xs text-muted-foreground"
                                data-testid={`port-reassessment-${r.entity_id}`}>
                                Reassessment already open
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{dash(r.next_review_date)}</TableCell>
                          <TableCell className="text-right font-mono">{dash(r.open_consequence_count)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <Link className="underline" to={r.routes?.findings ?? '#'}>{r.open_findings}</Link>
                            {' / '}
                            <Link className="underline" to={r.routes?.examinations ?? '#'}>{r.open_examinations}</Link>
                            {` / ${r.open_interventions} / ${r.open_enforcement}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ------------------------------------------------------- notes */}
          <Card>
            <CardContent className="space-y-2 pt-5" data-testid="port-notes">
              {(data.notes ?? []).map((n) => (
                <p key={n} className="text-xs text-muted-foreground">{n}</p>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
