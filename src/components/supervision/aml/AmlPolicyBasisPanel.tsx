/**
 * PCOMP-R1C — assessment Policy Basis (read-only).
 *
 * The immutable policy configuration an assessment was created under is owned by
 * the server: `supervisory_assessment_policy_basis` is the single source. This
 * panel renders exactly what that function returns. It never resolves a profile,
 * never derives versions, never reconciles the snapshot against the currently
 * active profile, and offers no write of any kind.
 */
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, FileLock2, Info } from 'lucide-react';
import { useAssessmentPolicyBasis, type PolicyBasisComponent } from '@/hooks/useSupervisoryPolicyProfiles';
import { AMBER, EMERALD, NEUTRAL, fmtDate } from '@/lib/amlLabels';

const Field = ({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 text-sm" data-testid={testId}>{value ?? '—'}</div>
  </div>
);

const version = (v?: string | null) =>
  v ? <span className="font-mono text-xs">v{v}</span> : <span className="text-muted-foreground">—</span>;

export function AmlPolicyBasisPanel({ assessmentId }: { assessmentId: string }) {
  const { data, isLoading, error } = useAssessmentPolicyBasis(assessmentId);

  const shell = (title: React.ReactNode, body: React.ReactNode) => (
    <Card data-testid="policy-basis-panel">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Policy basis</CardTitle>
          {title}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );

  if (isLoading) return shell(null, <Skeleton className="h-24 w-full" />);

  if (error || !data) {
    return shell(
      <Badge variant="outline" className={AMBER} data-testid="policy-basis-status">
        POLICY BASIS UNAVAILABLE
      </Badge>,
      <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="policy-basis-error">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        The policy basis of this assessment could not be read. Nothing is shown rather than an assumed
        configuration{error ? `: ${(error as Error).message}` : '.'}
      </p>,
    );
  }

  if (data.status !== 'SNAPSHOTTED') {
    return shell(
      <Badge variant="outline" className={NEUTRAL} data-testid="policy-basis-status">
        LEGACY / NO POLICY PROFILE SNAPSHOT
      </Badge>,
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="policy-basis-legacy-note">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          This assessment predates operational Policy Profile binding. Its historical methodology and
          existing provenance remain unchanged.
        </p>
        {data.reason ? <p className="text-xs text-muted-foreground">{data.reason}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Assessment programme" value={data.assessment_programme_code ?? '—'} testId="policy-basis-legacy-programme" />
          <Field label="Programme version" value={version(data.assessment_programme_version)} />
          <Field label="Programme provenance" value={data.assessment_programme_provenance ?? '—'} />
        </div>
      </div>,
    );
  }

  const components: PolicyBasisComponent[] = Array.isArray(data.components) ? data.components : [];

  return shell(
    <Badge variant="outline" className={EMERALD} data-testid="policy-basis-status">
      POLICY BASIS RECORDED
    </Badge>,
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="policy-basis-note">
        <FileLock2 className="mt-0.5 h-4 w-4 shrink-0" />
        This assessment keeps the exact policy configuration under which it was created. Later policy
        changes do not alter this record.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Policy profile" value={data.policy_profile_code ?? '—'} testId="policy-basis-profile-code" />
        <Field label="Profile version" value={version(data.policy_profile_version)} testId="policy-basis-profile-version" />
        <Field label="Profile origin" value={data.policy_profile_origin ?? '—'} testId="policy-basis-profile-origin" />
        <Field label="Regulator" value={data.regulator_code ?? '—'} testId="policy-basis-regulator" />
        <Field label="Effective as of" value={fmtDate(data.resolved_as_of)} testId="policy-basis-as-of" />
        <Field label="Recorded at" value={fmtDate(data.resolved_at)} testId="policy-basis-recorded-at" />
        <Field label="Methodology" value={data.methodology_code ?? '—'} testId="policy-basis-methodology-code" />
        <Field label="Methodology version" value={version(data.methodology_version)} testId="policy-basis-methodology-version" />
        <Field label="Assessment programme" value={data.programme_code ?? '—'} testId="policy-basis-programme-code" />
        <Field label="Programme version" value={version(data.programme_version)} testId="policy-basis-programme-version" />
        <Field
          label="Calculation configuration"
          value={version(data.calculation_config_version)}
          testId="policy-basis-calculation-version"
        />
        <Field
          label="Provenance fingerprint"
          value={
            data.content_hash
              ? <span className="font-mono text-xs break-all">{data.content_hash}</span>
              : '—'
          }
          testId="policy-basis-fingerprint"
        />
      </div>

      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Bound policy components ({components.length})
        </div>
        {components.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="policy-basis-no-components">
            No additional policy components were bound to the governing profile when this assessment was created.
          </p>
        ) : (
          <Table data-testid="policy-basis-components">
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status at binding</TableHead>
                <TableHead>Server capability</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.map((c) => (
                <TableRow key={`${c.component_type}-${c.component_id ?? c.code ?? ''}`}>
                  <TableCell className="text-sm">{c.label ?? c.component_type}</TableCell>
                  <TableCell className="font-mono text-xs">{c.code ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs" data-testid={`policy-basis-component-version-${c.component_type}`}>
                    {c.component_version ? `v${c.component_version}` : '—'}
                  </TableCell>
                  <TableCell className="text-xs">{c.status_at_binding ?? '—'}</TableCell>
                  <TableCell className="text-xs" data-testid={`policy-basis-component-capability-${c.component_type}`}>
                    {c.capability?.capability_state ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>,
  );
}
