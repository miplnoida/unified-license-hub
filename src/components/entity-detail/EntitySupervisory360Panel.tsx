/**
 * EPIC 4 / W3 — the enterprise Entity 360 supervisory panel.
 *
 * Answers, for one regulated entity, the seven supervisory questions:
 * what do we know, what is the current risk, why is it that risk, what has
 * changed, what are we doing about it, what remains open, and what must happen
 * next. Every value is read from `entity_supervisory_360`, which reads the
 * authoritative supervisory records only. Nothing here is recomputed, averaged
 * or inferred in the browser, and "no assessment" is never shown as low risk.
 */
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Gavel,
  Layers,
  ShieldAlert,
  Target,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtDate, ratingTone, statusTone, titleCase, trendTone } from '@/lib/amlLabels';
import {
  DOMAIN_LABELS,
  useEntitySupervisory360,
  type Entity360DomainState,
  type Entity360NextAction,
} from '@/hooks/useEntitySupervisory360';

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function NextActionCard({ action, heading }: { action: Entity360NextAction | null; heading: string }) {
  if (!action) {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        No supervisory action is outstanding on the canonical work model.
      </div>
    );
  }
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{heading}</span>
        <Badge variant="outline">{action.work_type_label}</Badge>
        {action.priority ? <Badge className={ratingTone(action.priority)}>{titleCase(action.priority)}</Badge> : null}
        {action.is_overdue ? <Badge variant="destructive">Overdue</Badge> : null}
      </div>
      <div className="mt-2 font-medium">{action.title || action.reference || 'Supervisory action'}</div>
      <div className="text-xs text-muted-foreground">
        {action.reason}
        {action.due_date ? ` · due ${fmtDate(action.due_date)}` : ''}
      </div>
      <Button asChild size="sm" variant="outline" className="mt-2">
        <Link to={action.route}>
          Open record <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function DomainCard({ domain }: { domain: Entity360DomainState }) {
  const label = DOMAIN_LABELS[domain.domain_code] ?? titleCase(domain.domain_code);
  const assessment = domain.driving_assessment;
  const openWork =
    domain.open_findings + domain.overdue_remediation + domain.validation_pending +
    domain.open_attention.length + domain.active_enforcement.length;

  if (!domain.is_assessed && openWork === 0 && !domain.reassessment_required) {
    return (
      <div className="rounded-md border border-dashed p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{label}</span>
          <Badge variant="outline">Not assessed</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          No approved assessment and no supervisory activity in this domain. Absence of an
          assessment is not a low-risk judgment.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={ratingTone(domain.residual_rating)}>
            {titleCase(domain.residual_rating) || 'Not rated'}
          </Badge>
          {domain.trend ? <Badge className={trendTone(domain.trend)}>{titleCase(domain.trend)}</Badge> : null}
          {domain.reassessment_required ? <Badge variant="destructive">Reassessment required</Badge> : null}
          {domain.assessment_overdue ? <Badge variant="destructive">Review overdue</Badge> : null}
        </div>
      </div>

      <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span>
          Inherent {titleCase(domain.inherent_rating) || '—'} · Control {titleCase(domain.control_rating) || '—'}
        </span>
        <span>
          Previous {titleCase(domain.prior_rating) || '—'} · Last review {fmtDate(domain.last_review_date) || '—'} ·
          Next review {fmtDate(domain.next_review_date) || '—'}
        </span>
      </div>

      {assessment ? (
        <div className="rounded-md bg-muted/50 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Why this rating</span>
            <Link className="underline" to={assessment.route}>
              {assessment.reference || 'Assessment'}
            </Link>
            {assessment.is_driving_risk_state ? (
              <Badge variant="outline">Drives risk state</Badge>
            ) : (
              <Badge variant="outline">Not the driving assessment</Badge>
            )}
          </div>
          <div className="mt-1 text-muted-foreground">
            {titleCase(assessment.assessment_type) || 'Assessment'}
            {assessment.trigger_type ? ` · ${titleCase(assessment.trigger_type)}` : ''}
            {assessment.methodology?.code
              ? ` · ${assessment.methodology.code} v${assessment.methodology_version ?? assessment.methodology.version ?? '—'}`
              : ''}
            {assessment.approved_at ? ` · approved ${fmtDate(assessment.approved_at)}` : ''}
          </div>
          {assessment.summary ? <p className="mt-1">{assessment.summary}</p> : null}
          {domain.material_dimensions.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {domain.material_dimensions.slice(0, 4).map((d) => (
                <li key={d.code}>
                  <span className="font-medium">{titleCase(d.code)}</span>: {titleCase(d.residual) || '—'}
                  {d.rationale ? ` — ${d.rationale}` : ''}
                  {d.overridden ? ' (overridden)' : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No approved assessment drives this domain’s risk state.
        </p>
      )}

      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <div className="uppercase tracking-wide text-muted-foreground">What we are doing</div>
          <ul className="mt-1 space-y-0.5">
            {domain.open_attention.slice(0, 3).map((a) => (
              <li key={a.id}>
                <Link className="underline" to={a.route}>{a.reference || 'Attention'}</Link>{' '}
                {a.title ? `— ${a.title}` : ''} ({titleCase(a.status)})
              </li>
            ))}
            {domain.current_plan ? (
              <li>
                Plan <Link className="underline" to={domain.current_plan.route}>{domain.current_plan.reference || 'Plan'}</Link>{' '}
                ({titleCase(domain.current_plan.status)})
              </li>
            ) : null}
            {domain.active_intervention ? (
              <li>
                Intervention{' '}
                <Link className="underline" to={domain.active_intervention.route}>
                  {domain.active_intervention.reference || titleCase(domain.active_intervention.intervention_type)}
                </Link>{' '}
                ({titleCase(domain.active_intervention.status)})
              </li>
            ) : null}
            {domain.active_examination ? (
              <li>
                {titleCase(domain.active_examination.engagement_type) || 'Examination'}{' '}
                <Link className="underline" to={domain.active_examination.route}>
                  {domain.active_examination.reference || 'Examination'}
                </Link>{' '}
                ({titleCase(domain.active_examination.stage)})
              </li>
            ) : null}
            {domain.open_attention.length === 0 && !domain.current_plan &&
             !domain.active_intervention && !domain.active_examination ? (
              <li className="text-muted-foreground">No active supervisory activity.</li>
            ) : null}
          </ul>
        </div>
        <div>
          <div className="uppercase tracking-wide text-muted-foreground">What remains open</div>
          <ul className="mt-1 space-y-0.5">
            {domain.findings.slice(0, 3).map((f) => (
              <li key={f.id}>
                <Link className="underline" to={f.route}>{f.reference || 'Finding'}</Link>{' '}
                <Badge className={ratingTone(f.severity)}>{titleCase(f.severity) || '—'}</Badge>{' '}
                {titleCase(f.status)}
              </li>
            ))}
            {domain.overdue_remediation_items.slice(0, 3).map((r) => (
              <li key={r.id}>
                Overdue remediation{' '}
                <Link className="underline" to={r.route}>{r.reference || 'Action'}</Link>{' '}
                (target {fmtDate(r.target_date) || '—'})
              </li>
            ))}
            {domain.validation_pending > 0 ? (
              <li>{domain.validation_pending} remediation action(s) awaiting supervisory validation.</li>
            ) : null}
            {domain.ineffective_remediation > 0 ? (
              <li>{domain.ineffective_remediation} remediation action(s) judged not fully effective.</li>
            ) : null}
            {domain.active_enforcement.map((x) => (
              <li key={x.id}>
                <Gavel className="mr-1 inline h-3 w-3" />
                <Link className="underline" to={x.route}>{x.case_number || 'Enforcement'}</Link>{' '}
                {titleCase(x.enforcement_type)} ({titleCase(x.stage) || titleCase(x.status)})
              </li>
            ))}
            {domain.reassessment.filter((r) => ['REQUIRED', 'IN_PROGRESS'].includes(String(r.status ?? '').toUpperCase())).map((r) => (
              <li key={r.id}>
                Reassessment {titleCase(r.status)} — {titleCase(r.trigger_kind)}
                {r.due_date ? ` (due ${fmtDate(r.due_date)})` : ''}
              </li>
            ))}
            {domain.findings.length === 0 && domain.overdue_remediation_items.length === 0 &&
             domain.validation_pending === 0 && domain.ineffective_remediation === 0 &&
             domain.active_enforcement.length === 0 && !domain.reassessment_required ? (
              <li className="text-muted-foreground">Nothing outstanding.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <NextActionCard action={domain.next_action} heading="Next action in this domain" />
    </div>
  );
}

export function EntitySupervisory360Panel({ entityId }: { entityId: string }) {
  const { data, isLoading, error } = useEntitySupervisory360(entityId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Enterprise supervisory state</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Enterprise supervisory state</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Unable to load the canonical supervisory state: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  if (!data?.found || !data.entity || !data.summary) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Enterprise supervisory state</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No canonical supervisory record exists for this entity yet.
        </CardContent>
      </Card>
    );
  }

  const { entity, summary, domains, next_action: nextAction } = data;
  const primaryLicence = entity.licences.find((l) => l.is_primary) ?? entity.licences[0] ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" /> Enterprise supervisory state
          </CardTitle>
          <CardDescription>
            One supervisory view of {entity.name ?? 'this entity'} across all risk domains. Every
            rating, count and action is read from the authoritative supervisory record.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Highest material risk"
              value={
                <Badge className={ratingTone(summary.highest_material_risk)}>
                  {titleCase(summary.highest_material_risk) || 'None material'}
                </Badge>
              }
              hint={`${summary.domains_assessed} of ${domains.length} domains assessed`}
            />
            <Tile
              label="Domains of concern"
              value={summary.domains_of_concern.length}
              hint={
                summary.domains_of_concern.length
                  ? summary.domains_of_concern.map((d) => DOMAIN_LABELS[d] ?? titleCase(d)).join(', ')
                  : 'No domain currently rated materially elevated'
              }
            />
            <Tile
              label="Open findings"
              value={summary.open_findings}
              hint={`${summary.critical_findings} critical · ${summary.overdue_remediation} overdue remediation`}
            />
            <Tile
              label="Open supervisory work"
              value={summary.open_work_items}
              hint={`${summary.overdue_work_items} overdue · ${summary.active_enforcement} active enforcement`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{entity.sector ?? 'Sector not set'}</Badge>
            {entity.sub_sector ? <Badge variant="outline">{entity.sub_sector}</Badge> : null}
            {entity.status ? <Badge className={statusTone(entity.status)}>{titleCase(entity.status)}</Badge> : null}
            {entity.systemic_importance ? (
              <Badge variant="outline">Systemic: {titleCase(entity.systemic_importance)}</Badge>
            ) : null}
            {primaryLicence ? (
              <span>
                Licence {primaryLicence.license_number ?? '—'} ({titleCase(primaryLicence.status)})
                {primaryLicence.valid_until ? ` · valid to ${fmtDate(primaryLicence.valid_until)}` : ''}
              </span>
            ) : (
              <span>No licence of record</span>
            )}
            {entity.group_memberships.map((g) => (
              <Badge key={g.group_id} variant="outline">
                Group: {g.group_name} ({titleCase(g.member_role)})
              </Badge>
            ))}
            {summary.supervisory_priority ? (
              <Badge className={ratingTone(summary.supervisory_priority)}>
                Priority {titleCase(summary.supervisory_priority)}
              </Badge>
            ) : null}
          </div>

          {summary.cross_domain_concern_present ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <span>
                Elevated risk is present in more than one domain (
                {summary.domains_of_concern.map((d) => DOMAIN_LABELS[d] ?? titleCase(d)).join(', ')}). The
                cross-domain position is a supervisory judgment — it is not an average of the domain
                ratings.
              </span>
            </div>
          ) : null}

          {summary.restricted_matter_present ? (
            <div className="flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4" />
              <span>
                Restricted supervisory matters exist for this entity. Their content is only visible to
                authorised staff.
              </span>
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4" /> What must happen next
            </div>
            <NextActionCard action={nextAction} heading="Highest-priority supervisory obligation" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" /> Risk domains
          </CardTitle>
          <CardDescription>
            Each domain keeps its own approved assessment, findings and remediation. Joint supervision
            does not merge domain judgments.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {domains.map((d) => (
            <DomainCard key={d.domain_code} domain={d} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
