/**
 * MC-11 — Supervisory Management Reporting workspace.
 *
 * Everything on this page is deterministic management information calculated by
 * the server for the reporting scope in view. The browser derives no figure. Each
 * published measure carries its definition and can be drilled through to the exact
 * contributing records, so a reported number can always be defended.
 *
 * Evidence packs are immutable, versioned and signed by the server. AI narrative
 * assistance sits below the facts, is clearly separated from them, and enters a
 * report only after a supervisor reviews and adopts it.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Download, ExternalLink, FileText, Loader2, Minus, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/useCan';
import { useSectors } from '@/hooks/useMasterConfig';
import { formatDateTime } from '@/lib/datetime';
import { ReportingAdvisoryPanel } from '@/components/conduct/reporting/ReportingAdvisoryPanel';
import { REPORTING_ADVISORY_USE_CASES, EVIDENCE_PACK_ADVISORY_USE_CASES } from '@/lib/conductAdvisoryLabels';
import {
  useEvidencePack, useEvidencePacks, useGenerateEvidencePack, useLogPackExport,
  useMIDashboard, useMIDrilldown, useMIEntityCoverage, useMIOutcomeReporting, useMIPeriodCompare,
  useMIRiskReporting, useMISectorCoverage,
  type MIScope, type MIDefinition,
} from '@/hooks/useConductMI';

/* ------------------------------------------------------------- utilities */

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

const GROUP_LABELS: Record<string, string> = {
  intake: 'Intake and demand',
  casework: 'Casework and investigation',
  outcomes: 'Outcomes and redress',
  signals: 'Signals and patterns',
  risk: 'Emerging risk',
  planning: 'Planning and attention',
  intervention: 'Interventions',
  enforcement: 'Enforcement',
  timeliness: 'Timeliness',
  coverage: 'Supervisory coverage',
  governance: 'Governance and assurance',
};

const groupLabel = (key: string) =>
  GROUP_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function ScopeSummary({ scope }: { scope?: { sectors_in_view?: string[]; sector_scope?: string; entity_population?: number; period_start?: string; period_end?: string; calculated_at?: string } }) {
  if (!scope) return null;
  const sectors = scope.sectors_in_view ?? [];
  return (
    <p className="text-xs text-muted-foreground">
      {scope.entity_population ?? 0} authorised entities in scope ·{' '}
      {scope.sector_scope === 'all_authorised'
        ? 'all sectors within your remit'
        : `${sectors.length} sector${sectors.length === 1 ? '' : 's'}: ${sectors.slice(0, 6).join(', ')}${sectors.length > 6 ? '…' : ''}`}
      {scope.calculated_at ? ` · calculated ${formatDateTime(scope.calculated_at)}` : ''}
    </p>
  );
}

function DefinitionBlock({ definition }: { definition: MIDefinition }) {
  return (
    <dl className="grid gap-2 text-xs sm:grid-cols-2">
      <div className="sm:col-span-2">
        <dt className="font-medium">What this measure means</dt>
        <dd className="text-muted-foreground">{definition.business_meaning ?? 'Not stated.'}</dd>
      </div>
      <div>
        <dt className="font-medium">Counted from</dt>
        <dd className="text-muted-foreground">{definition.source_object ?? 'Not stated.'}</dd>
      </div>
      <div>
        <dt className="font-medium">Time basis</dt>
        <dd className="text-muted-foreground">{definition.time_basis ?? 'Not stated.'}</dd>
      </div>
      <div>
        <dt className="font-medium">Included</dt>
        <dd className="text-muted-foreground">{definition.inclusion_criteria ?? 'Not stated.'}</dd>
      </div>
      <div>
        <dt className="font-medium">Excluded</dt>
        <dd className="text-muted-foreground">{definition.exclusion_criteria ?? 'Nothing excluded.'}</dd>
      </div>
      {definition.calculation_note && (
        <div className="sm:col-span-2">
          <dt className="font-medium">Note</dt>
          <dd className="text-muted-foreground">{definition.calculation_note}</dd>
        </div>
      )}
    </dl>
  );
}

/* ------------------------------------------------------------------ page */

