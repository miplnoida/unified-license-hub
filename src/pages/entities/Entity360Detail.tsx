/**
 * RDM-ENTITY-001 Wave D — Enterprise Entity 360 (`/entities/:entityId/360`).
 *
 * A single supervisory view of one regulated entity across every domain:
 * identity, licences, ownership and control, governance, fit & proper,
 * prudential, returns, risk, supervision, market conduct, AML/CFT, operational
 * resilience, examinations, enforcement, regulatory requests, documents,
 * correspondence, provenance and a cross-domain timeline.
 *
 * Reads are served exclusively by the governed `entity360_*` RPCs, which apply
 * internal-only access and per-section permission gating; sections the current
 * user may not see are not rendered. An "as of" date replays the temporal
 * sections at a historic point in time.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, History, ShieldCheck, Network } from 'lucide-react';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import {
  useEntity360Overview, useEntity360Section, useEntity360Timeline,
  type E360SectionKey, type Entity360Overview,
} from '@/hooks/useEntity360';

/* ------------------------------------------------------------------ */
/* Section catalogue                                                   */
/* ------------------------------------------------------------------ */

const SECTIONS: Array<{ key: E360SectionKey; label: string; temporal?: boolean }> = [
  { key: 'identity', label: 'Identity', temporal: true },
  { key: 'licences', label: 'Licences', temporal: true },
  { key: 'ownership', label: 'Ownership', temporal: true },
  { key: 'governance', label: 'Governance', temporal: true },
  { key: 'relationships', label: 'Relationships', temporal: true },
  { key: 'fit_and_proper', label: 'Fit & Proper' },
  { key: 'business_profile', label: 'Business profile', temporal: true },
  { key: 'returns', label: 'Returns' },
  { key: 'prudential', label: 'Prudential' },
  { key: 'supervision', label: 'Supervision' },
  { key: 'market_conduct', label: 'Market conduct' },
  { key: 'aml', label: 'AML/CFT' },
  { key: 'resilience', label: 'Resilience' },
  { key: 'examinations', label: 'Examinations' },
  { key: 'enforcement', label: 'Enforcement' },
  { key: 'regulatory_requests', label: 'Requests' },
  { key: 'documents', label: 'Documents', temporal: true },
  { key: 'correspondence', label: 'Correspondence' },
  { key: 'provenance', label: 'Provenance' },
];

const TIMELINE_DOMAINS = [
  'licensing', 'ownership', 'governance', 'returns', 'risk', 'examination',
  'enforcement', 'conduct', 'aml', 'resilience', 'requests', 'change', 'correspondence',
];

const HIDDEN_KEYS = new Set(['id', 'owner_party_id', 'person_party_id', 'related_entity_id',
  'fp_individual_id', 'change_set_id', 'file_path']);

const titleise = (k: string) =>
  k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isIsoDateTime = (v: string) => /^\d{4}-\d{2}-\d{2}T/.test(v);

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (isIsoDateTime(value)) return formatDateTime(value);
    if (isIsoDate(value)) return formatDateOnly(value);
    return value;
  }
  return JSON.stringify(value);
}

