import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUpRight, Building2, Filter as FilterIcon, Lock, RefreshCw } from 'lucide-react';
import { useSectors } from '@/hooks/useMasterConfig';
import { DOMAIN_LABELS } from '@/hooks/useEntitySupervisory360';
import {
  useSupervisoryPortfolio, useSupervisorySectorOverview,
  RATING_ORDER, ratingTone,
  type PortfolioDomainBlock, type PortfolioRow, type SupervisoryDomainCode,
} from '@/hooks/useEnterpriseSupervision';

/**
 * EPIC 4 / W5 — Enterprise Supervisory Portfolio.
 *
 * One screen answers "which entities need supervisory attention, in which
 * domain, and what is the next action" and "how does each sector look".
 * Every figure is read from `supervisory_portfolio` / `supervisory_sector_overview`
 * and drills through to the canonical record. Domains the signed-in officer is
 * not authorised for are not returned at all.
 */

const DOMAINS: SupervisoryDomainCode[] = [
  'PRUDENTIAL', 'AML_CFT', 'MARKET_CONDUCT', 'OPERATIONAL_RESILIENCE', 'GOVERNANCE', 'CROSS_DOMAIN',
];

function RatingBadge({ rating }: { rating?: string | null }) {
  if (!rating) return <span className="text-xs text-muted-foreground">Not assessed</span>;
  const tone = ratingTone(rating);
  const cls = tone === 'danger'
    ? 'border-destructive/50 bg-destructive/10 text-destructive'
    : tone === 'warning' ? 'border-amber-400 bg-amber-50 text-amber-900'
    : tone === 'success' ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
    : '';
  return <Badge variant="outline" className={`font-mono text-[10px] uppercase ${cls}`}>{rating.replace('_', ' ')}</Badge>;
}

function DomainChip({ d }: { d: PortfolioDomainBlock }) {
  if (!d.is_applicable) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        {DOMAIN_LABELS[d.domain_code] ?? d.domain_code}: outside perimeter
      </Badge>
    );
  }
  const parts: string[] = [];
  if (d.open_findings) parts.push(`${d.open_findings} findings`);
  if (d.overdue_remediation) parts.push(`${d.overdue_remediation} overdue remediation`);
  if (d.open_attention) parts.push(`${d.open_attention} attention`);
  if (d.reassessment_required) parts.push('reassessment required');
  if (d.active_enforcement) parts.push(`${d.active_enforcement} enforcement`);
  return (
    <Badge
      variant="outline"
      className={d.is_concern ? 'border-amber-400 bg-amber-50 text-[10px] text-amber-900' : 'text-[10px]'}
    >
      {DOMAIN_LABELS[d.domain_code] ?? d.domain_code}
      {d.residual_rating ? ` · ${d.residual_rating.replace('_', ' ')}` : ' · not assessed'}
      {parts.length ? ` · ${parts.join(', ')}` : ''}
    </Badge>
  );
}

