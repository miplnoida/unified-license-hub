/**
 * Supervisory Assessment Programme package — governed overview and lifecycle.
 *
 * Every control on this screen is offered only where the server says the
 * signed-in officer may act (`supervisory_assessment_programme_action_capabilities`)
 * and every action is a governed RPC with a recorded rationale. Nothing about
 * assessment behaviour is decided in the browser.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { AlertTriangle } from 'lucide-react';
import {
  useAssessmentProgrammeCapabilities,
  useAssessmentProgrammeHistory,
  useAssessmentProgrammeSet,
  useProgrammeSetLifecycle,
} from '@/hooks/useSupervisoryAssessmentProgrammes';
import {
  ErrorPanel, ProfileOriginBadge, ProfileStatusBadge, formatDate, humanize,
} from '@/components/admin/supervisory-policy-profile/labels';

type LifecycleAction = 'SUBMIT_REVIEW' | 'RETURN_TO_DRAFT' | 'APPROVE' | 'ACTIVATE' | 'RETIRE';

const ACTION_LABEL: Record<LifecycleAction, string> = {
  SUBMIT_REVIEW: 'Submit for review',
  RETURN_TO_DRAFT: 'Return to draft',
  APPROVE: 'Approve',
  ACTIVATE: 'Activate',
  RETIRE: 'Retire',
};

const periodSentence = (p: {
  period_rule: string; period_value: number | null; end_offset_days: number | null;
}) => {
  if (p.period_rule === 'TRAILING_DAYS') return `Trailing ${p.period_value} days ending ${p.end_offset_days || 0} day(s) before the start date`;
  if (p.period_rule === 'TRAILING_MONTHS') return `Trailing ${p.period_value} months ending ${p.end_offset_days || 0} day(s) before the start date`;
  if (p.period_rule === 'PRIOR_ASSESSMENT_FORWARD') return 'From the day after the previous assessment period';
  if (p.period_rule === 'EVENT_WINDOW') return `Event window of ${p.period_value} days`;
  return 'Entered by the officer';
};

export default function SupervisoryAssessmentProgrammeDetailPage() {
  const { programmeSetId } = useParams<{ programmeSetId: string }>();
  const navigate = useNavigate();
  const detail = useAssessmentProgrammeSet(programmeSetId);
  const caps = useAssessmentProgrammeCapabilities(programmeSetId);
  const history = useAssessmentProgrammeHistory(programmeSetId);
  const lifecycle = useProgrammeSetLifecycle();

  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [rationale, setRationale] = useState('');

  if (detail.error) return <ErrorPanel error={detail.error} />;
  if (detail.isLoading || !detail.data) return <Skeleton className="h-96 w-full" />;

  const d = detail.data;
  const c = caps.data;
  const v = d.validation ?? { error_count: 0 };
  const errors: string[] = (v.errors as string[]) ?? [];
  const warnings: string[] = (v.warnings as string[]) ?? [];

  const run = async () => {
    if (!action || !programmeSetId) return;
    try {
      await lifecycle.mutateAsync({ setId: programmeSetId, action, rationale });
      toast.success(`${ACTION_LABEL[action]} recorded.`);
      setAction(null);
      setRationale('');
    } catch (e: any) {
      toast.error(e?.message ?? 'The action was refused.');
    }
  };

  const actionButton = (a: LifecycleAction, allowed?: boolean) =>
    allowed ? (
      <Button key={a} size="sm" variant={a === 'RETIRE' ? 'outline' : 'default'} onClick={() => setAction(a)}>
        {ACTION_LABEL[a]}
      </Button>
    ) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${d.set.code} ${d.set.set_version}`}
        description={d.set.name}
        backTo="/admin/supervisory-assessment-programmes"
      />

      <div className="flex flex-wrap items-center gap-2">
        <ProfileStatusBadge status={d.set.status} />
        <ProfileOriginBadge origin={d.set.origin} label={null} />
        <Badge variant="outline">{humanize(d.set.domain_code)}</Badge>
        <Badge variant="outline">
          {d.set.regulator_name ?? 'MIPL Reference — not regulator-owned'}
        </Badge>
        <span className="ml-auto flex flex-wrap gap-2">
          {actionButton('SUBMIT_REVIEW', c?.can_submit)}
          {actionButton('RETURN_TO_DRAFT', c?.can_return)}
          {actionButton('APPROVE', c?.can_approve)}
          {actionButton('ACTIVATE', c?.can_activate)}
          {actionButton('RETIRE', c?.can_retire)}
        </span>
      </div>

      {c?.maker_checker_block ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{c.maker_checker_block}</AlertDescription>
        </Alert>
      ) : null}

      {errors.length ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p className="text-sm">This package cannot be submitted or approved until these are resolved:</p>
            <ul className="list-disc pl-5 text-xs">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="programmes">
        <TabsList>
          <TabsTrigger value="programmes">Programmes</TabsTrigger>
          <TabsTrigger value="usage">Policy profiles</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="programmes" className="space-y-3 pt-3">
          {d.programmes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No programme has been configured in this package yet.</p>
          ) : d.programmes.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {p.label}
                  <Badge variant="outline" className="font-mono text-[11px]">{p.programme_code}</Badge>
                  <Badge variant="outline">{humanize(p.assessment_type)}</Badge>
                  {!p.is_active || p.retired_at ? <Badge variant="secondary">Retired</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {p.description ? <p className="text-muted-foreground">{p.description}</p> : null}
                <p><span className="text-muted-foreground">Review period: </span>{periodSentence(p)}
                  {p.allow_manual_override ? ' (the officer may adjust the dates)' : ' (fixed)'}</p>
                <p><span className="text-muted-foreground">Question classes in scope: </span>
                  {(p.question_class_scope ?? []).map(humanize).join(', ') || 'All'}</p>
                <p><span className="text-muted-foreground">Triggers accepted: </span>
                  {p.triggers.length === 0 ? 'None configured' : p.triggers.map((t) =>
                    `${t.label || t.trigger_code}${t.is_default ? ' (default)' : ''}`).join(' · ')}</p>
                {p.requires_prior_assessment ? <p className="text-xs text-muted-foreground">Requires a previous assessment of the entity.</p> : null}
                {p.requires_trigger_signal ? <p className="text-xs text-muted-foreground">Requires the triggering signal or event to be recorded.</p> : null}
                {p.guidance ? <p className="text-xs text-muted-foreground">{p.guidance}</p> : null}
              </CardContent>
            </Card>
          ))}
          {warnings.length ? (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          ) : null}
        </TabsContent>

        <TabsContent value="usage" className="pt-3">
          {d.profile_bindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No supervisory policy profile binds this package yet.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.profile_bindings.map((b) => (
                <li key={b.profile_id} className="flex flex-wrap items-center gap-2">
                  <Button variant="link" className="h-auto p-0"
                    onClick={() => navigate(`/admin/supervisory-policy-profiles/${b.profile_id}`)}>
                    {b.profile_code} {b.profile_version}
                  </Button>
                  <ProfileStatusBadge status={b.profile_status} />
                  <ProfileOriginBadge origin={b.profile_origin} label={null} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="versions" className="pt-3">
          <ul className="space-y-2 text-sm">
            {d.versions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <Button variant="link" className="h-auto p-0"
                  onClick={() => navigate(`/admin/supervisory-assessment-programmes/${s.id}`)}>
                  {s.set_version}
                </Button>
                <ProfileStatusBadge status={s.status} />
                <ProfileOriginBadge origin={s.origin} label={null} />
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="history" className="pt-3">
          {history.isLoading ? <Skeleton className="h-40 w-full" /> : (
            <ul className="space-y-3 text-sm">
              {(history.data?.rows ?? []).map((e: any) => (
                <li key={e.id} className="border-l-2 pl-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{humanize(e.event_type)}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{formatDate(e.created_at)}</span>
                    {e.actor_name ? <span className="text-xs text-muted-foreground">{e.actor_name}</span> : null}
                  </p>
                  {e.rationale ? <p className="text-xs text-muted-foreground">{e.rationale}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={action !== null} onOpenChange={(o) => { if (!o) { setAction(null); setRationale(''); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{action ? ACTION_LABEL[action] : ''}</DialogTitle>
            <DialogDescription>
              The reason is recorded permanently against this programme package.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="programme-rationale">Reason</Label>
            <Textarea id="programme-rationale" rows={4} value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="State why this decision is being taken (at least 10 characters)." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAction(null); setRationale(''); }}>Cancel</Button>
            <Button disabled={rationale.trim().length < 10 || lifecycle.isPending} onClick={run}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