/* ------------------------------------------------------------------ */
/* Summary tiles                                                       */
/* ------------------------------------------------------------------ */

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function OverviewPanel({ overview }: { overview: Entity360Overview }) {
  const e = overview.entity!;
  const tiles: Array<{ label: string; value: React.ReactNode; hint?: string }> = [];

  if (overview.risk_score_current || overview.risk) {
    tiles.push({
      label: 'Risk',
      value: overview.risk_score_current?.band ?? overview.risk?.overall_rating ?? '—',
      hint: overview.risk_score_current?.score != null
        ? `Score ${overview.risk_score_current.score} · ${overview.risk_score_current.period_key ?? ''}`
        : overview.risk?.assessment_date
          ? `Assessed ${formatDateOnly(overview.risk.assessment_date)}`
          : undefined,
    });
  }
  if (overview.returns_summary) {
    const r = overview.returns_summary;
    tiles.push({ label: 'Return filings', value: r.filings, hint: `${r.accepted} accepted · ${r.awaiting_review} in review · ${r.overdue} overdue` });
    tiles.push({ label: 'Active obligations', value: r.obligations });
  }
  if (overview.supervision) {
    tiles.push({
      label: 'Supervision',
      value: overview.supervision.assignment?.supervisor_name ?? 'Unassigned',
      hint: overview.supervision.assignment?.team ?? undefined,
    });
    tiles.push({ label: 'Supervisory plans', value: overview.supervision.plans, hint: `${overview.supervision.open_actions} open actions` });
  }
  if (overview.prudential) {
    tiles.push({ label: 'Prudential rating', value: overview.prudential.latest_rating ?? '—', hint: `${overview.prudential.assessments} assessments · ${overview.prudential.metrics_reported} metrics` });
  }
  if (overview.ownership_summary) {
    tiles.push({ label: 'Ownership', value: overview.ownership_summary.current_holders, hint: `${overview.ownership_summary.controllers} controllers · ${overview.ownership_summary.ubos} UBOs` });
  }
  if (overview.governance_summary) {
    tiles.push({ label: 'Appointments', value: overview.governance_summary.current_appointments, hint: `${overview.governance_summary.awaiting_approval} awaiting approval` });
  }
  if (overview.fp_summary) {
    tiles.push({ label: 'Fit & proper', value: overview.fp_summary.total, hint: `${overview.fp_summary.open} open · ${overview.fp_summary.determined} determined` });
  }
  if (overview.market_conduct) {
    tiles.push({ label: 'Complaints', value: overview.market_conduct.complaints, hint: `${overview.market_conduct.open_complaints} open · ${overview.market_conduct.alerts_open} alerts` });
  }
  if (overview.aml) {
    tiles.push({
      label: 'AML residual risk',
      value: (overview.aml.latest?.residual_rating as string) ?? '—',
      hint: `${overview.aml.open_findings} open findings`,
    });
  }
  if (overview.resilience) {
    tiles.push({ label: 'Resilience', value: overview.resilience.arrangements, hint: `${overview.resilience.critical_providers} critical · ${overview.resilience.open_incidents} open incidents` });
  }
  if (overview.examinations) {
    tiles.push({ label: 'Examinations', value: overview.examinations.total, hint: `${overview.examinations.in_progress} in progress · ${overview.examinations.open_findings} open findings` });
  }
  if (overview.enforcement) {
    tiles.push({ label: 'Enforcement', value: overview.enforcement.total, hint: `${overview.enforcement.open} open` });
  }
  if (overview.regulatory_requests) {
    tiles.push({ label: 'Regulatory requests', value: overview.regulatory_requests.total, hint: `${overview.regulatory_requests.open} open · ${overview.regulatory_requests.change_sets_pending} change sets pending` });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Entity profile</CardTitle>
          <CardDescription>Canonical identity and regulatory classification.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Status', e.status], ['Lifecycle stage', e.lifecycle_stage],
            ['Identity status', e.identity_status], ['Sector', e.sector],
            ['Sub-sector', e.sub_sector], ['Category', e.category],
            ['Systemic importance', e.systemic_importance],
            ['Structure version', e.structure_version],
            ['Public register slug', e.public_slug],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between gap-4 border-b pb-2">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-right font-medium">{renderValue(value)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {tiles.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => <Metric key={t.label} {...t} />)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Generic section table                                               */
/* ------------------------------------------------------------------ */

function SectionTable({
  entityId, section, label, asOf,
}: { entityId: string; section: E360SectionKey; label: string; asOf: string | null }) {
  const { data, isLoading, error } = useEntity360Section(entityId, section, asOf);
  const rows = data?.rows ?? [];

  const columns = useMemo(() => {
    const keys: string[] = [];
    rows.forEach((r) => Object.keys(r).forEach((k) => {
      if (!HIDDEN_KEYS.has(k) && !keys.includes(k)) keys.push(k);
    }));
    return keys;
  }, [rows]);

  if (isLoading) {
    return <div className="py-16 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>;
  }
  if (error) {
    return <p className="py-10 text-center text-sm text-destructive">{(error as Error).message}</p>;
  }
  if (data && data.allowed === false) {
    return <p className="py-10 text-center text-sm text-muted-foreground">You do not have access to the {label} section.</p>;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription>
          {rows.length} record{rows.length === 1 ? '' : 's'}
          {asOf ? ` · as at ${formatDateOnly(asOf)}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => <TableHead key={c} className="whitespace-nowrap">{titleise(c)}</TableHead>)}
                {columns.length === 0 && <TableHead>Records</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={Math.max(columns.length, 1)} className="py-10 text-center text-muted-foreground">
                    No {label.toLowerCase()} records{asOf ? ' at the selected date' : ''}.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={(r.id as string) ?? i}>
                  {columns.map((c) => (
                    <TableCell key={c} className="whitespace-nowrap align-top text-sm">
                      {renderValue(r[c])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

function TimelinePanel({ entityId }: { entityId: string }) {
  const [domains, setDomains] = useState<string[]>([]);
  const { data, isLoading } = useEntity360Timeline(entityId, domains);
  const events = data?.events ?? [];

  const toggle = (d: string) =>
    setDomains((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Cross-domain timeline</CardTitle>
        <CardDescription>{data?.total ?? 0} events across the entity lifecycle.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          {TIMELINE_DOMAINS.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={domains.includes(d) ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => toggle(d)}
            >
              {titleise(d)}
            </Button>
          ))}
          {domains.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDomains([])}>
              Clear
            </Button>
          )}
        </div>

        {isLoading && <div className="py-16 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>}

        {!isLoading && events.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No events recorded for the selected domains.</p>
        )}

        <ol className="relative space-y-4 border-l pl-6">
          {events.map((ev, i) => (
            <li key={`${ev.source_table}-${ev.source_id}-${i}`} className="relative">
              <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">{titleise(ev.domain)}</Badge>
                <span className="font-medium">{ev.title || titleise(ev.event_type)}</span>
                <span className="font-mono text-xs text-muted-foreground">{formatDateTime(ev.occurred_at)}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {titleise(ev.event_type)}{ev.detail ? ` · ${ev.detail}` : ''}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Entity360Detail() {
  const { entityId } = useParams<{ entityId: string }>();
  const [asOfInput, setAsOfInput] = useState('');
  const { data: overview, isLoading, error } = useEntity360Overview(entityId);

  const asOf = asOfInput ? new Date(`${asOfInput}T23:59:59Z`).toISOString() : null;

  const allowed = overview?.sections ?? {};
  const visibleSections = SECTIONS.filter((s) => allowed[s.key] !== false);

  if (isLoading) {
    return <div className="py-24 text-center"><Loader2 className="inline h-6 w-6 animate-spin" /></div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Entity 360" description="Enterprise supervisory view of a regulated entity." />
        <Card><CardContent className="py-10 text-center text-sm text-destructive">
          {(error as Error).message === 'forbidden'
            ? 'You do not have access to the Entity 360 view.'
            : (error as Error).message}
        </CardContent></Card>
      </div>
    );
  }

  if (!overview?.found || !overview.entity) {
    return (
      <div className="space-y-4">
        <PageHeader title="Entity 360" description="Enterprise supervisory view of a regulated entity." />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Entity not found.
        </CardContent></Card>
      </div>
    );
  }

  const e = overview.entity;

  return (
    <div className="space-y-6">
      <PageHeader
        title={e.name}
        description="Entity 360 — one supervisory view across identity, licensing, prudential, conduct, AML, resilience and enforcement."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/entities/${e.id}/structure`}><Network className="mr-2 h-4 w-4" />Structure workspace</Link>
            </Button>
            {e.public_slug && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/registry/entities/${e.public_slug}`}><ShieldCheck className="mr-2 h-4 w-4" />Public register</Link>
              </Button>
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="w-full max-w-xs space-y-1">
            <Label htmlFor="e360-as-of" className="text-xs">Point-in-time view (as at)</Label>
            <Input
              id="e360-as-of"
              type="date"
              value={asOfInput}
              onChange={(ev) => setAsOfInput(ev.target.value)}
            />
          </div>
          {asOfInput && (
            <Button variant="ghost" size="sm" onClick={() => setAsOfInput('')}>Show current state</Button>
          )}
          <p className="text-xs text-muted-foreground">
            Temporal sections (identity, licences, ownership, governance, relationships, business profile, documents)
            replay their recorded state at the selected date.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {allowed.timeline !== false && <TabsTrigger value="timeline">Timeline</TabsTrigger>}
            {visibleSections.map((s) => (
              <TabsTrigger key={s.key} value={s.key}>{s.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewPanel overview={overview} />
        </TabsContent>

        {allowed.timeline !== false && (
          <TabsContent value="timeline">
            <TimelinePanel entityId={e.id} />
          </TabsContent>
        )}

        {visibleSections.map((s) => (
          <TabsContent key={s.key} value={s.key}>
            <SectionTable
              entityId={e.id}
              section={s.key}
              label={s.label}
              asOf={s.temporal ? asOf : null}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