export default function ManagementReporting() {
  const navigate = useNavigate();
  const canAnalytics = useCan('market_conduct', 'run_conduct_analytics');
  const { data: sectors = [] } = useSectors();

  const [periodStart, setPeriodStart] = useState(isoDaysAgo(90));
  const [periodEnd, setPeriodEnd] = useState(today());
  const [sector, setSector] = useState('all');
  const [drilldownCode, setDrilldownCode] = useState<string | null>(null);
  const [packId, setPackId] = useState<string | null>(null);
  const [packType, setPackType] = useState('SECTOR_PERIOD');
  const [packLabel, setPackLabel] = useState('');

  const scope: MIScope = useMemo(() => ({
    periodStart,
    periodEnd,
    sectorId: sector === 'all' ? null : sector,
    regulatorId: null,
  }), [periodStart, periodEnd, sector]);

  const periodValid = periodEnd >= periodStart;

  const dashboard = useMIDashboard(scope, periodValid);
  const compare = useMIPeriodCompare(scope, periodValid);
  const sectorCoverage = useMISectorCoverage(scope, periodValid);
  const entityCoverage = useMIEntityCoverage(scope, periodValid);
  const riskReporting = useMIRiskReporting(scope, periodValid);
  const outcomeReporting = useMIOutcomeReporting(scope, periodValid);
  const drilldown = useMIDrilldown(drilldownCode, scope);
  const packs = useEvidencePacks({ sectorId: scope.sectorId, regulatorId: null });
  const pack = useEvidencePack(packId);
  const generatePack = useGenerateEvidencePack();
  const logExport = useLogPackExport();

  const definitions = useMemo(() => {
    const map = new Map<string, MIDefinition>();
    for (const d of dashboard.data?.definitions ?? []) map.set(d.code, d);
    return map;
  }, [dashboard.data]);

  const movements = useMemo(() => {
    const rows = compare.data?.comparisons ?? [];
    return [...rows].sort((a, b) => Math.abs(b.absolute_change) - Math.abs(a.absolute_change));
  }, [compare.data]);

  const handleGeneratePack = async () => {
    try {
      await generatePack.mutateAsync({
        packType,
        subjectKey: `${periodStart}:${periodEnd}`,
        subjectLabel: packLabel.trim() || `Management reporting ${periodStart} to ${periodEnd}`,
        periodStart,
        periodEnd,
        sectorId: scope.sectorId,
        regulatorId: null,
      });
      setPackLabel('');
      toast.success('An evidence pack version has been generated and signed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The evidence pack could not be generated.');
    }
  };

  const handleExport = async () => {
    const current = pack.data;
    if (!current) return;
    try {
      await logExport.mutateAsync({
        packId: current.pack.id,
        version: current.version.version,
        format: 'json',
        scope: { period_start: periodStart, period_end: periodEnd },
      });
      const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${current.pack.reference}-v${current.version.version}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('The export has been recorded against this pack version.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The export could not be recorded.');
    }
  };

  const loadError = dashboard.isError;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Management reporting"
          description="Regulatory management information for market conduct, calculated by the platform from the supervisory record. Every figure is defined, reconcilable and traceable to the records behind it."
        />

        {/* ------------------------------------------------- reporting scope */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Reporting scope</CardTitle>
            <CardDescription>
              The period and sector coverage that every figure below is calculated for.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="mi-start">Period start</Label>
                <Input id="mi-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="mi-end">Period end</Label>
                <Input id="mi-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
              <div>
                <Label>Sector</Label>
                <Select value={sector} onValueChange={setSector}>
                  <SelectTrigger><SelectValue placeholder="All sectors in your remit" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sectors in your remit</SelectItem>
                    {sectors.map((s: { id: string; name: string }) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="text-xs text-muted-foreground">
                  {dashboard.data?.definition_version && (
                    <p>Measure definitions in force: <span className="font-mono">{dashboard.data.definition_version}</span></p>
                  )}
                  {dashboard.data?.facts_signature && (
                    <p className="truncate">Figures signature: <span className="font-mono">{dashboard.data.facts_signature.slice(0, 16)}…</span></p>
                  )}
                </div>
              </div>
            </div>
            {!periodValid && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  The period end falls before the period start. Correct the dates to calculate the figures.
                </AlertDescription>
              </Alert>
            )}
            <ScopeSummary scope={dashboard.data?.scope} />
          </CardContent>
        </Card>

        {loadError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Management information could not be calculated</AlertTitle>
            <AlertDescription className="text-xs">
              This may be because the reporting scope sits outside your supervisory remit. No figure is shown rather
              than an incomplete one.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="mi" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="mi">Management information</TabsTrigger>
            <TabsTrigger value="movement">Period movement</TabsTrigger>
            <TabsTrigger value="coverage">Supervisory coverage</TabsTrigger>
            <TabsTrigger value="risk">Risk and outcomes</TabsTrigger>
            <TabsTrigger value="packs">Evidence packs</TabsTrigger>
            <TabsTrigger value="narratives">AI narratives</TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------------ measures */}
          <TabsContent value="mi" className="space-y-4">
            {dashboard.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              Object.entries(dashboard.data?.metric_groups ?? {}).map(([group, metrics]) => (
                <Card key={group}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{groupLabel(group)}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Measure</TableHead>
                          <TableHead>What it counts</TableHead>
                          <TableHead className="w-24 text-right">Value</TableHead>
                          <TableHead className="w-32" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(metrics).map(([code, value]) => {
                          const def = definitions.get(code);
                          return (
                            <TableRow key={code}>
                              <TableCell className="text-sm font-medium">{def?.name ?? code}</TableCell>
                              <TableCell className="max-w-[34rem] text-xs text-muted-foreground">
                                {def?.business_meaning ?? 'Definition not published.'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">{value}</TableCell>
                              <TableCell>
                                {def?.drilldown_supported !== false && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => setDrilldownCode(code)}
                                  >
                                    <Search className="mr-1.5 h-3.5 w-3.5" />
                                    Show records
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ------------------------------------------------------ movement */}
          <TabsContent value="movement" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Movement against the preceding period</CardTitle>
                <CardDescription>
                  {compare.data
                    ? `${compare.data.current_period.start} to ${compare.data.current_period.end} compared with ${compare.data.previous_period.start} to ${compare.data.previous_period.end}, an equal number of days.`
                    : 'Only period-basis measures can be compared.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {compare.isLoading ? (
                  <Skeleton className="m-4 h-48" />
                ) : movements.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground">No comparable measures for this period.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Measure</TableHead>
                        <TableHead className="w-24 text-right">Previous</TableHead>
                        <TableHead className="w-24 text-right">Current</TableHead>
                        <TableHead className="w-28 text-right">Change</TableHead>
                        <TableHead>Interpretation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((row) => {
                        const Icon = row.absolute_change > 0 ? ArrowUpRight : row.absolute_change < 0 ? ArrowDownRight : Minus;
                        return (
                          <TableRow key={row.code}>
                            <TableCell className="text-sm font-medium">{row.name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{row.previous_value}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{row.current_value}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              <span className="inline-flex items-center gap-1">
                                <Icon className="h-3.5 w-3.5" />
                                {row.absolute_change > 0 ? '+' : ''}{row.absolute_change}
                                {row.percentage_change !== null && !row.interpretation_limited
                                  ? ` (${row.percentage_change}%)`
                                  : ''}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[26rem] text-xs text-muted-foreground">
                              {row.limitation ?? 'Movement shown as recorded. A movement is not automatically material.'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------------ coverage */}
          <TabsContent value="coverage" className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm">How to read coverage</AlertTitle>
              <AlertDescription className="text-xs">
                {sectorCoverage.data?.basis ??
                  'Coverage states are derived from recorded supervisory activity only. An entity with no recorded activity is not an assessed low-risk entity.'}
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Coverage by sector</CardTitle></CardHeader>
              <CardContent className="p-0">
                {sectorCoverage.isLoading
                  ? <Skeleton className="m-4 h-40" />
                  : <RecordGrid rows={sectorCoverage.data?.sectors ?? []} emptyText="No sector coverage recorded for this period." />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Coverage by entity</CardTitle></CardHeader>
              <CardContent className="p-0">
                {entityCoverage.isLoading
                  ? <Skeleton className="m-4 h-40" />
                  : <RecordGrid rows={entityCoverage.data?.entities ?? []} emptyText="No entity coverage recorded for this period." />}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------- risk/outcomes */}
          <TabsContent value="risk" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Emerging risks in the period</CardTitle>
                <CardDescription>{riskReporting.data?.basis ?? ''}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {riskReporting.isLoading
                  ? <Skeleton className="m-4 h-40" />
                  : <RecordGrid rows={riskReporting.data?.risks ?? []} emptyText="No emerging risk was open in this period." />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Interventions and outcomes</CardTitle>
                <CardDescription>{outcomeReporting.data?.basis ?? ''}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {outcomeReporting.isLoading
                  ? <Skeleton className="m-4 h-40" />
                  : <RecordGrid rows={outcomeReporting.data?.interventions ?? []} emptyText="No intervention was live or completed in this period." />}
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------------------------------------------------------- packs */}
          <TabsContent value="packs" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evidence packs</CardTitle>
                <CardDescription>
                  A pack version is an immutable, signed snapshot of the figures and the records behind them, assembled
                  by the platform. Regenerating never overwrites an earlier version.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {canAnalytics && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>Pack type</Label>
                      <Select value={packType} onValueChange={setPackType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SECTOR_PERIOD">Sector reporting period</SelectItem>
                          <SelectItem value="MANAGEMENT_REPORT">Management report</SelectItem>
                          <SelectItem value="BOARD_REPORT">Board report</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="pack-label">Pack label</Label>
                      <Input
                        id="pack-label"
                        value={packLabel}
                        onChange={(e) => setPackLabel(e.target.value)}
                        placeholder={`Management reporting ${periodStart} to ${periodEnd}`}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={handleGeneratePack} disabled={generatePack.isPending || !periodValid}>
                        {generatePack.isPending
                          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          : <FileText className="mr-2 h-4 w-4" />}
                        Generate pack version
                      </Button>
                    </div>
                  </div>
                )}

                {packs.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (packs.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No evidence pack has been generated within your remit.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead className="w-20 text-right">Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-28" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(packs.data ?? []).map((p) => (
                        <TableRow key={p.id} className={packId === p.id ? 'bg-muted/40' : undefined}>
                          <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                          <TableCell className="max-w-[22rem] truncate text-sm">{p.subject_label ?? '—'}</TableCell>
                          <TableCell className="text-xs">{p.period_start ?? '—'} → {p.period_end ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{p.current_version}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[11px]">{p.status}</Badge></TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPackId(p.id)}>
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {packId && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">
                        {pack.data?.pack.reference ?? 'Evidence pack'} — version {pack.data?.version.version ?? '—'}
                      </CardTitle>
                      <CardDescription>
                        {pack.data
                          ? `Signed ${formatDateTime(pack.data.version.generated_at)} · signature ${pack.data.version.facts_signature.slice(0, 16)}…`
                          : 'Loading the pack version.'}
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={!pack.data || logExport.isPending}>
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Export and record
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pack.isLoading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : pack.isError ? (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        This pack could not be opened. It may sit outside your authorised sectors.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div>
                        <h4 className="mb-2 text-sm font-semibold">Version history</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-20">Version</TableHead>
                              <TableHead>Generated</TableHead>
                              <TableHead>Signature</TableHead>
                              <TableHead>Reason for regeneration</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(pack.data?.versions ?? []).map((v) => (
                              <TableRow key={v.version}>
                                <TableCell className="font-mono text-xs">{v.version}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(v.generated_at)}</TableCell>
                                <TableCell className="font-mono text-[11px]">{v.facts_signature.slice(0, 20)}…</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{v.regeneration_reason ?? 'Original version.'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div>
                        <h4 className="mb-2 text-sm font-semibold">Figures held in this version</h4>
                        <pre className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-3 text-[11px]">
                          {JSON.stringify(pack.data?.version.metrics ?? {}, null, 2)}
                        </pre>
                      </div>
                    </>
                  )}

                  {pack.data && (
                    <ReportingAdvisoryPanel
                      scope={scope}
                      useCases={EVIDENCE_PACK_ADVISORY_USE_CASES}
                      canOperate={canAnalytics}
                      pack={{
                        id: pack.data.pack.id,
                        version: pack.data.version.version,
                        reference: pack.data.pack.reference,
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ---------------------------------------------------- narratives */}
          <TabsContent value="narratives" className="space-y-4">
            <ReportingAdvisoryPanel
              scope={scope}
              useCases={REPORTING_ADVISORY_USE_CASES}
              canOperate={canAnalytics}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* ------------------------------------------------------- drill-down */}
      <Dialog open={Boolean(drilldownCode)} onOpenChange={(open) => { if (!open) setDrilldownCode(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{drilldown.data?.metric.name ?? 'Measure'}</DialogTitle>
            <DialogDescription>
              {drilldown.data
                ? `${drilldown.data.value} record${drilldown.data.value === 1 ? '' : 's'} contribute to this figure. ${drilldown.data.returned} shown.`
                : 'Loading the contributing records.'}
            </DialogDescription>
          </DialogHeader>

          {drilldown.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : drilldown.isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">The contributing records could not be listed.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {drilldown.data && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <DefinitionBlock definition={drilldown.data.metric} />
                </div>
              )}
              <div className="max-h-[24rem] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Recorded</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(drilldown.data?.records ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.reference ?? '—'}</TableCell>
                        <TableCell className="max-w-[24rem] truncate text-sm">{r.title ?? '—'}</TableCell>
                        <TableCell className="text-xs">{r.record_type}</TableCell>
                        <TableCell className="text-xs">{r.occurred_at ? formatDateTime(r.occurred_at) : '—'}</TableCell>
                        <TableCell>
                          {r.route && (
                            <Button variant="ghost" size="icon" aria-label="Open record" onClick={() => navigate(r.route!)}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(drilldown.data?.records ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="p-4 text-xs text-muted-foreground">
                          No record contributes to this figure in the selected period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

/* --------------------------------------------------------- generic table */

/**
 * Renders a server-prepared row set without reshaping it. The server decides
 * which columns a reporting view carries, so the UI never invents, renames or
 * recomputes one.
 */
function RecordGrid({ rows, emptyText }: { rows: Record<string, unknown>[]; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="p-4 text-xs text-muted-foreground">{emptyText}</p>;
  }
  const columns = Object.keys(rows[0]).filter((c) => !c.endsWith('_id'));
  const label = (c: string) => c.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  const cell = (v: unknown) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.length === 0 ? '—' : v.map(String).join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => <TableHead key={c}>{label(c)}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c} className="max-w-[20rem] truncate text-xs">{cell(row[c])}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
