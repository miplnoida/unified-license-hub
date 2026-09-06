/**
 * OS-02E — Continuous Detection & Trigger Governance.
 *
 * Detection publishes conditions observed in canonical records; it never
 * assesses risk and never creates supervisory action. Every row states the
 * source record, the observed value, the applicable threshold, why it is
 * material and the detector configuration version that applied. Supervisors
 * decide what happens next through the existing governed monitoring actions.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, PlayCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/hooks/use-toast';
import {
  formatDetected,
  formatDetectedAt,
  useDetectionHealth,
  useDetectionRegister,
  useDetectorAssurance,
  useRunDetection,
  type DetectedCondition,
  type DetectionHealth,
} from '@/hooks/useSupervisoryDetection';

const DOMAINS = ['PRUDENTIAL', 'AML_CFT', 'MARKET_CONDUCT', 'OPERATIONAL_RESILIENCE', 'GOVERNANCE', 'CYBER', 'CROSS_DOMAIN'];

const SEVERITY_TONE: Record<string, string> = {
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
  high: 'bg-warning/15 text-warning-foreground border-warning/30',
  medium: 'bg-muted text-foreground border-border',
  low: 'bg-success/10 text-success border-success/20',
};

function humanise(value: string | null | undefined) {
  if (!value) return '—';
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`font-mono text-xl ${tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-warning-foreground' : ''}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function RunHealthPanel({ health, loading }: { health?: DetectionHealth; loading: boolean }) {
  if (loading) return <Skeleton className="h-24 w-full" />;
  if (!health) return null;
  const attempted = health.last_attempted_run;
  const scheduled = health.last_successful_scheduled_run;
  const attention = health.detectors_needing_attention ?? [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Automatic run health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Last successful automatic run</div>
            <div className="font-mono text-xs">{formatDetectedAt(scheduled?.completed_at)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Last run attempted</div>
            <div className="font-mono text-xs">{formatDetectedAt(attempted?.started_at)}</div>
            <div className="text-xs">
              {attempted ? (
                <Badge
                  variant="outline"
                  className={attempted.status === 'COMPLETED'
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-destructive/15 text-destructive border-destructive/30'}
                >
                  {humanise(attempted.status)}{attempted.trigger_kind ? ` · ${humanise(attempted.trigger_kind)}` : ''}
                </Badge>
              ) : 'No run recorded yet'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Next automatic run</div>
            <div className="font-mono text-xs">
              {health.schedule ? formatDetectedAt(health.next_scheduled_at) : 'No schedule registered'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Running now</div>
            <div className="font-mono text-xs">{health.runs_in_progress}</div>
          </div>
        </div>

        {attention.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" /> Detectors needing administrator attention
            </div>
            <ul className="mt-1 space-y-1 text-xs">
              {attention.map((a) => (
                <li key={a.detector_code}>
                  <span className="font-mono">{a.detector_code}</span> — {humanise(a.reason)}
                  {a.error_text ? `: ${a.error_text}` : ''}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              A run that did not complete successfully never closes a condition, so open conditions from these
              detectors remain as last observed.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConditionRow({ row }: { row: DetectedCondition }) {
  const provenance = row.config_provenance ?? {};
  return (
    <TableRow>
      <TableCell className="align-top">
        <div className="text-sm font-medium">{row.entity_name ?? 'Entity not recorded'}</div>
        <div className="text-xs text-muted-foreground">{humanise(row.domain_code)}</div>
      </TableCell>
      <TableCell className="align-top">
        <div className="text-sm">{row.summary ?? '—'}</div>
        <div className="text-xs text-muted-foreground">
          {row.source_table}
          {row.source_reference ? ` · ${row.source_reference}` : ''}
        </div>
      </TableCell>
      <TableCell className="align-top">
        <Badge variant="outline" className={SEVERITY_TONE[(row.severity ?? '').toLowerCase()] ?? ''}>
          {humanise(row.severity)}
        </Badge>
      </TableCell>
      <TableCell className="align-top font-mono text-xs">
        {row.observed_value ?? '—'}
        {row.threshold_value !== null && row.threshold_value !== undefined
          ? ` ${row.comparator ?? 'vs'} ${row.threshold_value}`
          : ''}
      </TableCell>
      <TableCell className="align-top">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs underline decoration-dotted">
              {row.materiality_reason ? 'Why it matters' : 'Not stated'}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="max-w-xs space-y-1 text-xs">
              <div>{row.materiality_reason ?? 'No materiality reason recorded.'}</div>
              <div className="text-muted-foreground">
                Detector {String(provenance['detector_code'] ?? row.detector_code ?? '—')} v
                {String(provenance['detector_version'] ?? '—')} · owner {String(provenance['config_owner'] ?? '—')}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="align-top font-mono text-xs">
        <div>{formatDetected(row.first_detected_at)}</div>
        <div className="text-muted-foreground">last {formatDetected(row.last_detected_at)} · ×{row.occurrence_count}</div>
      </TableCell>
      <TableCell className="align-top text-xs">
        {row.state === 'RESOLVED' ? (
          <span className="text-muted-foreground">
            Closed {formatDetected(row.resolved_at)}
            <div>{humanise(row.resolution_reason)}</div>
          </span>
        ) : row.reviewed ? (
          <span className="text-success">Supervisor reviewed</span>
        ) : (
          <span className="text-warning-foreground">Awaiting supervisory review</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function DetectionGovernance() {
  const { toast } = useToast();
  const [domain, setDomain] = useState('all');
  const [state, setState] = useState<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN');
  const [search, setSearch] = useState('');

  const register = useDetectionRegister(domain === 'all' ? null : domain, state, 500);
  const assurance = useDetectorAssurance();
  const run = useRunDetection();

  const rows = useMemo(() => {
    const all = register.data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) =>
      (r.entity_name ?? '').toLowerCase().includes(q)
      || (r.summary ?? '').toLowerCase().includes(q)
      || (r.detector_code ?? '').toLowerCase().includes(q));
  }, [register.data, search]);

  const health = useDetectionHealth();

  const summary = useMemo(() => {
    const all = register.data?.rows ?? [];
    return {
      total: all.length,
      unreviewed: all.filter((r) => r.state === 'OPEN' && !r.reviewed).length,
      severe: all.filter((r) => ['critical', 'high'].includes((r.severity ?? '').toLowerCase())).length,
      recurring: all.filter((r) => r.occurrence_count > 1).length,
    };
  }, [register.data]);

  const onRun = async () => {
    try {
      const result = await run.mutateAsync(null);
      const detectors = result?.detectors ?? [];
      const created = detectors.reduce((n, d) => n + Number(d['signals_created'] ?? 0), 0);
      const resolved = detectors.reduce((n, d) => n + Number(d['signals_resolved'] ?? 0), 0);
      toast({
        title: 'Detection run complete',
        description: `${detectors.length} detectors ran · ${created} new conditions · ${resolved} closed automatically.`,
      });
    } catch (error) {
      toast({
        title: 'Detection run failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Detection & Trigger Governance"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => register.refetch()} disabled={register.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${register.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={onRun} disabled={run.isPending}>
              <PlayCircle className={`mr-2 h-4 w-4 ${run.isPending ? 'animate-pulse' : ''}`} />
              Run detection now
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Detected conditions" value={summary.total} />
        <Kpi label="Awaiting supervisory review" value={summary.unreviewed} tone="warn" />
        <Kpi label="High or critical" value={summary.severe} tone="bad" />
        <Kpi label="Recurring (seen more than once)" value={summary.recurring} />
      </div>

      <RunHealthPanel health={health.data} loading={health.isLoading} />

      <Tabs defaultValue="conditions">
        <TabsList>
          <TabsTrigger value="conditions">Detected conditions</TabsTrigger>
          <TabsTrigger value="detectors">Detector governance</TabsTrigger>
        </TabsList>

        <TabsContent value="conditions" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entity, condition or detector"
              className="h-9 w-full sm:w-80"
            />
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger className="h-9 w-[13rem]" aria-label="Supervisory area"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All supervisory areas</SelectItem>
                {DOMAINS.map((d) => <SelectItem key={d} value={d}>{humanise(d)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={state} onValueChange={(v) => setState(v as 'OPEN' | 'RESOLVED' | 'ALL')}>
              <SelectTrigger className="h-9 w-[11rem]" aria-label="Condition state"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Currently present</SelectItem>
                <SelectItem value="RESOLVED">No longer present</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {register.isLoading ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No detected conditions for this selection.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entity</TableHead>
                        <TableHead>Condition &amp; source record</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Observed vs threshold</TableHead>
                        <TableHead>Materiality</TableHead>
                        <TableHead>First / last seen</TableHead>
                        <TableHead>Review state</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => <ConditionRow key={r.signal_id} row={r} />)}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Detection reports what is present in the canonical records. It does not change a risk rating and does not
            create supervisory action — a supervisor decides that from Continuous Monitoring.
          </p>
        </TabsContent>

        <TabsContent value="detectors">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" /> Governed detectors
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {assurance.isLoading ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Detector</TableHead>
                        <TableHead>Area</TableHead>
                        <TableHead>Source record</TableHead>
                        <TableHead>Configuration owner</TableHead>
                        <TableHead>Version / effective</TableHead>
                        <TableHead>Open / closed</TableHead>
                        <TableHead>Last run</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(assurance.data?.detectors ?? []).map((d) => (
                        <TableRow key={d.code}>
                          <TableCell className="align-top">
                            <div className="text-sm font-medium">{d.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{d.code}</div>
                          </TableCell>
                          <TableCell className="align-top text-xs">{humanise(d.domain_code)}</TableCell>
                          <TableCell className="align-top font-mono text-xs">{d.source_object}</TableCell>
                          <TableCell className="align-top text-xs">{humanise(d.config_owner)}</TableCell>
                          <TableCell className="align-top font-mono text-xs">
                            v{d.version} · {formatDetected(d.effective_from)}
                            {d.is_active ? '' : ' (inactive)'}
                          </TableCell>
                          <TableCell className="align-top font-mono text-xs">
                            {d.open_signals} / {d.resolved_signals}
                          </TableCell>
                          <TableCell className="align-top text-xs">
                            {d.last_run ? (
                              <div>
                                <div>{formatDetected(d.last_run.started_at)} · {humanise(d.last_run.status)}</div>
                                <div className="text-muted-foreground">
                                  scanned {d.last_run.rows_scanned} · new {d.last_run.signals_created} · closed {d.last_run.signals_resolved}
                                </div>
                                {d.last_run.error_text ? (
                                  <div className="flex items-center gap-1 text-destructive">
                                    <AlertTriangle className="h-3 w-3" /> {d.last_run.error_text}
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Never run</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
