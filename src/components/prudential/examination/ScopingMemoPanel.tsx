import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useExaminationScoping, useSaveScoping } from '@/hooks/useExaminations';
import { StageActions } from './ExaminationStageActions';

export function ScopingMemoPanel({ examinationId, readOnly }: { examinationId: string; readOnly?: boolean }) {
  const { data, isLoading } = useExaminationScoping(examinationId);
  const save = useSaveScoping(examinationId);
  const [form, setForm] = useState({
    objectives: '',
    risk_focus_areas: '',
    legal_basis: '',
    scope_exclusions: '',
    budget_days: '',
    methodology: '',
  });

  useEffect(() => {
    if (data) {
      setForm({
        objectives: data.objectives ?? '',
        risk_focus_areas: (data.risk_focus_areas ?? []).join(', '),
        legal_basis: data.legal_basis ?? '',
        scope_exclusions: data.scope_exclusions ?? '',
        budget_days: data.budget_days != null ? String(data.budget_days) : '',
        methodology: data.methodology ?? '',
      });
    }
  }, [data]);

  const persist = async (extra: Record<string, unknown> = {}) => {
    const { data: auth } = await supabase.auth.getUser();
    await save.mutateAsync({
      objectives: form.objectives || null,
      risk_focus_areas: form.risk_focus_areas
        ? form.risk_focus_areas.split(',').map(s => s.trim()).filter(Boolean)
        : [],
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
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Scoping memo</CardTitle>
        {data?.approved_at ? (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />Approved {new Date(data.approved_at).toLocaleDateString()}
          </Badge>
        ) : (
          <Badge variant="outline">Awaiting approval</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Objectives</Label>
          <Textarea rows={3} disabled={readOnly} value={form.objectives}
            onChange={e => setForm(f => ({ ...f, objectives: e.target.value }))} />
        </div>
        <div>
          <Label>Risk focus areas (comma separated)</Label>
          <Input disabled={readOnly} value={form.risk_focus_areas}
            onChange={e => setForm(f => ({ ...f, risk_focus_areas: e.target.value }))}
            placeholder="Credit risk, Liquidity, Governance" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Legal basis</Label>
            <Input disabled={readOnly} value={form.legal_basis}
              onChange={e => setForm(f => ({ ...f, legal_basis: e.target.value }))} />
          </div>
          <div>
            <Label>Budget (examiner days)</Label>
            <Input type="number" disabled={readOnly} value={form.budget_days}
              onChange={e => setForm(f => ({ ...f, budget_days: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label>Scope exclusions</Label>
          <Textarea rows={2} disabled={readOnly} value={form.scope_exclusions}
            onChange={e => setForm(f => ({ ...f, scope_exclusions: e.target.value }))} />
        </div>
        <div>
          <Label>Methodology</Label>
          <Textarea rows={3} disabled={readOnly} value={form.methodology}
            onChange={e => setForm(f => ({ ...f, methodology: e.target.value }))} />
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button data-rbac="prudential_supervision.edit" size="sm" disabled={save.isPending} onClick={() => persist()}>
              <Save className="h-4 w-4 mr-1" />Save memo
            </Button>
            {!data?.approved_at && (
              <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline"
                disabled={save.isPending} onClick={approve}>
                <CheckCircle2 className="h-4 w-4 mr-1" />Approve memo
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
