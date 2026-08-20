/**
 * Entity 360 identity header.
 *
 * Establishes, at a glance and on every section: which entity is open, what it
 * is, whether it is authorised, how risky it is and who supervises it. The
 * header stays visible while the regulator moves between domains.
 */
import { Link } from 'react-router-dom';
import {
  Building2, CalendarClock, History, Network, ShieldCheck, UserCog,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/presentation/StatusBadge';
import { formatDate } from '@/lib/presentation/format';
import { humanize } from '@/lib/presentation/statusLabels';
import type { Entity360Overview } from '@/hooks/useEntity360';

export interface Entity360HeaderProps {
  overview: Entity360Overview;
  asOf: string | null;
  onClearAsOf: () => void;
}

export function Entity360Header({ overview, asOf, onClearAsOf }: Entity360HeaderProps) {
  const e = overview.entity!;
  const risk = overview.risk_score_current;
  const supervisor = overview.supervision?.assignment;

  // Sector / sub-sector / category often repeat for single-activity entities;
  // collapse duplicates so the classification line reads as one statement.
  const classification = [...new Set(
    [e.sector, e.sub_sector, e.category]
      .filter(Boolean)
      .map((v) => humanize(String(v))),
  )];


  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            Regulated entity
          </div>
          <h1 className="truncate text-2xl font-semibold leading-tight">{e.name}</h1>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge code={e.status} />
            {e.lifecycle_stage && <StatusBadge code={e.lifecycle_stage} tone="info" />}
            {e.identity_status && <StatusBadge code={e.identity_status} />}
            {e.systemic_importance && (
              <StatusBadge
                code={e.systemic_importance}
                tone={/^(high|systemic|d_?sib)/i.test(String(e.systemic_importance)) ? 'warning' : 'neutral'}
                description="Systemic importance classification"
              />
            )}
          </div>

          {classification.length > 0 && (
            <p className="text-sm text-muted-foreground">{classification.join(' › ')}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Button asChild variant="outline" size="sm">
            <Link to={`/entities/${e.id}/structure`}>
              <Network className="mr-2 h-4 w-4" />Structure workspace
            </Link>
          </Button>
          {e.public_slug && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/registry/entities/${e.public_slug}`}>
                <ShieldCheck className="mr-2 h-4 w-4" />Public register
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-4 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Risk band</p>
          <div className="mt-1 flex items-center gap-2">
            {risk?.band || overview.risk?.overall_rating
              ? <StatusBadge code={risk?.band ?? overview.risk?.overall_rating} />
              : <span className="text-muted-foreground">Not rated</span>}
            {risk?.score != null && <span className="font-medium">Score {risk.score}</span>}
          </div>
          {risk?.period_key && <p className="mt-0.5 text-xs text-muted-foreground">Period {risk.period_key}</p>}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Supervisor</p>
          <p className="mt-1 flex items-center gap-1.5 font-medium">
            <UserCog className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {supervisor?.supervisor_name ?? 'Unassigned'}
          </p>
          {supervisor?.team && <p className="mt-0.5 text-xs text-muted-foreground">{supervisor.team}</p>}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Supervisory cycle</p>
          <p className="mt-1 flex items-center gap-1.5 font-medium">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {supervisor?.supervisory_cycle ? humanize(supervisor.supervisory_cycle) : 'Not set'}
          </p>
          {supervisor?.cycle_start && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatDate(supervisor.cycle_start)} – {supervisor.cycle_end ? formatDate(supervisor.cycle_end) : 'open'}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Reporting</p>
          {overview.returns_summary ? (
            <>
              <p className="mt-1 font-medium">
                {overview.returns_summary.filings} filings · {overview.returns_summary.obligations} obligations
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {overview.returns_summary.overdue > 0
                  ? `${overview.returns_summary.overdue} overdue`
                  : 'Nothing overdue'}
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted-foreground">Not available</p>
          )}
        </div>
      </div>

      {asOf && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/40 px-4 py-2 text-sm">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" aria-hidden />
            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground">
              Historic view
            </Badge>
            Showing recorded state as at {formatDate(asOf)}.
          </span>
          <Button variant="ghost" size="sm" onClick={onClearAsOf}>Return to current state</Button>
        </div>
      )}
    </div>
  );
}

export default Entity360Header;
