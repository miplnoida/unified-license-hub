/**
 * Shows which governed configuration controls this assessment's scope, facts
 * and sources. Everything here is read from the platform; the panel never
 * decides applicability, permission or source validity itself.
 */
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import {
  useAssessmentConfigurationAuthority,
  type PinnedFamily,
} from '@/hooks/useAssessmentConfigurationAuthority';
import { AMBER, EMERALD, NEUTRAL } from '@/lib/amlLabels';

const FAMILY_LABEL: Record<string, string> = {
  SECTOR_OVERLAY: 'Sector overlay',
  FACT_CONFIG: 'Fact configuration',
  SOURCE_BINDING: 'Source binding',
};

function statusText(f: PinnedFamily): { text: string; tone: string } {
  if (f.status === 'GOVERNED') return { text: `${f.code} v${f.component_version}`, tone: EMERALD };
  if (f.status === 'UNAVAILABLE') return { text: 'Cannot be used', tone: AMBER };
  return { text: 'Not part of this assessment’s policy', tone: NEUTRAL };
}

function FamilyRow({ f, extra }: { f: PinnedFamily; extra?: string | null }) {
  const s = statusText(f);
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3" data-testid={`config-family-${f.component_type}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{FAMILY_LABEL[f.component_type] ?? f.component_type}</span>
        <Badge variant="outline" className={s.tone}>{s.text}</Badge>
      </div>
      {f.status !== 'GOVERNED' && f.reason ? (
        <p className="text-xs text-muted-foreground">{f.reason}</p>
      ) : null}
      {extra ? <p className="text-xs text-muted-foreground">{extra}</p> : null}
    </div>
  );
}

export function AmlConfigurationAuthorityPanel({ assessmentId }: { assessmentId: string }) {
  const { data, isLoading, error, refetch } = useAssessmentConfigurationAuthority(assessmentId);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error || !data) {
    return (
      <Alert variant="destructive" data-testid="config-authority-unavailable">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-2">
          <span>The governing configuration could not be read: {(error as Error)?.message ?? 'no response'}.</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
        </AlertDescription>
      </Alert>
    );
  }

  const ov = data.sector_overlay;
  const sectorLine = ov.sector_code
    ? `Entity sector: ${ov.sector_code}${ov.applicability ? ` — ${ov.applicability.replace(/_/g, ' ').toLowerCase()}` : ''}`
    : 'Entity sector could not be determined.';
  const governedFacts = data.fact_config.status === 'GOVERNED' || data.source_binding.status === 'GOVERNED';

  return (
    <Card data-testid="config-authority-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Governing configuration</CardTitle>
        <p className="text-xs text-muted-foreground">
          Fixed when the assessment was created from policy package{' '}
          {data.fact_config.policy_profile_code ?? '—'} {data.fact_config.policy_profile_version ?? ''}. Later
          configuration changes do not alter it.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!ov.applies ? (
          <Alert variant="destructive" data-testid="config-overlay-excludes">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{ov.reason ?? 'The sector overlay does not apply to this entity.'} Facts cannot be recorded.</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-2 md:grid-cols-3">
          <FamilyRow f={ov} extra={sectorLine} />
          <FamilyRow f={data.fact_config} />
          <FamilyRow f={data.source_binding} />
        </div>

        {data.methodology_fact_count === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="config-no-facts">
            The methodology version of this assessment defines no structured facts, so there is nothing to record here.
          </p>
        ) : governedFacts ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2">Fact</th>
                  <th className="py-1 pr-2">May be recorded</th>
                  <th className="py-1 pr-2">Mandatory</th>
                  <th className="py-1 pr-2">Accepted sources</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.facts.map((f) => (
                  <tr key={f.fact_code} className="border-b last:border-0" data-testid={`config-fact-${f.fact_code}`}>
                    <td className="py-1 pr-2"><span className="font-mono text-xs">{f.fact_code}</span> {f.label}</td>
                    <td className="py-1 pr-2">{f.permitted ? 'Yes' : 'No'}{f.sector_codes?.length ? ` (${f.sector_codes.join(', ')})` : ''}</td>
                    <td className="py-1 pr-2">{f.required ? 'Yes' : 'No'}</td>
                    <td className="py-1 pr-2">
                      {f.allowed_sources?.length
                        ? f.allowed_sources.map((s) => `${s.source_kind}${s.source_reference ? ` · ${s.source_reference}` : ''}`).join('; ')
                        : 'Any stated source'}
                    </td>
                    <td className="py-1">
                      <Badge variant="outline" className={f.recorded ? EMERALD : f.required && f.permitted ? AMBER : NEUTRAL}>
                        {f.recorded ? `Recorded (${f.source_type})` : f.required && f.permitted ? 'Missing' : 'Not recorded'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No fact configuration or source binding is part of this assessment&rsquo;s policy, so the methodology&rsquo;s own fact rules apply.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
