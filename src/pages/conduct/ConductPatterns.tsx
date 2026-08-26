/**
 * MC-06 — Pattern Register.
 *
 * A Pattern is a recurring behaviour or trend detected by an explainable
 * monitoring rule. It is deliberately distinct from:
 *   Signal    — supervisory intelligence requiring assessment
 *   Alert     — attention / threshold notification
 *   Complaint — an individual consumer case
 * The register is served, filtered, paged and counted by the governed server
 * read model — the browser never queries or writes the pattern tables.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, AlertTriangle, Loader2, Network, Radar, Search } from 'lucide-react';
import { usePatternRegister, type PatternRow } from '@/hooks/useConductPatterns';
import { useSectors } from '@/hooks/useMasterConfig';
import { useCan } from '@/hooks/useCan';
import { formatDateTime } from '@/lib/datetime';
import {
  PATTERN_SEVERITY_LABEL, PATTERN_SEVERITY_VARIANT, PATTERN_STATUS_LABEL,
  PATTERN_STATUS_VARIANT, PATTERN_TYPE_LABEL, label, measureVsThreshold,
} from '@/lib/conductPatternLabels';

const PAGE_SIZE = 25;
const STATUS_TABS = [
  { key: 'active', label: 'Needs review' },
  { key: 'open', label: 'Awaiting review' },
  { key: 'under_review', label: 'Under review' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' },
];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

export default function ConductPatterns() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('active');
  const [patternType, setPatternType] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [sector, setSector] = useState('all');
  const [rule, setRule] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const canComplaints = useCan('market_conduct', 'manage_complaints');
  const canAnalytics = useCan('market_conduct', 'run_conduct_analytics');
  const canManage = canComplaints || canAnalytics;


  const { data: sectors = [] } = useSectors();
  const reset = () => setPage(0);

  const filters = useMemo(() => ({
    statuses: status === 'active'
      ? ['open', 'under_review']
      : status === 'all' ? null : [status],
    patternTypes: patternType === 'all' ? null : [patternType],
    severities: severity === 'all' ? null : [severity],
    search: search.trim() || null,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [status, patternType, severity, search, page]);

  const { data: rows = [], isLoading, isError, error, refetch } = usePatternRegister(filters);

  // Rule choices are taken from what the governed page returned — the UI never
  // reads the rule configuration tables itself.
  const ruleOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.rule_id) map.set(r.rule_id, `${label(PATTERN_TYPE_LABEL, r.pattern_type)}${r.rule_version ? ` (version ${r.rule_version})` : ''}`);
    });
    return [...map.entries()];
  }, [rows]);

  // Sector, rule and detection-date are presentation refinements over the
  // governed page — the server read model owns paging and totals.
  const visible = useMemo(() => rows.filter((r) => {
    if (sector !== 'all' && r.sector_id !== sector) return false;
    if (rule !== 'all' && r.rule_id !== rule) return false;
    const detected = r.first_detected_at ? new Date(r.first_detected_at) : null;
    if (from && (!detected || detected < new Date(`${from}T00:00:00`))) return false;
    if (to && (!detected || detected > new Date(`${to}T23:59:59`))) return false;
    return true;
  }), [rows, sector, rule, from, to]);

  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const refined = visible.length !== rows.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Pattern Detection"
          description="Recurring behaviours and trends detected by explainable supervisory rules. A pattern summarises records that already exist — it does not replace the consumer complaints, conduct signals or alerts that contributed to it, and nothing is raised automatically."
          actions={canManage ? undefined : <Badge variant="outline">View only</Badge>}
        />

        <Card>
          <CardContent className="grid gap-3 p-4 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <p className="flex items-start gap-2"><Network className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="text-foreground">Pattern</strong> — a recurring behaviour or trend detected across records.</span></p>
            <p className="flex items-start gap-2"><Radar className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="text-foreground">Signal</strong> — supervisory intelligence raised for assessment.</span></p>
            <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="text-foreground">Alert</strong> — an attention notice when a threshold is crossed.</span></p>
            <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="text-foreground">Complaint</strong> — one consumer's individual case.</span></p>
          </CardContent>
        </Card>

        <Tabs value={status} onValueChange={(v) => { setStatus(v); reset(); }}>
          <TabsList className="h-auto flex-wrap">
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid gap-2 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search pattern reference or title"
              value={search}
              onChange={(e) => { setSearch(e.target.value); reset(); }}
            />
          </div>
          <Select value={patternType} onValueChange={(v) => { setPatternType(v); reset(); }}>
            <SelectTrigger><SelectValue placeholder="Pattern type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All pattern types</SelectItem>
              {Object.entries(PATTERN_TYPE_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(v) => { setSeverity(v); reset(); }}>
            <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{PATTERN_SEVERITY_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sector} onValueChange={setSector}>
            <SelectTrigger><SelectValue placeholder="Sector" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sectors</SelectItem>
              {sectors.map((s: { id: string; name: string }) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={rule} onValueChange={setRule}>
            <SelectTrigger><SelectValue placeholder="Rule" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rules</SelectItem>
              {ruleOptions.length === 0 && <SelectItem value="none" disabled>No rules on this page</SelectItem>}
              {ruleOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 md:col-span-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Detected from" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Detected to" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSector('all'); setRule('all'); setFrom(''); setTo(''); setSeverity('all'); setPatternType('all'); setSearch(''); reset(); }}
            >
              Clear filters
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {isError ? (
              <div className="p-12 text-center">
                <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {(error as Error)?.message?.includes('not_authorized')
                    ? 'You do not have access to pattern detection for this portfolio.'
                    : 'Patterns could not be loaded. This is a temporary problem — please try again.'}
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Try again</Button>
              </div>
            ) : isLoading ? (
              <div className="p-12 text-center text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                <p className="mt-2 text-sm">Loading patterns…</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Network className="mx-auto mb-2 h-8 w-8" />
                <p className="text-sm">No patterns match the selected view.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pattern</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Who / what is affected</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Measured vs threshold</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>Last evaluated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/conduct/patterns/${r.id}`)}
                    >
                      <TableCell className="align-top">
                        <div className="font-mono text-xs">{r.reference}</div>
                        <div className="max-w-[16rem] truncate text-sm font-medium">{r.title}</div>
                        <RaisedMarkers row={r} />
                      </TableCell>
                      <TableCell className="align-top text-sm">{label(PATTERN_TYPE_LABEL, r.pattern_type)}</TableCell>
                      <TableCell className="align-top text-sm">
                        {r.entity_name
                          ?? ((r.distinct_entity_count ?? 0) > 1 ? `${r.distinct_entity_count} entities` : '—')}
                        {(r.product_name || r.channel_name) && (
                          <div className="text-xs text-muted-foreground">
                            {[r.product_name, r.channel_name].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        {label(PATTERN_TYPE_LABEL, r.pattern_type)}
                        {r.rule_version && <div className="text-xs text-muted-foreground">Version {r.rule_version}</div>}
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        {measureVsThreshold(r.metric_value, r.threshold_value, r.metric_unit, r.comparison_operator)}
                      </TableCell>
                      <TableCell className="align-top text-right text-sm">{r.member_count ?? 0}</TableCell>
                      <TableCell className="align-top">
                        <Badge variant={PATTERN_SEVERITY_VARIANT[r.severity ?? ''] ?? 'outline'}>
                          {label(PATTERN_SEVERITY_LABEL, r.severity)}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={PATTERN_STATUS_VARIANT[r.status] ?? 'outline'}>
                          {label(PATTERN_STATUS_LABEL, r.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top text-sm">{r.reviewer_name ?? 'Unassigned'}</TableCell>
                      <TableCell className="align-top text-xs">{formatDateTime(r.first_detected_at)}</TableCell>
                      <TableCell className="align-top text-xs">{formatDateTime(r.last_evaluated_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {!isLoading && !isError && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Showing {visible.length} of {total} pattern{total === 1 ? '' : 's'}
              {refined && ' (sector, rule and date choices apply to the loaded page)'}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span>Page {page + 1} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function RaisedMarkers({ row }: { row: PatternRow }) {
  if (!row.raised_signal_id && !row.raised_alert_id) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {row.raised_signal_id && <Badge variant="secondary" className="text-[10px]">Signal raised</Badge>}
      {row.raised_alert_id && <Badge variant="secondary" className="text-[10px]">Alert raised</Badge>}
    </div>
  );
}
