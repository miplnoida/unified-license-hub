/**
 * MC-09 — Cross-Entity Supervisory Intelligence workspace.
 *
 * Two deterministic fact packs, prepared by the server for the chosen theme,
 * sector and window:
 *   Theme position     — recorded complaints, signals, patterns and the entities
 *                        affected, with movement against the preceding window.
 *   Cross-entity view  — each entity's recorded counts placed against the sector
 *                        median and upper quartile. Positional only: never a
 *                        rating, score or finding, and no entity is ranked as an
 *                        offender.
 * AI assistance sits below the facts, is clearly separated, and requires human
 * review. Raising a risk from what is seen here is always an explicit officer
 * action — nothing is created automatically.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, ExternalLink, Loader2, Minus, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/useCan';
import { useSectors } from '@/hooks/useMasterConfig';
import { formatDateTime } from '@/lib/datetime';
import {
  riskErrorMessage, useConductThemes, useCreateEmergingRisk, useCrossEntityComparison,
  useThemeSnapshot, type IntelFactItem,
} from '@/hooks/useConductEmergingRisk';
import { IntelAdvisoryPanel } from '@/components/conduct/intelligence/IntelAdvisoryPanel';
import { THEME_ADVISORY_USE_CASES } from '@/lib/conductAdvisoryLabels';

const WINDOWS = [
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: '365', label: 'Last 12 months' },
  { value: '730', label: 'Last 24 months' },
];

const MOVEMENT_ICON = {
  increase: ArrowUpRight,
  decrease: ArrowDownRight,
  unchanged: Minus,
} as const;

function FactRows({ items, emptyText }: { items: IntelFactItem[]; emptyText: string }) {
  const navigate = useNavigate();
  if (items.length === 0) {
    return <p className="p-4 text-xs text-muted-foreground">{emptyText}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reference</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Entity</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Recorded</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.slice(0, 50).map((item, idx) => (
          <TableRow key={`${item.reference ?? idx}-${idx}`}>
            <TableCell className="font-mono text-xs">{item.reference ?? '—'}</TableCell>
            <TableCell className="max-w-[26rem] truncate text-sm">{item.title ?? '—'}</TableCell>
            <TableCell className="text-sm">{item.licensee_name ?? '—'}</TableCell>
            <TableCell className="text-xs">{item.status ?? '—'}</TableCell>
            <TableCell className="text-xs">{item.recorded_at ? formatDateTime(item.recorded_at) : '—'}</TableCell>
            <TableCell>
              {item.href && (
                <Button variant="ghost" size="icon" onClick={() => navigate(item.href!)} aria-label="Open record">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function SupervisoryIntelligence() {
  const navigate = useNavigate();
  const canComplaints = useCan('market_conduct', 'manage_complaints');
  const canAnalytics = useCan('market_conduct', 'run_conduct_analytics');
  const canOperate = canComplaints || canAnalytics;

  const { data: sectors = [] } = useSectors();
  const themesQuery = useConductThemes();

  const [theme, setTheme] = useState<string>('');
  const [sector, setSector] = useState<string>('all');
  const [windowDays, setWindowDays] = useState<string>('180');

  const sectorId = sector === 'all' ? null : sector;
  const days = Number(windowDays);

  const themeQuery = useThemeSnapshot(theme || null, sectorId, days);
  const compareQuery = useCrossEntityComparison(sectorId, days);
  const createRisk = useCreateEmergingRisk();

  const [raiseOpen, setRaiseOpen] = useState(false);
  const [riskTitle, setRiskTitle] = useState('');
  const [riskBasis, setRiskBasis] = useState('');

  const snapshot = themeQuery.data;
  const comparison = compareQuery.data;

  const MovementIcon = snapshot ? MOVEMENT_ICON[snapshot.movement.direction] ?? Minus : Minus;

  const subject = useMemo(
    () => (theme ? ({ kind: 'sector_theme', theme, sectorId, windowDays: days } as const) : null),
    [theme, sectorId, days],
  );

  const openRaise = () => {
    if (!snapshot) return;
    setRiskTitle(`${snapshot.theme} — cross-entity conduct concern`);
    setRiskBasis('');
    setRaiseOpen(true);
  };

  const submitRaise = async () => {
    if (!snapshot) return;
    try {
      const result = await createRisk.mutateAsync({
        title: riskTitle.trim(),
        basis: riskBasis.trim(),
        summary: `Recorded position for ${snapshot.theme} over ${snapshot.window.days} days: `
          + `${snapshot.totals.complaints} complaints across ${snapshot.totals.entities} entities, `
          + `${snapshot.totals.signals} conduct signals and ${snapshot.totals.patterns} detected patterns.`,
        sector_id: sectorId,
        entity_count: snapshot.totals.entities,
        window_start: snapshot.window.from,
        window_end: snapshot.window.to,
        driver_metrics: {
          theme: snapshot.theme,
          complaints: snapshot.totals.complaints,
          entities: snapshot.totals.entities,
          signals: snapshot.totals.signals,
          patterns: snapshot.totals.patterns,
          movement: snapshot.movement,
        },
        fact_basis: {
          source: snapshot.provenance.source,
          generated_at: snapshot.generated_at,
          window: snapshot.window,
          comparison_window: snapshot.comparison_window,
          method: snapshot.method,
        },
      });
      toast.success(`Emerging conduct risk ${result.reference} recorded.`);
      setRaiseOpen(false);
      navigate(`/conduct/emerging-risks/${result.id}`);
    } catch (e) {
      toast.error(riskErrorMessage(String((e as Error).message ?? '')));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Supervisory Intelligence"
          description="Recorded conduct positions across entities, prepared by the platform for a chosen theme, sector and observation window. Everything shown is a count of records that already exist. Comparison against the sector is positional only — it is not a rating, score or finding, and no supervisory action is taken from this page automatically."
          actions={canOperate ? undefined : <Badge variant="outline">View only</Badge>}
        />

        <Card>
          <CardContent className="grid gap-4 p-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Conduct theme</Label>
              <Select value={theme || 'none'} onValueChange={(v) => setTheme(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Choose a theme" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose a theme</SelectItem>
                  {(themesQuery.data ?? []).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sector</Label>
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sectors in my remit</SelectItem>
                  {sectors.map((s: { id: string; name: string }) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observation window</Label>
              <Select value={windowDays} onValueChange={setWindowDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WINDOWS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate('/conduct/emerging-risks')}
              >
                Emerging risk register
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {(themeQuery.isError || compareQuery.isError) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">This view could not be prepared</AlertTitle>
            <AlertDescription className="text-xs">
              {riskErrorMessage(String(
                (themeQuery.error as Error)?.message ?? (compareQuery.error as Error)?.message ?? '',
              ))}
            </AlertDescription>
          </Alert>
        )}

        {/* ---------------------------------------------- theme position */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg">Theme position</CardTitle>
                <CardDescription>
                  {theme
                    ? `Recorded complaints, conduct signals and detected patterns for ${theme}, and the entities they concern.`
                    : 'Choose a conduct theme to see the recorded position across entities.'}
                </CardDescription>
              </div>
              <Badge variant="outline">Fact</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!theme ? (
              <p className="text-xs text-muted-foreground">No theme chosen.</p>
            ) : themeQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : snapshot ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Recorded complaints', value: snapshot.totals.complaints },
                    { label: 'Entities affected', value: snapshot.totals.entities },
                    { label: 'Conduct signals', value: snapshot.totals.signals },
                    { label: 'Detected patterns', value: snapshot.totals.patterns },
                  ].map((tile) => (
                    <div key={tile.label} className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">{tile.label}</p>
                      <p className="mt-1 font-mono text-2xl">{tile.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border p-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <MovementIcon className="h-4 w-4" />
                    Movement against the preceding window
                  </p>
                  <p className="mt-1 text-sm">
                    {snapshot.movement.complaints_current} recorded complaints in{' '}
                    {snapshot.window.from} to {snapshot.window.to}, against{' '}
                    {snapshot.movement.complaints_previous} in {snapshot.comparison_window.from} to{' '}
                    {snapshot.comparison_window.to} — a change of {snapshot.movement.complaints_change}.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{snapshot.movement.method}</p>
                </div>

                <div className="space-y-4">
                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Entities affected</h3>
                    {snapshot.entities.items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No entity has a recorded complaint for this theme in the window.</p>
                    ) : (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Entity</TableHead>
                              <TableHead className="text-right">Recorded complaints</TableHead>
                              <TableHead className="w-10" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {snapshot.entities.items.map((e) => (
                              <TableRow key={e.licensee_id ?? e.reference ?? ''}>
                                <TableCell className="text-sm">{e.reference}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{e.complaint_count ?? 0}</TableCell>
                                <TableCell>
                                  {e.href && (
                                    <Button variant="ghost" size="icon" onClick={() => navigate(e.href!)} aria-label="Open entity">
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Contributing complaints</h3>
                    <div className="rounded-md border">
                      <FactRows items={snapshot.complaints.items} emptyText="No complaint records for this theme in the window." />
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Related conduct signals</h3>
                    <div className="rounded-md border">
                      <FactRows items={snapshot.signals.items} emptyText="No conduct signals recorded for the entities concerned in the window." />
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Detected patterns</h3>
                    <div className="rounded-md border">
                      <FactRows items={snapshot.patterns.items} emptyText="No patterns detected for the entities concerned in the window." />
                    </div>
                  </section>
                </div>

                <p className="text-xs text-muted-foreground">{snapshot.method}</p>
                <p className="text-xs text-muted-foreground">Prepared {formatDateTime(snapshot.generated_at)}.</p>

                {canOperate && (
                  <Button onClick={openRaise}>
                    <ShieldAlert className="mr-1.5 h-4 w-4" />
                    Raise an emerging risk from this position
                  </Button>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* ------------------------------------------- cross-entity view */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg">Cross-entity comparison</CardTitle>
                <CardDescription>
                  Each entity's recorded counts placed against the sector median and upper quartile for the same window.
                  Positional comparison only — it is not a rating, a score or a finding about any entity.
                </CardDescription>
              </div>
              <Badge variant="outline">Fact</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {compareQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : comparison ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Entities with activity', value: comparison.sector_measures.population },
                    { label: 'Sector median complaints', value: comparison.sector_measures.median_complaints },
                    { label: 'Upper quartile', value: comparison.sector_measures.upper_quartile_complaints },
                    { label: 'Highest recorded', value: comparison.sector_measures.highest_complaints },
                  ].map((tile) => (
                    <div key={tile.label} className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">{tile.label}</p>
                      <p className="mt-1 font-mono text-2xl">{Number(tile.value ?? 0)}</p>
                    </div>
                  ))}
                </div>

                {comparison.entities.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No entity in scope has recorded conduct activity in this window.
                  </p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Entity</TableHead>
                          <TableHead className="text-right">Complaints</TableHead>
                          <TableHead className="text-right">Signals</TableHead>
                          <TableHead className="text-right">Patterns</TableHead>
                          <TableHead>Position against the sector</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparison.entities.map((e) => (
                          <TableRow key={e.licensee_id}>
                            <TableCell className="text-sm">{e.reference}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{e.complaints}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{e.signals}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{e.patterns}</TableCell>
                            <TableCell className="text-xs">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {e.above_upper_quartile && (
                                  <Badge variant="outline">Above the sector upper quartile</Badge>
                                )}
                                {!e.above_upper_quartile && e.above_sector_median && (
                                  <Badge variant="outline">Above the sector median</Badge>
                                )}
                                {!e.above_sector_median && (
                                  <Badge variant="outline">At or below the sector median</Badge>
                                )}
                              </div>
                              <p className="mt-1 text-muted-foreground">{e.comparison_note}</p>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => navigate(e.href)} aria-label="Open entity">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">{comparison.method}</p>
                <p className="text-xs text-muted-foreground">Prepared {formatDateTime(comparison.generated_at)}.</p>
              </>
            ) : null}
          </CardContent>
        </Card>

        <IntelAdvisoryPanel
          subject={subject}
          useCases={THEME_ADVISORY_USE_CASES}
          canOperate={canOperate}
          emptySubjectMessage="Choose a conduct theme above before asking for AI assistance."
        />
      </div>

      <Dialog open={raiseOpen} onOpenChange={setRaiseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise an emerging conduct risk</DialogTitle>
            <DialogDescription>
              The recorded position for this theme and window is attached as the factual basis. Your written basis is
              required and is kept on the record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={riskTitle} onChange={(e) => setRiskTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Why this warrants supervisory attention</Label>
              <Textarea
                rows={5}
                value={riskBasis}
                onChange={(e) => setRiskBasis(e.target.value)}
                placeholder="State, in your own words, what the recorded position shows and why it warrants attention."
              />
              <p className="text-xs text-muted-foreground">At least 10 characters.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRaiseOpen(false)}>Cancel</Button>
            <Button
              onClick={submitRaise}
              disabled={createRisk.isPending || riskTitle.trim().length < 5 || riskBasis.trim().length < 10}
            >
              {createRisk.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Record risk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
