/**
 * Entity 360 overview dashboard.
 *
 * Answers the supervisor's first four questions before any drill-down:
 * is the entity authorised, is it reporting, how risky is it, and what is
 * outstanding. Each tile links to the domain that owns the underlying record.
 */
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Banknote, BookUser, Boxes, FileText, Gavel, Mail,
  MessageSquareWarning, ScrollText, ShieldAlert, ShieldCheck, TrendingUp, Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiTile } from '@/components/presentation/KpiTile';
import { DefinitionList } from '@/components/presentation/DefinitionList';
import { StatusBadge } from '@/components/presentation/StatusBadge';
import { formatCount, formatDate } from '@/lib/presentation/format';
import { humanize } from '@/lib/presentation/statusLabels';
import type { StatusTone } from '@/lib/presentation/statusLabels';
import type { E360SectionKey, Entity360Overview as Overview } from '@/hooks/useEntity360';

export interface Entity360OverviewProps {
  overview: Overview;
  /** Opens a section in the profile's section navigation. */
  onOpenSection: (section: E360SectionKey) => void;
  allowed: Partial<Record<E360SectionKey, boolean>>;
}

interface Tile {
  label: string;
  value: string;
  hint?: string;
  tone?: StatusTone;
  icon: typeof TrendingUp;
  section?: E360SectionKey;
}

