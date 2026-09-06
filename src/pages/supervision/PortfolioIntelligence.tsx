/**
 * OS-02G1 — Portfolio & Thematic Intelligence.
 *
 * A management lens over the canonical supervisory spine. It answers "what is
 * happening across my portfolio" using deterministic detector-based themes and
 * canonical counts. It creates nothing: no risk score, no alert, no case, no
 * work queue. Every figure drills down to the real records behind it.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, ExternalLink, Info, Layers, Network, RefreshCw, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  CHANGE_STATE_LABELS,
  EFFECTIVENESS_LABELS,
  formatPortfolioDate,
  usePortfolioChangeLens,
  usePortfolioCrossDomain,
  usePortfolioGroups,
  usePortfolioOverview,
  usePortfolioThemeDetail,
  usePortfolioThemes,
  type PortfolioTheme,
} from '@/hooks/useSupervisoryPortfolioIntelligence';

const DOMAINS = ['PRUDENTIAL', 'AML_CFT', 'MARKET_CONDUCT', 'CROSS_DOMAIN'];
const WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function humanise(value?: string | null) {
  if (!value) return '—';
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function trendVariant(state: string): 'destructive' | 'secondary' | 'outline' | 'default' {
  if (state === 'WORSENING' || state === 'EMERGED') return 'destructive';
  if (state === 'IMPROVING') return 'secondary';
  if (state === 'NOT_ASSESSABLE') return 'outline';
  return 'default';
}

function Metric({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-2xl font-semibold font-mono">{value}</div>
      <div className="text-sm font-medium text-foreground">{label}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function PortfolioIntelligence() {
  const navigate = useNavigate();
  const [domain, setDomain] = useState<string>('all');
  const [windowDays, setWindowDays] = useState<string>('30');
  const [activeTheme, setActiveTheme] = useState<PortfolioTheme | null>(null);

  const domainArg = domain === 'all' ? null : domain;
  const days = Number(windowDays);

  const overview = usePortfolioOverview(domainArg, days);
  const themes = usePortfolioThemes(domainArg, days);
  const change = usePortfolioChangeLens(domainArg, days);
  const groups = usePortfolioGroups(domainArg);
  const crossDomain = usePortfolioCrossDomain();
  const detail = usePortfolioThemeDetail(activeTheme?.theme_key ?? null, activeTheme?.domain_code ?? null);

  const o = overview.data;
  const changeGroups = useMemo(() => {
    const rows = change.data?.rows ?? [];
    const order = ['EMERGED', 'WORSENING', 'PERSISTENT', 'IMPROVING', 'NOT_ASSESSABLE', 'NOT_OBSERVED_IN_WINDOW'];
    return order
      .map((state) => ({ state, rows: rows.filter((r) => r.change_state === state) }))
      .filter((g) => g.rows.length > 0);
  }, [change.data]);

  const refreshAll = () => {
    overview.refetch(); themes.refetch(); change.refetch(); groups.refetch(); crossDomain.refetch();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio & Thematic Intelligence"
        description="Patterns across your authorised portfolio, peer groups, sectors, financial groups and supervisory domains — derived from canonical detected conditions, reviews and responses. No score is invented here."
        actions={
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="w-56 space-y-1">
            <Label>Supervisory domain</Label>
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All authorised domains</SelectItem>
                {DOMAINS.map((d) => <SelectItem key={d} value={d}>{humanise(d)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48 space-y-1">
            <Label>Comparison window</Label>
            <Select value={windowDays} onValueChange={setWindowDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WINDOWS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="flex-1 text-xs text-muted-foreground">
            Population: {o?.population.definition ?? 'authorised supervisory scope only'}
          </p>
        </CardContent>
      </Card>

      {overview.isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : o ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Metric label="Authorised entities" value={o.population.authorised_entities} hint={`${o.population.authorised_entity_domains} entity-domain pairs`} />
          <Metric label="Material open conditions" value={o.conditions.material_open_conditions} hint={`${o.conditions.material_open_occurrences} observations`} />
          <Metric label="Affected entities" value={o.conditions.affected_entities} />
          <Metric label="Unreviewed material conditions" value={o.conditions.unreviewed_material_conditions} hint={`${o.conditions.unreviewed_material_entities} entities`} />
          <Metric label="Overdue responses" value={o.responses.overdue_responses} hint={`${o.responses.open_actions} open responses`} />
          <Metric label="Recurring themes" value={o.themes.recurring_themes} hint={`${o.themes.themes_across_multiple_entities} themes on multiple entities`} />
        </div>
      ) : null}

      <Tabs defaultValue="changed">
        <TabsList>
          <TabsTrigger value="changed">What changed</TabsTrigger>
          <TabsTrigger value="themes">Themes</TabsTrigger>
          <TabsTrigger value="groups">Financial groups</TabsTrigger>
          <TabsTrigger value="crossdomain">Cross-domain</TabsTrigger>
          <TabsTrigger value="evidence">How calculated</TabsTrigger>
        </TabsList>

        <TabsContent value="changed" className="space-y-4">
          {change.isLoading ? <Skeleton className="h-40 w-full" /> : changeGroups.length === 0 ? (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">
              No detected conditions in your authorised portfolio for this window, so there is nothing to compare.
            </CardContent></Card>
          ) : changeGroups.map((g) => (
            <Card key={g.state}>
              <CardHeader><CardTitle className="text-base">
                {CHANGE_STATE_LABELS[g.state] ?? humanise(g.state)} <span className="text-muted-foreground">({g.rows.length})</span>
              </CardTitle></CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Theme</TableHead><TableHead>Domain</TableHead>
                    <TableHead className="text-right">Entities now</TableHead>
                    <TableHead className="text-right">Entities before</TableHead>
                    <TableHead className="text-right">New conditions</TableHead>
                    <TableHead className="text-right">Resolved</TableHead>
                    <TableHead className="text-right">Material open</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {g.rows.map((r) => (
                      <TableRow key={`${r.theme_key}-${r.domain_code}`}>
                        <TableCell className="font-medium">{r.theme_label}</TableCell>
                        <TableCell>{humanise(r.domain_code)}</TableCell>
                        <TableCell className="text-right font-mono">{r.current_window_entities}</TableCell>
                        <TableCell className="text-right font-mono">{r.comparison_window_entities}</TableCell>
                        <TableCell className="text-right font-mono">{r.new_conditions_in_window}</TableCell>
                        <TableCell className="text-right font-mono">{r.resolved_conditions_in_window}</TableCell>
                        <TableCell className="text-right font-mono">{r.material_open}</TableCell>
                        <TableCell className="text-right font-mono">{r.overdue_responses}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
          {change.data && (
            <p className="text-xs text-muted-foreground">{change.data.method} {change.data.guard}</p>
          )}
        </TabsContent>

        <TabsContent value="themes">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" /> Themes across the portfolio
            </CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {themes.isLoading ? <Skeleton className="m-6 h-40" /> : (themes.data?.themes.length ?? 0) === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No themes in your authorised portfolio.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Theme</TableHead><TableHead>Domain</TableHead>
                    <TableHead className="text-right">Entities</TableHead>
                    <TableHead className="text-right">Groups</TableHead>
                    <TableHead className="text-right">Conditions</TableHead>
                    <TableHead className="text-right">Observations</TableHead>
                    <TableHead className="text-right">Unreviewed</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead>First / last observed</TableHead>
                    <TableHead />
                  </TableRow></TableHeader>
                  <TableBody>
                    {themes.data?.themes.map((t) => (
                      <TableRow key={`${t.theme_key}-${t.domain_code}`}>
                        <TableCell className="font-medium">
                          {t.theme_label}
                          <div className="text-xs text-muted-foreground font-mono">{t.theme_key}</div>
                        </TableCell>
                        <TableCell>{humanise(t.domain_code)}</TableCell>
                        <TableCell className="text-right font-mono">{t.affected_entity_count}</TableCell>
                        <TableCell className="text-right font-mono">{t.affected_group_count}</TableCell>
                        <TableCell className="text-right font-mono">{t.material_open_count}/{t.condition_count}</TableCell>
                        <TableCell className="text-right font-mono">{t.occurrence_count}</TableCell>
                        <TableCell className="text-right font-mono">{t.unreviewed_material_count}</TableCell>
                        <TableCell className="text-right font-mono">{t.overdue_response_count}</TableCell>
                        <TableCell className="text-xs font-mono">
                          C{t.severity_distribution.critical ?? 0} H{t.severity_distribution.high ?? 0} M{t.severity_distribution.medium ?? 0} L{t.severity_distribution.low ?? 0}
                        </TableCell>
                        <TableCell><Badge variant={trendVariant(t.trend_direction)}>{CHANGE_STATE_LABELS[t.trend_direction] ?? humanise(t.trend_direction)}</Badge></TableCell>
                        <TableCell className="text-xs">{formatPortfolioDate(t.first_observed)} → {formatPortfolioDate(t.last_observed)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setActiveTheme(t)}>Evidence</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4" /> Financial group concentration
            </CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {groups.isLoading ? <Skeleton className="m-6 h-32" /> : (groups.data?.groups.length ?? 0) === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No financial group in your authorised portfolio currently has visible member entities.
                </p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">Members (visible / canonical)</TableHead>
                    <TableHead className="text-right">Members with material open</TableHead>
                    <TableHead className="text-right">Material open conditions</TableHead>
                    <TableHead className="text-right">Domains affected</TableHead>
                    <TableHead className="text-right">Unreviewed</TableHead>
                    <TableHead>Shared themes</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {groups.data?.groups.map((g) => (
                      <TableRow key={g.group_id}>
                        <TableCell className="font-medium">{g.group_name}
                          <div className="text-xs text-muted-foreground font-mono">{g.group_code}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{g.visible_member_count} / {g.canonical_member_count}</TableCell>
                        <TableCell className="text-right font-mono">{g.members_with_material_open}</TableCell>
                        <TableCell className="text-right font-mono">{g.material_open_conditions}</TableCell>
                        <TableCell className="text-right font-mono">{g.affected_domains}</TableCell>
                        <TableCell className="text-right font-mono">{g.unreviewed_material}</TableCell>
                        <TableCell className="space-y-1">
                          {g.shared_themes.length === 0
                            ? <span className="text-xs text-muted-foreground">None shared by more than one member</span>
                            : g.shared_themes.map((t) => (
                              <div key={t.theme_key} className="text-xs">
                                {t.theme_label} — {t.member_count} members
                              </div>
                            ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crossdomain">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" /> Entities with material conditions in more than one domain
            </CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {crossDomain.isLoading ? <Skeleton className="m-6 h-32" /> : (crossDomain.data?.entities.length ?? 0) === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No entity currently shows material open conditions in more than one supervisory domain.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead className="text-right">Domains affected</TableHead>
                    <TableHead>Domains</TableHead>
                    <TableHead className="text-right">Material open conditions</TableHead>
                    <TableHead>Approved risk state</TableHead>
                    <TableHead />
                  </TableRow></TableHeader>
                  <TableBody>
                    {crossDomain.data?.entities.map((e) => (
                      <TableRow key={e.entity_id}>
                        <TableCell className="font-medium">{e.entity_name}</TableCell>
                        <TableCell className="text-right font-mono">{e.affected_domain_count}</TableCell>
                        <TableCell className="text-xs">{e.domains.map(humanise).join(', ')}</TableCell>
                        <TableCell className="text-right font-mono">{e.material_open_conditions}</TableCell>
                        <TableCell className="text-xs">
                          {e.approved_risk_state.length === 0
                            ? <span className="text-muted-foreground">No approved risk state</span>
                            : e.approved_risk_state.map((r) => `${humanise(r.domain_code)}: ${r.residual_rating ?? '—'}`).join(' · ')}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => navigate(e.href)}>
                            <ExternalLink className="mr-1 h-3 w-3" /> Entity
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          {crossDomain.data && <p className="mt-3 text-xs text-muted-foreground">{crossDomain.data.statement}</p>}
        </TabsContent>

        <TabsContent value="evidence">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4" /> How these figures are calculated
            </CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              {o && (
                <>
                  <div>
                    <p className="font-medium">Population</p>
                    <p className="text-muted-foreground">{o.population.definition}</p>
                    <p className="text-xs text-muted-foreground font-mono">{o.population.source_objects.join(' · ')}</p>
                  </div>
                  <div>
                    <p className="font-medium">Count definitions</p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {Object.entries(o.count_definitions).map(([k, v]) => <li key={k}><span className="font-medium">{humanise(k)}:</span> {v}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium">Provenance</p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {Object.entries(o.provenance).map(([k, v]) => <li key={k}><span className="font-medium">{humanise(k)}:</span> {v}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium">Window</p>
                    <p className="text-muted-foreground">
                      {formatPortfolioDate(o.window.from)} → {formatPortfolioDate(o.window.to)} ({o.window.days} days), compared with the immediately preceding window of equal length.
                    </p>
                  </div>
                </>
              )}
              {themes.data && (
                <div>
                  <p className="font-medium">Theme identity</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {Object.entries(themes.data.theme_identity).map(([k, v]) => <li key={k}><span className="font-medium">{humanise(k)}:</span> {v}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!activeTheme} onOpenChange={(open) => !open && setActiveTheme(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader><SheetTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> {activeTheme?.theme_label}
          </SheetTitle></SheetHeader>
          {activeTheme && (
            <div className="mt-4 space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Affected entities" value={activeTheme.affected_entity_count} />
                <Metric label="Conditions" value={activeTheme.condition_count} />
                <Metric label="Observations" value={activeTheme.occurrence_count} />
                <Metric label="Open responses" value={activeTheme.open_action_count} />
              </div>

              {activeTheme.response_effectiveness_indicators.length > 0 && (
                <div>
                  <p className="font-medium">Response indicators</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {activeTheme.response_effectiveness_indicators.map((i) => (
                      <Badge key={i} variant="outline">{EFFECTIVENESS_LABELS[i] ?? humanise(i)}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="font-medium">Evidence / how calculated</p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {Object.entries(activeTheme.provenance).map(([k, v]) => (
                    <li key={k}><span className="font-medium">{humanise(k)}:</span> {String(Array.isArray(v) ? (v as string[]).join(' · ') : v)}</li>
                  ))}
                  <li><span className="font-medium">Window comparison:</span> {activeTheme.current_window_entities} entities now vs {activeTheme.comparison_window_entities} previously; {activeTheme.current_window_occurrences} vs {activeTheme.comparison_window_occurrences} observations.</li>
                  <li><span className="font-medium">Detection assessable:</span> {activeTheme.detection_assessable ? 'yes — detector completed in this window' : 'no — detector did not complete in this window, so no improvement is claimed'}</li>
                </ul>
              </div>

              <div>
                <p className="font-medium">Underlying conditions ({detail.data?.headline.condition_count ?? 0})</p>
                {detail.isLoading ? <Skeleton className="mt-2 h-32" /> : (
                  <div className="mt-2 overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Entity</TableHead><TableHead>Severity</TableHead>
                        <TableHead>State</TableHead><TableHead>Reviewed</TableHead>
                        <TableHead>Response</TableHead><TableHead>Last observed</TableHead>
                        <TableHead /></TableRow></TableHeader>
                      <TableBody>
                        {detail.data?.conditions.map((c) => (
                          <TableRow key={c.signal_id}>
                            <TableCell className="font-medium">{c.entity_name}</TableCell>
                            <TableCell>{humanise(c.severity)}</TableCell>
                            <TableCell>{humanise(c.condition_state)}</TableCell>
                            <TableCell>{c.is_reviewed ? formatPortfolioDate(c.reviewed_at) : 'Not reviewed'}</TableCell>
                            <TableCell className="text-xs">{c.action_reference ?? '—'}{c.response_overdue ? ' (overdue)' : ''}</TableCell>
                            <TableCell className="text-xs">{formatPortfolioDate(c.last_observed)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => navigate('/supervision/management-assurance')}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
