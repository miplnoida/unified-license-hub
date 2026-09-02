/**
 * EPIC 3 / Gate 10 — Entity 360 AML/CFT panel.
 *
 * Renders the canonical AML risk-of-record for one entity, served entirely by
 * the governed `aml_entity_panel` read model (entity_risk_state +
 * supervisory_assessment + supervisory_finding + remediation + examinations).
 * The panel performs NO independent risk calculation: every rating, trend and
 * count below is read from the canonical spine, and each block drills through
 * to the canonical AML workspace record.
 */
import { Link } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, Gavel, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAmlEntityPanel } from '@/hooks/useAmlSupervision';
import { fmtDate, ratingTone, statusTone, titleCase, trendTone } from '@/lib/amlLabels';

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function EntityAmlPanel({ entityId }: { entityId: string }) {
  const { data, isLoading, error } = useAmlEntityPanel(entityId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">AML/CFT risk of record</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">AML/CFT risk of record</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {error ? `Unable to load the canonical AML panel: ${(error as Error).message}` : 'No canonical AML record for this entity yet.'}
        </CardContent>
      </Card>
    );
  }

  const assessment = data.last_approved_assessment as Record<string, any> | null;
  const methodology = data.methodology as Record<string, any> | null;
  const dimensions = (data.high_risk_dimensions ?? []) as Array<Record<string, any>>;
  const examinations = (data.examinations ?? []) as Array<Record<string, any>>;
  const findings = (data.findings ?? []) as Array<Record<string, any>>;
  const remediation = (data.remediation ?? []) as Array<Record<string, any>>;
  const requirements = (data.reassessment_requirements ?? []) as Array<Record<string, any>>;
  const activeExam = examinations.find((e) => !e.closed_at) ?? null;
  const openFindings = findings.filter((f) => !['CLOSED', 'WITHDRAWN', 'SUPERSEDED'].includes(String(f.status ?? '').toUpperCase()));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4" /> AML/CFT risk of record
          </CardTitle>
          <CardDescription>
            Canonical AML risk state — no rating on this page is recomputed in the browser.
            {methodology?.code ? ` Methodology ${methodology.code} v${methodology.version ?? '—'}.` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Current residual risk"
            value={<Badge className={ratingTone(data.residual_rating)}>{titleCase(data.residual_rating) || 'Not rated'}</Badge>}
            hint={`Inherent ${titleCase(data.inherent_rating) || '—'} · Control ${titleCase(data.control_rating) || '—'}`}
          />
          <Tile
            label="Previous risk"
            value={titleCase(data.prior_rating) || '—'}
            hint="From approved risk movement history"
          />
          <Tile
            label="Trend"
            value={<Badge className={trendTone(data.trend)}>{titleCase(data.trend) || 'Stable'}</Badge>}
          />
          <Tile
            label="Next review"
            value={fmtDate(data.next_review_date) || '—'}
            hint={`Last review ${fmtDate(data.last_review_date) || '—'}`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4" /> Last approved assessment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {assessment ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link className="font-medium underline" to={`/supervision/aml/assessments/${assessment.id}`}>
                {assessment.reference}
              </Link>
              <Badge variant="outline">{titleCase(assessment.assessment_type)}</Badge>
              <Badge className={ratingTone(assessment.residual_rating)}>{titleCase(assessment.residual_rating)}</Badge>
              <span className="text-muted-foreground">
                Period {fmtDate(assessment.period_start)} – {fmtDate(assessment.period_end)} · Approved {fmtDate(assessment.approved_at)}
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground">No approved AML assessment of record yet.</p>
          )}

          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">High-risk dimensions</div>
            {dimensions.length ? (
              <div className="flex flex-wrap gap-2">
                {dimensions.map((d) => (
                  <Badge key={String(d.code)} className={ratingTone(d.residual)} variant="outline">
                    {titleCase(d.code)} · {titleCase(d.residual)}{d.overridden ? ' (overridden)' : ''}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">None recorded at MEDIUM_HIGH or above.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" /> Supervisory work in flight
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Tile
              label="Active examination"
              value={activeExam ? (
                <Link className="text-base underline" to={`/examinations/${activeExam.id}`}>{activeExam.reference}</Link>
              ) : '—'}
              hint={activeExam ? titleCase(activeExam.stage) : 'No open AML examination'}
            />
            <Tile
              label="Open findings"
              value={<Link className="underline" to="/supervision/aml/findings">{data.open_findings ?? 0}</Link>}
              hint={`${data.critical_findings ?? 0} high/critical`}
            />
            <Tile
              label="Overdue remediation"
              value={<Link className="underline" to="/supervision/aml/findings">{data.overdue_remediation ?? 0}</Link>}
              hint={`${remediation.length} remediation actions tracked`}
            />
            <Tile
              label="Reassessment required"
              value={
                <Badge className={statusTone(data.reassessment_required ? 'OVERDUE' : 'CLOSED')}>
                  {data.reassessment_required ? 'Yes' : 'No'}
                </Badge>
              }
              hint={requirements.length ? `${requirements.length} requirement(s) on file` : 'No open requirement'}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gavel className="h-4 w-4" /> Enforcement &amp; next supervisory action
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Active AML enforcement:</span>
              <Badge className={statusTone(Number(data.active_enforcement ?? 0) > 0 ? 'ESCALATED' : 'CLOSED')}>
                {data.active_enforcement ?? 0}
              </Badge>
            </div>
            <div className="text-muted-foreground">
              Next supervisory action:{' '}
              {data.reassessment_required
                ? 'Complete the required AML reassessment.'
                : Number(data.overdue_remediation ?? 0) > 0
                  ? 'Escalate overdue remediation actions.'
                  : openFindings.length > 0
                    ? 'Progress open findings to validation.'
                    : data.next_review_date
                      ? `Scheduled AML review on ${fmtDate(data.next_review_date)}.`
                      : 'No action outstanding on the canonical record.'}
            </div>
            <div className="pt-1">
              <Link className="underline" to="/supervision/aml/entities">Open AML supervised entities portfolio</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default EntityAmlPanel;