export function Entity360OverviewPanel({ overview, onOpenSection, allowed }: Entity360OverviewProps) {
  const e = overview.entity!;
  const tiles: Tile[] = [];

  const r = overview.returns_summary;
  if (r) {
    tiles.push({
      label: 'Return filings',
      value: formatCount(r.filings),
      hint: `${r.accepted} accepted · ${r.awaiting_review} in review`,
      tone: r.overdue > 0 ? 'warning' : 'positive',
      icon: ScrollText,
      section: 'returns',
    });
    tiles.push({
      label: 'Overdue filings',
      value: formatCount(r.overdue),
      hint: r.overdue > 0 ? 'Requires follow-up' : 'Entity is up to date',
      tone: r.overdue > 0 ? 'critical' : 'positive',
      icon: AlertTriangle,
      section: 'returns',
    });
  }

  if (overview.prudential) {
    tiles.push({
      label: 'Prudential rating',
      value: overview.prudential.latest_rating ? humanize(overview.prudential.latest_rating) : 'Not rated',
      hint: `${overview.prudential.assessments} assessments · ${overview.prudential.metrics_reported} metrics`,
      tone: 'info',
      icon: Banknote,
      section: 'prudential',
    });
  }

  if (overview.ownership_summary) {
    const o = overview.ownership_summary;
    tiles.push({
      label: 'Ownership',
      value: `${formatCount(o.current_holders)} holders`,
      hint: `${o.controllers} controllers · ${o.ubos} beneficial owners`,
      icon: Boxes,
      section: 'ownership',
    });
  }

  if (overview.governance_summary) {
    const g = overview.governance_summary;
    tiles.push({
      label: 'Appointments',
      value: formatCount(g.current_appointments),
      hint: g.awaiting_approval > 0 ? `${g.awaiting_approval} awaiting approval` : 'All approved',
      tone: g.awaiting_approval > 0 ? 'warning' : 'positive',
      icon: BookUser,
      section: 'governance',
    });
  }

  if (overview.fp_summary) {
    tiles.push({
      label: 'Fit & proper',
      value: formatCount(overview.fp_summary.total),
      hint: `${overview.fp_summary.open} open · ${overview.fp_summary.determined} determined`,
      tone: overview.fp_summary.open > 0 ? 'progress' : 'positive',
      icon: Users,
      section: 'fit_and_proper',
    });
  }

  if (overview.market_conduct) {
    const mc = overview.market_conduct;
    tiles.push({
      label: 'Complaints',
      value: formatCount(mc.complaints),
      hint: `${mc.open_complaints} open · ${mc.alerts_open} conduct alerts`,
      tone: mc.open_complaints > 0 ? 'warning' : 'positive',
      icon: MessageSquareWarning,
      section: 'market_conduct',
    });
  }

  if (overview.aml) {
    const residual = overview.aml.latest?.residual_rating as string | undefined;
    tiles.push({
      label: 'AML residual risk',
      value: residual ? humanize(residual) : 'Not assessed',
      hint: `${overview.aml.open_findings} open findings`,
      tone: overview.aml.open_findings > 0 ? 'warning' : 'info',
      icon: ShieldAlert,
      section: 'aml',
    });
  }

  if (overview.resilience) {
    const res = overview.resilience;
    tiles.push({
      label: 'Resilience',
      value: `${formatCount(res.arrangements)} arrangements`,
      hint: `${res.critical_providers} critical · ${res.open_incidents} open incidents`,
      tone: res.open_incidents > 0 ? 'warning' : 'neutral',
      icon: Boxes,
      section: 'resilience',
    });
  }

  if (overview.examinations) {
    const x = overview.examinations;
    tiles.push({
      label: 'Examinations',
      value: formatCount(x.total),
      hint: `${x.in_progress} in progress · ${x.open_findings} open findings`,
      tone: x.open_findings > 0 ? 'warning' : 'neutral',
      icon: ShieldCheck,
      section: 'examinations',
    });
  }

  if (overview.enforcement) {
    tiles.push({
      label: 'Enforcement',
      value: formatCount(overview.enforcement.total),
      hint: `${overview.enforcement.open} open`,
      tone: overview.enforcement.open > 0 ? 'critical' : 'positive',
      icon: Gavel,
      section: 'enforcement',
    });
  }

  if (overview.regulatory_requests) {
    const rq = overview.regulatory_requests;
    tiles.push({
      label: 'Regulatory requests',
      value: formatCount(rq.total),
      hint: `${rq.open} open · ${rq.change_sets_pending} change sets pending`,
      tone: rq.open > 0 ? 'progress' : 'positive',
      icon: Mail,
      section: 'regulatory_requests',
    });
  }

  if (overview.supervision) {
    tiles.push({
      label: 'Supervisory plans',
      value: formatCount(overview.supervision.plans),
      hint: `${overview.supervision.open_actions} open actions`,
      tone: overview.supervision.open_actions > 0 ? 'progress' : 'positive',
      icon: TrendingUp,
      section: 'supervision',
    });
  }

  const licences = overview.licences ?? [];

  return (
    <div className="space-y-6">
      {tiles.length > 0 && (
        <section aria-label="Supervisory summary" className="space-y-2">
          <h2 className="text-lg font-semibold">Supervisory summary</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <KpiTile
                key={t.label}
                label={t.label}
                value={t.value}
                hint={t.hint}
                tone={t.tone}
                icon={t.icon}
                onClick={t.section && allowed[t.section] !== false ? () => onOpenSection(t.section!) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Entity identity</CardTitle>
            <CardDescription>Canonical registration and regulatory classification.</CardDescription>
          </CardHeader>
          <CardContent>
            <DefinitionList
              columns={2}
              items={[
                { label: 'Registered name', value: e.name, span: 2 },
                { label: 'Entity status', value: <StatusBadge code={e.status} /> },
                { label: 'Lifecycle stage', value: e.lifecycle_stage ? humanize(e.lifecycle_stage) : '—' },
                { label: 'Identity verification', value: <StatusBadge code={e.identity_status} /> },
                { label: 'Systemic importance', value: e.systemic_importance ? humanize(e.systemic_importance) : '—' },
                { label: 'Sector', value: e.sector ? humanize(e.sector) : '—' },
                { label: 'Sub-sector', value: e.sub_sector ? humanize(e.sub_sector) : '—' },
                { label: 'Category', value: e.category ? humanize(e.category) : '—' },
                { label: 'Structure version', value: e.structure_version ?? '—' },
                {
                  label: 'Public register',
                  value: e.public_slug
                    ? <Link className="text-primary underline-offset-4 hover:underline" to={`/registry/entities/${e.public_slug}`}>View public entry</Link>
                    : 'Not published',
                  span: 2,
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Authorisations held</CardTitle>
            <CardDescription>
              {licences.length === 0
                ? 'No licences recorded for this entity.'
                : `${licences.length} licence${licences.length === 1 ? '' : 's'} on the canonical register.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {licences.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Authorisations will appear here once a licence is issued.
              </p>
            )}
            {licences.slice(0, 6).map((l, i) => (
              <div key={String(l.id ?? i)} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {String(l.licence_number ?? l.license_number ?? 'Licence')}
                  </p>
                  <StatusBadge code={l.status as string} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {l.licence_type ? humanize(String(l.licence_type)) : 'Authorisation'}
                  {l.effective_from ? ` · from ${formatDate(l.effective_from)}` : ''}
                  {l.effective_to ? ` · to ${formatDate(l.effective_to)}` : ''}
                </p>
              </div>
            ))}
            {licences.length > 6 && allowed.licences !== false && (
              <button
                type="button"
                onClick={() => onOpenSection('licences')}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                View all {licences.length} licences
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {allowed.documents !== false && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Supporting evidence for every domain is held under Records &amp; provenance.
        </p>
      )}
    </div>
  );
}

export default Entity360OverviewPanel;