function EntityRow({ row }: { row: PortfolioRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow className="align-top">
        <TableCell>
          <Link to={row.route} className="font-medium text-primary hover:underline">
            {row.entity_name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {row.sector_name ?? 'No sector'}
            {row.systemic_importance ? ` · ${row.systemic_importance}` : ''}
            {row.status ? ` · ${row.status}` : ''}
          </p>
          {row.restricted_matter_present && (
            <Badge variant="outline" className="mt-1 gap-1 text-[10px]">
              <Lock className="h-3 w-3" /> Restricted matter present
            </Badge>
          )}
        </TableCell>
        <TableCell><RatingBadge rating={row.highest_residual_rating} /></TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {row.concern_domains.length === 0
              ? <span className="text-xs text-muted-foreground">None</span>
              : row.concern_domains.map((d) => (
                <Badge key={d} variant="outline" className="border-amber-400 bg-amber-50 text-[10px] text-amber-900">
                  {DOMAIN_LABELS[d] ?? d}
                </Badge>
              ))}
            {row.multi_domain_concern && (
              <Badge variant="outline" className="border-destructive/50 bg-destructive/10 text-[10px] text-destructive">
                Cross-domain
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs tabular-nums">
          {row.open_findings} open{row.critical_findings ? ` · ${row.critical_findings} critical` : ''}
        </TableCell>
        <TableCell className="font-mono text-xs tabular-nums">{row.overdue_remediation}</TableCell>
        <TableCell className="font-mono text-xs tabular-nums">
          {row.assessed_domains}/{row.applicable_domains}
          {row.assessment_overdue && <span className="ml-1 text-destructive">overdue</span>}
        </TableCell>
        <TableCell>
          {row.next_action ? (
            <Link to={row.next_action.route} className="text-xs text-primary hover:underline">
              {row.next_action.work_type_label}
              {row.next_action.reference ? ` · ${row.next_action.reference}` : ''}
              {row.next_action.is_overdue && <span className="ml-1 font-semibold text-destructive">overdue</span>}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">No outstanding work</span>
          )}
        </TableCell>
        <TableCell>
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Domains'}
          </Button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/30">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {row.domains.map((d) => <DomainChip key={d.domain_code} d={d} />)}
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {row.domains.filter((d) => d.active_examination).map((d) => (
                  <Link key={`x-${d.domain_code}`} to={d.active_examination!.route} className="text-primary hover:underline">
                    Examination {d.active_examination!.reference ?? ''} ({d.active_examination!.stage ?? 'open'})
                  </Link>
                ))}
                {row.domains.filter((d) => d.current_plan).map((d) => (
                  <Link key={`p-${d.domain_code}`} to={d.current_plan!.route} className="text-primary hover:underline">
                    Plan {d.current_plan!.reference ?? ''} ({d.current_plan!.status ?? 'open'})
                  </Link>
                ))}
                {row.domains.filter((d) => d.active_intervention).map((d) => (
                  <Link key={`i-${d.domain_code}`} to={d.active_intervention!.route} className="text-primary hover:underline">
                    Intervention {d.active_intervention!.reference ?? ''} ({d.active_intervention!.status ?? 'open'})
                  </Link>
                ))}
                <Link to={row.route} className="text-primary hover:underline">
                  Entity 360 <ArrowUpRight className="inline h-3 w-3" />
                </Link>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function SupervisoryPortfolio() {
  const [params, setParams] = useSearchParams();
  const { data: sectors } = useSectors();

  const [domain, setDomain] = useState<SupervisoryDomainCode | 'all'>(
    (params.get('domain') as SupervisoryDomainCode) ?? 'all');
  const [sectorId, setSectorId] = useState<string>(params.get('sector') ?? 'all');
  const [rating, setRating] = useState<string>(params.get('rating') ?? 'all');
  const [search, setSearch] = useState('');
  const [concernOnly, setConcernOnly] = useState(params.get('concern') === '1');
  const [multiDomainOnly, setMultiDomainOnly] = useState(params.get('multi_domain') === '1');
  const [overdueRemediationOnly, setOverdueRemediationOnly] = useState(params.get('overdue_remediation') === '1');
  const [reassessmentDueOnly, setReassessmentDueOnly] = useState(params.get('reassessment') === '1');
  const [assessmentOverdueOnly, setAssessmentOverdueOnly] = useState(params.get('assessment_overdue') === '1');
  const [unassessedOnly, setUnassessedOnly] = useState(params.get('unassessed') === '1');

  const filters = useMemo(() => ({
    domain: domain === 'all' ? null : domain,
    sectorId: sectorId === 'all' ? null : sectorId,
    rating: rating === 'all' ? null : rating,
    search: search.trim() || null,
    concernOnly, multiDomainOnly, overdueRemediationOnly,
    reassessmentDueOnly, assessmentOverdueOnly, unassessedOnly,
    limit: 200,
  }), [domain, sectorId, rating, search, concernOnly, multiDomainOnly,
       overdueRemediationOnly, reassessmentDueOnly, assessmentOverdueOnly, unassessedOnly]);

  const portfolio = useSupervisoryPortfolio(filters);
  const sectorView = useSupervisorySectorOverview(domain === 'all' ? null : domain);

  const authorised = portfolio.data?.authorised_domains ?? [];
  const summary = portfolio.data?.summary;

  const resetFilters = () => {
    setDomain('all'); setSectorId('all'); setRating('all'); setSearch('');
    setConcernOnly(false); setMultiDomainOnly(false); setOverdueRemediationOnly(false);
    setReassessmentDueOnly(false); setAssessmentOverdueOnly(false); setUnassessedOnly(false);
    setParams(new URLSearchParams());
  };

  return (
    <DashboardLayout
      title="Enterprise Supervisory Portfolio"
      subtitle="Every regulated entity and sector, read from the canonical supervisory record."
    >
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FilterIcon className="h-3 w-3" /> Domain
                </Label>
                <Select value={domain} onValueChange={(v) => setDomain(v as SupervisoryDomainCode | 'all')}>
                  <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All authorised domains</SelectItem>
                    {DOMAINS.filter((d) => authorised.length === 0 || authorised.includes(d)).map((d) => (
                      <SelectItem key={d} value={d}>{DOMAIN_LABELS[d] ?? d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Sector</Label>
                <Select value={sectorId} onValueChange={setSectorId}>
                  <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sectors</SelectItem>
                    {(sectors ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Residual rating</Label>
                <Select value={rating} onValueChange={setRating}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any rating</SelectItem>
                    {RATING_ORDER.filter((r) => r !== 'UNRATED').map((r) => (
                      <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Entity name</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entities" className="w-[220px]" />
              </div>
              <Button variant="outline" size="sm" onClick={() => portfolio.refetch()} disabled={portfolio.isFetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${portfolio.isFetching ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {([
                ['Of supervisory concern', concernOnly, setConcernOnly],
                ['Concern in more than one domain', multiDomainOnly, setMultiDomainOnly],
                ['Overdue remediation', overdueRemediationOnly, setOverdueRemediationOnly],
                ['Reassessment required', reassessmentDueOnly, setReassessmentDueOnly],
                ['Assessment review overdue', assessmentOverdueOnly, setAssessmentOverdueOnly],
                ['Never assessed', unassessedOnly, setUnassessedOnly],
              ] as Array<[string, boolean, (v: boolean) => void]>).map(([label, value, set]) => (
                <div key={label} className="flex items-center gap-2">
                  <Switch checked={value} onCheckedChange={set} id={`sw-${label}`} />
                  <Label htmlFor={`sw-${label}`} className="text-xs">{label}</Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {summary && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {[
              ['Entities', summary.entities],
              ['Of concern', summary.entities_of_concern],
              ['Cross-domain concern', summary.multi_domain_concern],
              ['Open findings', summary.open_findings],
              ['Overdue remediation', summary.overdue_remediation],
              ['Overdue work', summary.overdue_work_items],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-mono text-2xl font-semibold tabular-nums">{value as number}</p>
              </div>
            ))}
          </div>
        )}

        <Tabs defaultValue="entities">
          <TabsList>
            <TabsTrigger value="entities">Entity portfolio</TabsTrigger>
            <TabsTrigger value="sectors">Sector supervision</TabsTrigger>
          </TabsList>

          <TabsContent value="entities" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4" /> Entities
                  {portfolio.data && (
                    <Badge variant="outline" className="ml-2">{portfolio.data.total} match(es)</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {portfolio.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : portfolio.error ? (
                  <p className="text-sm text-muted-foreground">
                    The portfolio could not be produced: {(portfolio.error as any)?.message ?? 'unknown error'}
                  </p>
                ) : (portfolio.data?.rows.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No entity matches these filters.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entity</TableHead>
                        <TableHead>Highest residual</TableHead>
                        <TableHead>Domains of concern</TableHead>
                        <TableHead>Findings</TableHead>
                        <TableHead>Overdue remediation</TableHead>
                        <TableHead>Assessed</TableHead>
                        <TableHead>Next action</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {portfolio.data!.rows.map((row) => <EntityRow key={row.entity_id} row={row} />)}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sectors" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sector supervision</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Perimeter-aware denominators: entities outside a domain's perimeter are reported separately and never
                  counted as unassessed.
                </p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {sectorView.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : (sectorView.data?.rows.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No sector data is visible to you.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sector</TableHead>
                        <TableHead>Domain</TableHead>
                        <TableHead>In perimeter</TableHead>
                        <TableHead>Assessed</TableHead>
                        <TableHead>Rating spread</TableHead>
                        <TableHead>Findings</TableHead>
                        <TableHead>Overdue remediation</TableHead>
                        <TableHead>Engagements</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sectorView.data!.rows.map((r) => (
                        <TableRow key={`${r.sector_id}-${r.domain_code}`}>
                          <TableCell className="font-medium">{r.sector_name ?? '—'}</TableCell>
                          <TableCell className="text-xs">{DOMAIN_LABELS[r.domain_code] ?? r.domain_code}</TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">
                            {r.in_perimeter}
                            {r.outside_perimeter > 0 && (
                              <span className="ml-1 text-muted-foreground">({r.outside_perimeter} outside)</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">
                            {r.assessed}/{r.in_perimeter}
                            {r.assessment_overdue > 0 && (
                              <span className="ml-1 text-destructive">{r.assessment_overdue} overdue</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {RATING_ORDER.filter((k) => (r.rating_distribution?.[k] ?? 0) > 0).map((k) => (
                                <Badge key={k} variant="outline" className="font-mono text-[10px]">
                                  {k.replace('_', ' ')} {r.rating_distribution[k]}
                                </Badge>
                              ))}
                              {Object.keys(r.rating_distribution ?? {}).length === 0 && (
                                <span className="text-xs text-muted-foreground">None assessed</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">
                            {r.open_findings}
                            {r.critical_findings > 0 && (
                              <span className="ml-1 text-destructive">{r.critical_findings} critical</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">{r.overdue_remediation}</TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">
                            {r.active_examinations} exam · {r.active_interventions} interv · {r.active_enforcement} enf
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {portfolio.data?.sources && (
          <p className="text-xs text-muted-foreground">
            Sources: {Object.entries(portfolio.data.sources).map(([k, v]) => `${k} → ${v}`).join(' · ')}
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
