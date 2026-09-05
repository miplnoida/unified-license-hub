import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useExaminationScoping, useSaveScoping } from '@/hooks/useExaminations';
import { StageActions, type StageActionsMode } from './ExaminationStageActions';
import { ChipsInput } from './ChipsInput';
import { engagementPhrasing } from '@/lib/supervisoryEngagement';
import { useExaminationEngagement } from '@/hooks/useExaminationEngagement';

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function ScopingMemoPanel({ examinationId, readOnly, mode = 'supporting' }: { examinationId: string; readOnly?: boolean; mode?: StageActionsMode }) {
  const { data, isLoading } = useExaminationScoping(examinationId);
  const engagement = useExaminationEngagement(examinationId);
  const save = useSaveScoping(examinationId);
  const [form, setForm] = useState({
    objectives: '',
    legal_basis: '',
    scope_exclusions: '',
    budget_days: '',
    methodology: '',
  });
  const [riskAreas, setRiskAreas] = useState<string[]>([]);

  useEffect(() => {
    if (data) {
      setForm({
        objectives: data.objectives ?? '',
        legal_basis: data.legal_basis ?? '',
        scope_exclusions: data.scope_exclusions ?? '',
        budget_days: data.budget_days != null ? String(data.budget_days) : '',
        methodology: data.methodology ?? '',
      });
      setRiskAreas((data.risk_focus_areas ?? []) as string[]);
    }
  }, [data]);

  const persist = async (extra: Record<string, unknown> = {}) => {
    const { data: auth } = await supabase.auth.getUser();
    await save.mutateAsync({
      objectives: form.objectives || null,
      // Stored exactly as before: an array of risk area strings.
      risk_focus_areas: riskAreas,
      legal_basis: form.legal_basis || null,
      scope_exclusions: form.scope_exclusions || null,
      budget_days: form.budget_days ? Number(form.budget_days) : null,
      methodology: form.methodology || null,
      prepared_by: data?.prepared_by ?? auth?.user?.id ?? null,
      prepared_at: data?.prepared_at ?? new Date().toISOString(),
      ...extra,
    });
  };

  const approve = async () => {
    const { data: auth } = await supabase.auth.getUser();
    await persist({ approved_by: auth?.user?.id ?? null, approved_at: new Date().toISOString() });
  };

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Examination scope</CardTitle>
          <p className="text-xs text-muted-foreground">
            {engagementPhrasing('Agree what will be examined and why. The scope must be approved before fieldwork can begin.', engagement)}
          </p>
        </div>
        {data?.approved_at ? (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />Approved {new Date(data.approved_at).toLocaleDateString()}
          </Badge>
        ) : (
          <Badge variant="outline">Awaiting approval</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Group title="Why are we examining?" hint="The purpose of the examination and the powers it is carried out under.">
          <div>
            <Label htmlFor="objectives">Objectives</Label>
            <Textarea id="objectives" rows={3} disabled={readOnly} value={form.objectives}
              placeholder="What the examination is intended to establish"
              onChange={e => setForm(f => ({ ...f, objectives: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="legal_basis">Legal basis</Label>
            <Input id="legal_basis" disabled={readOnly} value={form.legal_basis}
              placeholder="Section or regulation relied upon"
              onChange={e => setForm(f => ({ ...f, legal_basis: e.target.value }))} />
          </div>
        </Group>

        <Group title="What are we examining?" hint="The risk areas in scope and anything deliberately left out.">
          <div>
            <Label htmlFor="risk_areas">Risk focus areas</Label>
            <ChipsInput id="risk_areas" value={riskAreas} onChange={setRiskAreas} disabled={readOnly}
              placeholder="Type an area and press Enter (e.g. Credit risk)" />
          </div>
          <div>
            <Label htmlFor="exclusions">Not included in this examination</Label>
            <Textarea id="exclusions" rows={2} disabled={readOnly} value={form.scope_exclusions}
              onChange={e => setForm(f => ({ ...f, scope_exclusions: e.target.value }))} />
          </div>
        </Group>

        <Group title="How will the examination be performed?" hint="Approach, procedures and the effort allocated.">
          <div>
            <Label htmlFor="methodology">Methodology</Label>
            <Textarea id="methodology" rows={3} disabled={readOnly} value={form.methodology}
              onChange={e => setForm(f => ({ ...f, methodology: e.target.value }))} />
          </div>
          <div className="max-w-xs">
            <Label htmlFor="budget_days">Examiner days budgeted</Label>
            <Input id="budget_days" type="number" disabled={readOnly} value={form.budget_days}
              onChange={e => setForm(f => ({ ...f, budget_days: e.target.value }))} />
          </div>
        </Group>

        {!readOnly && (
          <StageActions mode={mode} beforeAdvance={() => persist()}>
            {!data?.approved_at && (
              <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline"
                disabled={save.isPending} onClick={approve}>
                <CheckCircle2 className="h-4 w-4 mr-1" />Approve scope
              </Button>
            )}
          </StageActions>
        )}
      </CardContent>
    </Card>
  );
}
