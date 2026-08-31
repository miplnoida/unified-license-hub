/**
 * MC-08 — one AI capability: its governed configuration, current status,
 * approved model, released instruction version, permitted roles, governance
 * history and the AI activity generated under it.
 */
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import {
  useAiActivity, useAiInstructions, useAiModels, useAiUseCases,
} from '@/hooks/useAiGovernance';
import { LifecycleActions } from '@/components/governance/ai/LifecycleActions';
import { GovernanceHistory } from '@/components/governance/ai/GovernanceHistory';
import {
  ADVISORY_CLASS_LABEL, LIFECYCLE_HELP, LIFECYCLE_LABEL, LIFECYCLE_VARIANT,
  OUTCOME_LABEL, OUTCOME_VARIANT, RISK_LABEL, REVIEW_STATE_LABEL, label,
} from '@/lib/aiGovernanceLabels';
import { formatDate, formatDateTime } from '@/lib/datetime';

function Field({ label: l, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{l}</p>
      <p className={`mt-0.5 text-sm font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  );
}

export default function AiUseCaseDetail() {
  const { code = '' } = useParams();
  const { data: useCases = [], isLoading } = useAiUseCases();
  const { data: models = [] } = useAiModels();
  const { data: instructions = [] } = useAiInstructions();
  const useCase = useMemo(() => useCases.find((u) => u.code === code), [useCases, code]);
  const { data: activity = [] } = useAiActivity({ useCaseCode: code, limit: 25 });

  const model = models.find((m) => m.id === useCase?.approved_model_id);
  const instruction = instructions.find((i) => i.id === useCase?.approved_instruction_id);

  if (isLoading) {
    return <DashboardLayout><p className="p-6 text-sm text-muted-foreground">Loading capability…</p></DashboardLayout>;
  }
  if (!useCase) {
    return (
      <DashboardLayout>
        <div className="space-y-4 p-2">
          <p className="text-sm text-muted-foreground">This AI capability is not on the register.</p>
          <Button asChild variant="outline"><Link to="/governance/ai/use-cases">Back to capabilities</Link></Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/governance/ai/use-cases"><ArrowLeft className="mr-1 h-4 w-4" /> All capabilities</Link>
        </Button>

        <PageHeader
          title={useCase.label}
          description={useCase.description ?? 'Advisory AI capability under regulatory governance.'}
          actions={
            <Badge variant={LIFECYCLE_VARIANT[useCase.lifecycle_state] ?? 'outline'}>
              {label(LIFECYCLE_LABEL, useCase.lifecycle_state)}
            </Badge>
          }
        />

        {useCase.lifecycle_state === 'SUSPENDED' && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription className="text-sm">
              This capability is suspended{useCase.suspension_reason ? `: ${useCase.suspension_reason}` : '.'} No AI
              request can use it. Regulatory records, deterministic rule outcomes and supervisory workflows are unaffected.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Governed configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Capability code" value={useCase.code} mono />
              <Field label="Owning area" value={useCase.owning_module} />
              <Field label="Advisory classification" value={label(ADVISORY_CLASS_LABEL, useCase.advisory_classification)} />
              <Field label="Regulatory risk" value={label(RISK_LABEL, useCase.risk_classification)} />
              <Field label="Governance level" value={useCase.governance_level ?? 'Not recorded'} />
              <Field label="Governance owner" value={useCase.governance_owner ?? 'Not recorded'} />
              <Field label="Human review" value={useCase.human_review_required ? 'Required before any use' : 'Not required'} />
              <Field label="Workflow changes" value={useCase.workflow_mutation_allowed ? 'Permitted' : 'Never permitted'} />
              <Field label="Permitted information source" value={useCase.allowed_source ?? 'Not recorded'} mono />
              <Field label="Configuration version" value={String(useCase.use_case_version)} />
              <Field label="Effective from" value={useCase.effective_from ? formatDate(useCase.effective_from) : 'Not set'} />
              <Field label="Effective to" value={useCase.effective_to ? formatDate(useCase.effective_to) : 'Open'} />
              <Field label="Approved on" value={useCase.approved_at ? formatDateTime(useCase.approved_at) : 'Not approved'} />
              <Field label="Suspended on" value={useCase.suspended_at ? formatDateTime(useCase.suspended_at) : 'Not suspended'} />
            </div>

            <Separator />

            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permitted roles</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(useCase.approved_roles ?? []).map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
                  {(useCase.approved_roles ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">Not restricted by role beyond the required rights.</p>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Required rights: {(useCase.required_permission_actions ?? []).join(', ') || 'Not recorded'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Output boundary</p>
                <p className="mt-1 text-sm">Permitted: {(useCase.allowed_output_classes ?? []).join(', ') || 'Not recorded'}</p>
                <p className="mt-1 text-sm">Never permitted: {(useCase.prohibited_output_classes ?? []).join(', ') || 'Not recorded'}</p>
                {useCase.limitation_policy && (
                  <p className="mt-2 text-xs text-muted-foreground">{useCase.limitation_policy}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Approved model</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {model ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Model" value={model.governance_display_name} />
                    <Field label="Governance version" value={model.governance_version_label ?? 'Not recorded'} mono />
                    <Field label="Status" value={label(LIFECYCLE_LABEL, model.lifecycle_state)} />
                    <Field label="Data handling" value={model.data_handling_class ?? 'Not recorded'} />
                    <Field label="External data" value={model.external_data_capable ? 'Capable — not permitted here' : 'None'} />
                  </div>
                  <Button asChild size="sm" variant="outline"><Link to="/governance/ai/models">Open model register</Link></Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No approved model is bound. The capability cannot run.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Released instruction version</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {instruction ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Template" value={instruction.template_code} mono />
                    <Field label="Version" value={instruction.version} mono />
                    <Field label="Title" value={instruction.title} />
                    <Field label="Status" value={label(LIFECYCLE_LABEL, instruction.lifecycle_state)} />
                    <Field label="Permitted fact scope" value={instruction.allowed_fact_scope ?? 'Not recorded'} mono />
                    <Field label="Released on" value={instruction.released_at ? formatDateTime(instruction.released_at) : 'Not released'} />
                  </div>
                  <Button asChild size="sm" variant="outline"><Link to="/governance/ai/instructions">Open instruction register</Link></Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No released instruction version is bound. The capability cannot run.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{LIFECYCLE_HELP[useCase.lifecycle_state]}</p>
            <LifecycleActions objectType="USE_CASE" objectKey={useCase.code} currentState={useCase.lifecycle_state} />
          </CardContent>
        </Card>

        <GovernanceHistory objectType="USE_CASE" objectCode={useCase.code} />

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent AI activity under this capability</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Model / instruction version</TableHead>
                    <TableHead>Human review</TableHead>
                    <TableHead className="text-right">Evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map((a) => (
                    <TableRow key={`${a.activity_kind}-${a.activity_id}`}>
                      <TableCell className="whitespace-nowrap text-xs">{formatDateTime(a.occurred_at)}</TableCell>
                      <TableCell>
                        <Badge variant={OUTCOME_VARIANT[a.outcome] ?? 'outline'}>{label(OUTCOME_LABEL, a.outcome)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {a.governance_version_label ?? a.governance_model_label ?? 'Not recorded'}
                        <p className="text-muted-foreground">
                          {a.prompt_template_code ? `${a.prompt_template_code} ${a.prompt_template_version ?? ''}` : '—'}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">{label(REVIEW_STATE_LABEL, a.review_state)}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/governance/ai/activity/${a.activity_kind}/${a.activity_id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {activity.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="p-6 text-sm text-muted-foreground">
                        No AI activity has been recorded under this capability.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
