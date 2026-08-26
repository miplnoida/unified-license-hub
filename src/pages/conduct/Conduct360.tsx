/**
 * MC-07.3 — Conduct 360 fact view.
 *
 * Deterministic supervisory view for one entity. Every number shown comes from
 * the governed `conduct_360_snapshot` read model; the page only formats and
 * orders. It performs no writes, so an auditor sees exactly what a supervisor
 * sees. No advisory or AI-generated content appears in this phase.
 */
import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CONDUCT_360_WINDOW_OPTIONS, useConduct360,
  type Conduct360WindowChoice, type FactSection,
} from '@/hooks/useConduct360';
import { ClassificationLegend } from '@/components/conduct/three-sixty/ClassificationLegend';
import { Conduct360Section } from '@/components/conduct/three-sixty/Conduct360Section';
import { MeasureTiles } from '@/components/conduct/three-sixty/MeasureTiles';
import { BreakdownList, SeriesList } from '@/components/conduct/three-sixty/BreakdownList';
import { TrendStatement } from '@/components/conduct/three-sixty/TrendStatement';
import { FactItemTable, type FactColumn } from '@/components/conduct/three-sixty/FactItemTable';
import { AdvisoryPanel } from '@/components/conduct/three-sixty/advisory/AdvisoryPanel';
import { useCan } from '@/hooks/useCan';
import {
  comparisonLabel, formatAmount, formatCount, formatDate, formatDateTime, harmLabel,
  humanise, measureLabel, openItemTypeLabel, outcomeLabel, severityLabel, slaStateLabel,
  statusLabel, systemicLabel,
} from '@/lib/conductFactLabels';

const sectionIsEmpty = (section?: FactSection, measureKeys?: string[]): boolean => {
  if (!section) return true;
  const items = Array.isArray(section.items) ? section.items : [];
  if (items.length > 0) return false;
  const measures = section.measures ?? {};
  const keys = measureKeys ?? Object.keys(measures);
  return !keys.some((k) => {
    const v = measures[k];
    if (v === null || v === undefined) return false;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.trim() !== '' && v !== '0';
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v as object).length > 0;
    return false;
  });
};

