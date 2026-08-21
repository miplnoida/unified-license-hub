/**
 * Package A4 — Entity 360 supervisory state.
 *
 * Presents the A2/A3 evidence chain for one entity in supervisory language:
 * what the canonical returns say, which prudential signals fired and whether a
 * supervisor has acknowledged them, what conduct work is live, and which
 * decision artefacts have been issued. Served entirely by
 * `sup_entity_supervisory_state`, so permissions decide which blocks appear.
 */
import { Link } from 'react-router-dom';
import {
  AlertTriangle, FileCheck2, Gavel, MessageSquareWarning, ScrollText, ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiTile } from '@/components/presentation/KpiTile';
import { formatCount, formatDate, formatNumber, formatTimestamp } from '@/lib/presentation/format';
import { humanize } from '@/lib/presentation/statusLabels';
import { useSupEntitySupervisoryState } from '@/hooks/useSupervisoryReadModels';

export function EntitySupervisoryStatePanel({ entityId }: { entityId: string }) {
  const { data, isLoading, error } = useSupEntitySupervisoryState(entityId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Supervisory state</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Supervisory state</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {error ? (error as Error).message : 'No supervisory state available.'}
        </CardContent>
      </Card>
    );
  }

  const r = data.returns;
  const p = data.prudential;
  const c = data.conduct;
  const l = data.licensing;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-primary" /> Supervisory state
          </CardTitle>
          <CardDescription>
            Detection-to-action position as at {formatTimestamp(data.generated_at)}. Every figure is
            derived from canonical returns, detection runs and governed decisions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {r && (
            <>
              <KpiTile
                label="Filings awaiting review"
                value={formatCount(r.filings_awaiting_review)}
                hint={`${formatCount(r.filings_total)} filings on record`}
                tone={r.filings_awaiting_review > 0 ? 'progress' : 'positive'}
                icon={ScrollText}
                to="/returns/queue?status=SUBMITTED"
              />
              <KpiTile
                label="Overdue filings"
                value={formatCount(r.filings_overdue)}
                hint={r.next_due ? `Next due ${formatDate(r.next_due.due_date)} (${r.next_due.period_label})` : 'No future period scheduled'}
                tone={r.filings_overdue > 0 ? 'critical' : 'positive'}
                icon={AlertTriangle}
                to="/returns/queue?overdue=1"
              />
            </>
          )}
          {p && (
            <KpiTile
              label="Unacknowledged signals"
              value={formatCount(p.unacknowledged)}
              hint={`${formatCount(p.current_breaches)} breaches · ${formatCount(p.current_ewis)} early warnings`}
              tone={p.unacknowledged > 0 ? 'critical' : 'positive'}
              icon={ShieldAlert}
              to="/supervision/breaches"
            />
          )}
          {c && (
            <KpiTile
              label="Open conduct work"
              value={formatCount(c.open_investigations + c.open_conduct_actions + c.open_thematic_actions)}
              hint={`${formatCount(c.open_complaints)} open complaints · ${formatCount(c.open_alerts)} open alerts`}
              tone={c.open_investigations > 0 ? 'warning' : 'neutral'}
              icon={MessageSquareWarning}
              to="/conduct/investigations"
            />
          )}
          {l && (
            <KpiTile
              label="Decision artefacts issued"
              value={formatCount(l.decision_artifacts)}
              hint={l.latest_decision_artifact
                ? `Latest: ${humanize(l.latest_decision_artifact.artifact_type)} v${l.latest_decision_artifact.version ?? 1}`
                : 'No artefact issued'}
              tone={l.decision_artifacts > 0 ? 'positive' : 'neutral'}
              icon={FileCheck2}
            />
          )}
        </CardContent>
      </Card>

      {p && p.signals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Prudential signals and supervisory response</CardTitle>
            <CardDescription>Threshold outcomes recorded by the detection engine against accepted returns.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {p.signals.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {s.metric_key} {s.comparator ?? ''} {formatNumber(s.threshold_value)}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      observed {formatNumber(s.value)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Detected {formatTimestamp(s.detected_at)} · {humanize(s.detection_source ?? 'engine')}
                    {s.return_filing_id ? ' · from accepted filing' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={s.level === 'breach'
                    ? 'border-destructive/30 bg-destructive/10 text-[10px] text-destructive'
                    : 'border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400'}>
                    {humanize(s.level)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {s.acknowledged_at ? `Acknowledged ${formatDate(s.acknowledged_at)}` : 'Awaiting acknowledgement'}
                  </Badge>
                  {s.escalated_enforcement_id && (
                    <Link to={`/enforcement/${s.escalated_enforcement_id}`} className="text-xs text-primary hover:underline">
                      Directive issued
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {c && (c.investigations.length > 0 || c.thematic.length > 0 || c.conduct_actions.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Conduct consequence chain</CardTitle>
            <CardDescription>Alerts, investigations, thematic findings and required remediation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {c.investigations.map((i) => (
              <Link key={i.id} to={`/conduct/investigations/${i.id}`}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{i.code ?? 'Investigation'}</p>
                  <p className="text-xs text-muted-foreground">
                    {humanize(i.status)}{i.outcome ? ` · Outcome ${humanize(i.outcome)}` : ''}
                    {i.closed_at ? ` · Closed ${formatDate(i.closed_at)}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">{humanize(i.severity ?? 'medium')}</Badge>
              </Link>
            ))}
            {c.thematic.map((t) => (
              <Link key={t.review_id} to={`/supervision/thematic-reviews/${t.review_id}`}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.code ? `${t.code} — ${t.title}` : t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCount(t.findings)} findings · {formatCount(t.actions_open)} remediation actions open
                    {t.closed_at ? ` · Closed ${formatDate(t.closed_at)}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {humanize(t.closure_state ?? t.status)}
                </Badge>
              </Link>
            ))}
            {c.conduct_actions.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {humanize(a.action_type ?? 'action')}{a.due_date ? ` · Due ${formatDate(a.due_date)}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">{humanize(a.status)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {l && l.artifacts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gavel className="h-4 w-4" /> Issued decisions
            </CardTitle>
            <CardDescription>Immutable, versioned decision artefacts with integrity checksums.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {l.artifacts.map((a) => (
              <Link key={a.id} to={`/applications/${a.application_id}`}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {humanize(a.artifact_type)} · v{a.version ?? 1}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.decision ? `${humanize(a.decision)} · ` : ''}Issued {formatDate(a.issued_at)}
                    {a.checksum ? ` · checksum ${a.checksum.slice(0, 12)}…` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">Immutable</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