const monthLabel = (value: unknown) => {
  if (!value) return '—';
  const raw = String(value);
  const d = new Date(raw.length === 7 ? `${raw}-01` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

export default function Conduct360() {
  const { entityId } = useParams<{ entityId: string }>();
  const [choice, setChoice] = useState<Conduct360WindowChoice>('last_12_months');
  const { snapshot, isLoading, isDenied, error } = useConduct360(entityId, choice);

  /**
   * Preparing assistance and recording a supervisory decision are supervisory acts.
   * Auditors and other read-only roles see the advisory content but cannot act on it.
   */
  const canApprove = useCan('market_conduct', 'approve');
  const canManageComplaints = useCan('market_conduct', 'manage_complaints');
  const canRunAnalytics = useCan('market_conduct', 'run_conduct_analytics');
  const canOperateAdvisory = canApprove || canManageComplaints || canRunAnalytics;

  const win = snapshot?.window;
  const comparisonPhrase = useMemo(() => {
    const option = CONDUCT_360_WINDOW_OPTIONS.find((o) => o.value === choice);
    return `compared with the preceding ${option ? option.label.replace('Last ', '') : 'window'}`;
  }, [choice]);

  const entity = snapshot?.entity;

  const complaintColumns: FactColumn[] = [
    { key: 'reference', header: 'Complaint' },
    { key: 'subject', header: 'Subject', render: (i) => String(i.subject ?? '—') },
    { key: 'category', header: 'Category', render: (i) => humanise(i.category as string, 'Uncategorised') },
    { key: 'severity', header: 'Severity', render: (i) => <Badge variant="outline">{severityLabel(i.severity as string)}</Badge> },
    { key: 'status', header: 'Status', render: (i) => statusLabel(i.status as string) },
    { key: 'consumer_harm_level', header: 'Consumer harm', render: (i) => harmLabel(i.consumer_harm_level as string) },
    { key: 'product', header: 'Product', render: (i) => humanise(i.product as string, 'Not recorded') },
    { key: 'channel', header: 'Channel', render: (i) => humanise(i.channel as string, 'Not recorded') },
    { key: 'received_at', header: 'Received', render: (i) => formatDate(i.received_at) },
    { key: 'sla_state', header: 'Deadline', render: (i) => slaStateLabel(i.sla_state as string) },
    { key: 'outcome', header: 'Outcome', render: (i) => outcomeLabel(i.outcome as string) },
  ];

  const redressColumns: FactColumn[] = [
    { key: 'complaint_reference', header: 'Complaint' },
    { key: 'redress_type', header: 'Redress type', render: (i) => humanise(i.redress_type as string, 'Not recorded') },
    { key: 'affected_party', header: 'Affected party', render: (i) => String(i.affected_party ?? '—') },
    { key: 'amount', header: 'Amount', align: 'right', render: (i) => formatAmount(i.amount, (i.currency as string) ?? null) },
    { key: 'action_required', header: 'Action required', render: (i) => String(i.action_required ?? '—') },
    { key: 'due_date', header: 'Due', render: (i) => formatDate(i.due_date) },
    { key: 'status', header: 'Status', render: (i) => statusLabel(i.status as string) },
  ];

  const signalColumns: FactColumn[] = [
    { key: 'reference', header: 'Signal' },
    { key: 'title', header: 'Title', render: (i) => String(i.title ?? '—') },
    { key: 'source', header: 'Source', render: (i) => humanise(i.source as string, 'Not recorded') },
    { key: 'category', header: 'Category', render: (i) => humanise(i.category as string, 'Not classified') },
    { key: 'severity', header: 'Severity', render: (i) => severityLabel(i.severity as string) },
    { key: 'risk_score', header: 'Risk score', align: 'right', render: (i) => formatCount(i.risk_score) },
    { key: 'systemic_potential', header: 'Systemic potential', render: (i) => systemicLabel(i.systemic_potential as string) },
    { key: 'status', header: 'Status', render: (i) => statusLabel(i.status as string) },
    { key: 'raised_at', header: 'Raised', render: (i) => formatDate(i.raised_at) },
  ];

  const alertColumns: FactColumn[] = [
    { key: 'title', header: 'Alert', render: (i) => String(i.title ?? '—') },
    { key: 'kind', header: 'Type', render: (i) => humanise(i.kind as string, 'Not recorded') },
    { key: 'severity', header: 'Severity', render: (i) => severityLabel(i.severity as string) },
    { key: 'status', header: 'Status', render: (i) => statusLabel(i.status as string) },
    { key: 'origin', header: 'Raised by', render: (i) => humanise(i.origin as string, 'Not recorded') },
    { key: 'linked_complaint', header: 'Linked complaint', render: (i) => String(i.linked_complaint ?? '—') },
    { key: 'linked_pattern', header: 'Linked pattern', render: (i) => String(i.linked_pattern ?? '—') },
    { key: 'raised_at', header: 'Raised', render: (i) => formatDate(i.raised_at) },
  ];

  const findingColumns: FactColumn[] = [
    { key: 'reference', header: 'Finding' },
    { key: 'title', header: 'Title', render: (i) => String(i.title ?? '—') },
    { key: 'category', header: 'Category', render: (i) => humanise(i.category as string, 'Not classified') },
    { key: 'severity', header: 'Severity', render: (i) => severityLabel(i.severity as string) },
    { key: 'risk_rating', header: 'Risk rating', render: (i) => humanise(i.risk_rating as string, 'Not rated') },
    { key: 'status', header: 'Status', render: (i) => statusLabel(i.status as string) },
    { key: 'opened_at', header: 'Opened', render: (i) => formatDate(i.opened_at) },
    { key: 'last_reviewed_by', header: 'Owner', render: (i) => String(i.last_reviewed_by ?? '—') },
  ];

  const openItemColumns: FactColumn[] = [
    { key: 'reference', header: 'Reference' },
    { key: 'type', header: 'Item', render: (i) => openItemTypeLabel(i.type as string) },
    { key: 'title', header: 'Detail', render: (i) => String(i.title ?? '—') },
    { key: 'status', header: 'Status', render: (i) => statusLabel(i.status as string) },
    { key: 'due_date', header: 'Due', render: (i) => formatDate(i.due_date) },
  ];

  const activityColumns: FactColumn[] = [
    { key: 'reference', header: 'Reference' },
    { key: 'event', header: 'Activity', render: (i) => humanise((i.event ?? i.type) as string, 'Activity recorded') },
    { key: 'detail', header: 'Detail', render: (i) => String(i.detail ?? '—') },
    { key: 'occurred_at', header: 'When', render: (i) => formatDateTime(i.occurred_at ?? i.at) },
    { key: 'source', header: 'Register', render: (i) => humanise(i.source as string, 'Not recorded') },
  ];

  const patternItems = Array.isArray(snapshot?.patterns?.items) ? snapshot!.patterns!.items! : [];
  const trendMeasures = (snapshot?.trends?.measures ?? {}) as Record<string, unknown>;
  const sectorComparison = ((snapshot?.product_channel?.measures ?? {}) as Record<string, unknown>).sector_comparison as Record<string, unknown> | undefined;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title={`Conduct 360${entity?.name ? ` — ${entity.name}` : ''}`}
          description="Consolidated conduct supervision view built only from recorded regulatory data and published rule outcomes."
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/conduct/entities"><ArrowLeft className="h-4 w-4 mr-2" />Back to entities</Link>
          </Button>
          <div className="flex items-center gap-3">
            {win && (
              <p className="text-xs text-muted-foreground">
                Window {formatDate(win.start)} to {formatDate(win.end)} · comparison window {formatDate(win.comparison_start)} to {formatDate(win.comparison_end)}
              </p>
            )}
            <Select value={choice} onValueChange={(v) => setChoice(v as Conduct360WindowChoice)}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDUCT_360_WINDOW_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ClassificationLegend />

        {isLoading && (
          <Card><CardContent className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></CardContent></Card>
        )}

        {!isLoading && isDenied && (
          <Card>
            <CardContent className="p-8 text-center space-y-2">
              <ShieldAlert className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">This entity is outside your supervisory remit</p>
              <p className="text-xs text-muted-foreground">Ask your supervisor if you need conduct access to this entity.</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isDenied && error && (
          <Card>
            <CardContent className="p-8 text-center space-y-2">
              <p className="text-sm font-medium">The Conduct 360 view could not be loaded</p>
              <p className="text-xs text-muted-foreground">Please try again, or choose a different window.</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isDenied && !error && snapshot && (
          <div className="space-y-4">
            {/* 1 — Entity context */}
            <Conduct360Section
              title="Entity context"
              description="Registry position of the supervised entity."
              source={entity?.source}
              isEmpty={!entity?.name}
              emptyMessage="Entity registry details are not available."
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Entity', entity?.name],
                  ['Licence status', entity?.licence_status ? statusLabel(entity.licence_status) : null],
                  ['Sector', entity?.sector],
                  ['Sub-sector', entity?.sub_sector],
                  ['Regulator', entity?.regulator],
                  ['Systemic importance', entity?.systemic_importance ? humanise(entity.systemic_importance) : null],
                  ['Assigned supervisor', entity?.supervisor],
                  ['Portfolio officer', entity?.portfolio_officer],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium mt-1">{value ? String(value) : 'Not recorded'}</p>
                  </div>
                ))}
              </div>
              <FactItemTable
                items={(entity?.licences ?? []) as Array<Record<string, unknown>>}
                emptyMessage="No licences recorded for this entity."
                columns={[
                  { key: 'reference', header: 'Licence' },
                  { key: 'type', header: 'Type', render: (i) => humanise(i.type as string, 'Not recorded') },
                  { key: 'status', header: 'Status', render: (i) => statusLabel(i.status as string) },
                  { key: 'valid_from', header: 'Valid from', render: (i) => formatDate(i.valid_from) },
                  { key: 'valid_until', header: 'Valid until', render: (i) => formatDate(i.valid_until) },
                ]}
              />
            </Conduct360Section>

            {/* 2 — Conduct posture */}
            <Conduct360Section
              title="Conduct posture and key measures"
              description="Headline conduct measures for the selected window, calculated by the regulator's systems."
              source={snapshot.posture?.source}
              isEmpty={sectionIsEmpty(snapshot.posture)}
              emptyMessage="No conduct activity recorded for this entity in this window."
            >
              <MeasureTiles measures={snapshot.posture?.measures} />
            </Conduct360Section>

            {/* 3 — Complaints and outcomes */}
            <Conduct360Section
              title="Complaints and outcomes"
              description="Consumer complaints received in the window and the outcomes recorded against them."
              source={snapshot.complaints?.source}
              isEmpty={sectionIsEmpty(snapshot.complaints)}
              emptyMessage="No complaints recorded in this window."
            >
              <MeasureTiles measures={snapshot.complaints?.measures} keys={['total']} columns={4} />
              <div className="grid gap-3 lg:grid-cols-3">
                <BreakdownList title="By status" data={(snapshot.complaints?.measures as Record<string, unknown>)?.by_status} labelFn={statusLabel} />
                <BreakdownList title="By severity" data={(snapshot.complaints?.measures as Record<string, unknown>)?.by_severity} labelFn={severityLabel} />
                <BreakdownList title="By category" data={(snapshot.complaints?.measures as Record<string, unknown>)?.by_category} labelFn={(k) => humanise(k, 'Uncategorised')} />
                <BreakdownList title="By outcome" data={(snapshot.complaints?.measures as Record<string, unknown>)?.by_outcome} labelFn={outcomeLabel} />
                <SeriesList title="By month received" items={(snapshot.complaints?.measures as Record<string, unknown>)?.by_month} labelField="month" valueField="count" labelFn={monthLabel} />
              </div>
              <FactItemTable items={snapshot.complaints?.items} columns={complaintColumns} emptyMessage="No complaints recorded in this window." />
            </Conduct360Section>

            {/* 4 — Redress */}
            <Conduct360Section
              title="Redress"
              description="Redress required of the entity and what has been paid or verified."
              source={snapshot.redress?.source}
              isEmpty={sectionIsEmpty(snapshot.redress)}
              emptyMessage="No redress recorded in this window."
            >
              <MeasureTiles measures={snapshot.redress?.measures} />
              <FactItemTable items={snapshot.redress?.items} columns={redressColumns} linkColumnKey="complaint_reference" emptyMessage="No redress items recorded in this window." />
            </Conduct360Section>

            {/* 5 — Conduct signals */}
            <Conduct360Section
              title="Conduct signals"
              description="Conduct intelligence raised against this entity."
              source={snapshot.signals?.source}
              isEmpty={sectionIsEmpty(snapshot.signals)}
              emptyMessage="No conduct signals raised in this window."
            >
              <MeasureTiles measures={snapshot.signals?.measures} keys={['total', 'systemic_potential_high']} columns={4} />
              <div className="grid gap-3 lg:grid-cols-2">
                <BreakdownList title="By status" data={(snapshot.signals?.measures as Record<string, unknown>)?.by_status} labelFn={statusLabel} />
                <BreakdownList title="By severity" data={(snapshot.signals?.measures as Record<string, unknown>)?.by_severity} labelFn={severityLabel} />
              </div>
              <FactItemTable items={snapshot.signals?.items} columns={signalColumns} emptyMessage="No conduct signals raised in this window." />
            </Conduct360Section>

            {/* 6 — Patterns (rule outcomes) */}
            <Conduct360Section
              title="Detected patterns"
              classification="RULE_OUTCOME"
              description="Produced by published deterministic rules. Each detection states the measure, the threshold and why it matched."
              source={snapshot.patterns?.source}
              isEmpty={sectionIsEmpty(snapshot.patterns)}
              emptyMessage="No patterns detected for this entity in this window."
            >
              <MeasureTiles measures={snapshot.patterns?.measures} keys={['total', 'confirmed', 'under_review', 'dismissed']} />
              <div className="space-y-3">
                {patternItems.map((p, i) => (
                  <div key={`${String(p.reference ?? i)}`} className="rounded-md border p-4 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        {typeof p.href === 'string' ? (
                          <Link to={p.href} className="font-medium text-primary hover:underline">{String(p.reference ?? 'Pattern')}</Link>
                        ) : (
                          <span className="font-medium">{String(p.reference ?? 'Pattern')}</span>
                        )}
                        <p className="text-sm">{String(p.title ?? '—')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{humanise(p.pattern_type as string, 'Pattern')}</Badge>
                        <Badge variant="outline">{severityLabel(p.severity as string)}</Badge>
                        <Badge variant="outline">{statusLabel(p.status as string)}</Badge>
                      </div>
                    </div>
                    <p className="text-sm">
                      {measureLabel(String(p.measure ?? 'Measure'))}: <span className="font-mono font-medium">{formatCount(p.measured_value)}{p.measure_unit ? ` ${humanise(p.measure_unit as string, '')}` : ''}</span>
                      {' '}— {comparisonLabel(p.comparison as string)} the threshold of <span className="font-mono font-medium">{formatCount(p.threshold_value)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Measured over {formatDate(p.window_start)} to {formatDate(p.window_end)}
                      {p.window_days ? ` (${formatCount(p.window_days)} days)` : ''} · {formatCount(p.contributing_record_count)} contributing records
                      {p.raised_signal ? ` · signal raised: ${String(p.raised_signal)}` : ''}
                    </p>
                    {p.why_it_matched && (
                      <p className="text-sm rounded-md bg-muted/40 p-2">Why it matched: {String(p.why_it_matched)}</p>
                    )}
                    <FactItemTable
                      items={(p.contributing_records ?? []) as Array<Record<string, unknown>>}
                      emptyMessage="No contributing records recorded."
                      maxRows={10}
                      columns={[
                        { key: 'reference', header: 'Record' },
                        { key: 'type', header: 'Type', render: (r) => humanise(r.type as string, 'Record') },
                        { key: 'title', header: 'Detail', render: (r) => String(r.title ?? '—') },
                        { key: 'severity', header: 'Severity', render: (r) => severityLabel(r.severity as string) },
                        { key: 'occurred_at', header: 'When', render: (r) => formatDate(r.occurred_at) },
                      ]}
                    />
                  </div>
                ))}
              </div>
            </Conduct360Section>

            {/* 7 — Alerts */}
            <Conduct360Section
              title="Conduct alerts"
              classification="RULE_OUTCOME"
              description="Alerts raised for supervisory attention, with the complaint or pattern that triggered them."
              source={snapshot.alerts?.source}
              isEmpty={sectionIsEmpty(snapshot.alerts)}
              emptyMessage="No conduct alerts raised in this window."
            >
              <MeasureTiles measures={snapshot.alerts?.measures} keys={['total', 'open']} columns={4} />
              <div className="grid gap-3 lg:grid-cols-2">
                <BreakdownList title="By type" data={(snapshot.alerts?.measures as Record<string, unknown>)?.by_kind} labelFn={(k) => humanise(k, 'Not recorded')} />
                <BreakdownList title="By severity" data={(snapshot.alerts?.measures as Record<string, unknown>)?.by_severity} labelFn={severityLabel} />
              </div>
              <FactItemTable items={snapshot.alerts?.items} columns={alertColumns} emptyMessage="No conduct alerts raised in this window." />
            </Conduct360Section>

            {/* 8 — Products and channels */}
            <Conduct360Section
              title="Products and channels"
              description="Where the conduct activity arises, and how the entity sits against its sector."
              source={snapshot.product_channel?.source}
              isEmpty={sectionIsEmpty(snapshot.product_channel)}
              emptyMessage="No product or channel data recorded for this window."
            >
              <div className="grid gap-3 lg:grid-cols-3">
                <BreakdownList title="Complaints by product" data={(snapshot.product_channel?.measures as Record<string, unknown>)?.complaints_by_product} labelFn={(k) => humanise(k, 'Not recorded')} />
                <BreakdownList title="Complaints by channel" data={(snapshot.product_channel?.measures as Record<string, unknown>)?.complaints_by_channel} labelFn={(k) => humanise(k, 'Not recorded')} />
                <BreakdownList title="Signals by product" data={(snapshot.product_channel?.measures as Record<string, unknown>)?.signals_by_product} labelFn={(k) => humanise(k, 'Not recorded')} />
              </div>
              {sectorComparison && (
                <div className="rounded-md border p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sector comparison</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.entries(sectorComparison).map(([k, v]) => (
                      <div key={k}>
                        <p className="text-xs text-muted-foreground">{measureLabel(k)}</p>
                        <p className="text-sm font-mono font-medium">{typeof v === 'number' ? formatCount(v) : String(v ?? '—')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Conduct360Section>

            {/* 9 — Risk indicators and findings */}
            <Conduct360Section
              title="Conduct risk indicators and findings"
              description="Recorded risk classifications and supervisory findings for this entity."
              source={snapshot.risk_indicators?.source}
              isEmpty={sectionIsEmpty(snapshot.risk_indicators)}
              emptyMessage="No conduct risk classifications or findings recorded in this window."
            >
              <MeasureTiles measures={snapshot.risk_indicators?.measures} keys={['findings_recorded']} columns={4} />
              <div className="grid gap-3 lg:grid-cols-3">
                <BreakdownList title="Complaints by risk category" data={(snapshot.risk_indicators?.measures as Record<string, unknown>)?.complaints_by_risk_category} labelFn={(k) => humanise(k, 'Not classified')} />
                <BreakdownList title="Complaints by conduct risk level" data={(snapshot.risk_indicators?.measures as Record<string, unknown>)?.complaints_by_conduct_risk_level} labelFn={(k) => humanise(k, 'Not rated')} />
                <BreakdownList title="Signals by risk category" data={(snapshot.risk_indicators?.measures as Record<string, unknown>)?.signals_by_risk_category} labelFn={(k) => humanise(k, 'Not classified')} />
              </div>
              <FactItemTable items={snapshot.risk_indicators?.items} columns={findingColumns} emptyMessage="No findings recorded in this window." />
            </Conduct360Section>

            {/* 10 — Trends */}
            <Conduct360Section
              title="Movement against the previous window"
              description="Each statement compares this window with the immediately preceding window of equal length."
              source={snapshot.trends?.source}
              isEmpty={Object.keys(trendMeasures).length === 0}
              emptyMessage="No comparable activity in either window."
            >
              <div className="grid gap-3 lg:grid-cols-2">
                {Object.keys(trendMeasures).map((key) => (
                  <TrendStatement key={key} measureKey={key} trend={trendMeasures[key]} comparisonLabel={comparisonPhrase} />
                ))}
              </div>
            </Conduct360Section>

            {/* 11 — Open supervisory items */}
            <Conduct360Section
              title="Open supervisory items"
              description="Work still outstanding on this entity across complaints, investigations, information requests and actions."
              source={snapshot.open_items?.source}
              isEmpty={sectionIsEmpty(snapshot.open_items)}
              emptyMessage="Nothing outstanding for this entity."
            >
              <MeasureTiles measures={snapshot.open_items?.measures} />
              <FactItemTable items={snapshot.open_items?.items} columns={openItemColumns} emptyMessage="Nothing outstanding for this entity." />
            </Conduct360Section>

            {/* 12 — Recent material activity */}
            <Conduct360Section
              title="Recent material activity"
              description="The most recent material events recorded against this entity."
              source={snapshot.recent_activity?.source}
              isEmpty={sectionIsEmpty(snapshot.recent_activity)}
              emptyMessage="No material activity recorded in this window."
            >
              <FactItemTable items={snapshot.recent_activity?.items} columns={activityColumns} emptyMessage="No material activity recorded in this window." />
            </Conduct360Section>

            {snapshot.generated_at && (
              <p className="text-xs text-muted-foreground text-right">
                Prepared from regulatory records on {formatDateTime(snapshot.generated_at)}
              </p>
            )}

            {/* AI advisory layer — separated from the fact layer above */}
            <AdvisoryPanel entityId={entityId} windowChoice={choice} canOperate={canOperateAdvisory} />

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
