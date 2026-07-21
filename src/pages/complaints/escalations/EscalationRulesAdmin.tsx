import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TIER_LABEL, type Tier } from './types';

interface Rule {
  id: string; key: string; label: string; description: string | null;
  criterion: string; thresholds: Record<string, any>; target_tier: string;
  enabled: boolean; priority: number;
}

export function EscalationRulesAdmin() {
  const qc = useQueryClient();
  const { data: fetched = [], isLoading } = useQuery<Rule[]>({
    queryKey: ['complaint_escalation_rules_admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('complaint_escalation_rules' as any).select('*').order('priority');
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const [rules, setRules] = useState<Rule[]>([]);
  useEffect(() => { setRules(fetched); }, [fetched]);

  const save = useMutation({
    mutationFn: async () => {
      for (const r of rules) {
        const { error } = await supabase.from('complaint_escalation_rules' as any).update({
          enabled: r.enabled,
          thresholds: r.thresholds,
          target_tier: r.target_tier,
        }).eq('id', r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Escalation rules saved');
      qc.invalidateQueries({ queryKey: ['complaint_escalation_rules_admin'] });
      qc.invalidateQueries({ queryKey: ['complaint_escalation_stats'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const patch = (i: number, r: Partial<Rule>) =>
    setRules((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...r } : x)));
  const patchThr = (i: number, k: string, v: any) =>
    setRules((prev) => prev.map((x, idx) => (idx === i ? { ...x, thresholds: { ...x.thresholds, [k]: v } } : x)));

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading rules…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Escalation Rules</h3>
          <p className="text-xs text-muted-foreground">Configure the automatic criteria that route complaints to the right tier.</p>
        </div>
        <Button data-rbac="complaint_management.edit" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rules.map((r, i) => (
          <Card key={r.id}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{r.label}</div>
                    <Badge variant="outline">{r.enabled ? 'Active' : 'Disabled'}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>
                </div>
                <Switch checked={r.enabled} onCheckedChange={(v) => patch(i, { enabled: v })} />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                {r.criterion === 'age' && (
                  <div>
                    <Label className="text-xs">Max age (days)</Label>
                    <Input type="number" min={1} value={Number(r.thresholds?.maxAgeDays ?? 14)} onChange={(e) => patchThr(i, 'maxAgeDays', Number(e.target.value))} />
                  </div>
                )}
                {r.criterion === 'volume' && (
                  <>
                    <div>
                      <Label className="text-xs">Window (days)</Label>
                      <Input type="number" min={1} value={Number(r.thresholds?.windowDays ?? 30)} onChange={(e) => patchThr(i, 'windowDays', Number(e.target.value))} />
                    </div>
                    <div>
                      <Label className="text-xs">Min complaints</Label>
                      <Input type="number" min={1} value={Number(r.thresholds?.minCount ?? 10)} onChange={(e) => patchThr(i, 'minCount', Number(e.target.value))} />
                    </div>
                  </>
                )}
                {r.criterion === 'recurrence' && (
                  <div>
                    <Label className="text-xs">Min repeats</Label>
                    <Input type="number" min={2} value={Number(r.thresholds?.minRepeats ?? 3)} onChange={(e) => patchThr(i, 'minRepeats', Number(e.target.value))} />
                  </div>
                )}
                {(r.criterion === 'harm' || r.criterion === 'risk_rating') && (
                  <div>
                    <Label className="text-xs">Minimum {r.criterion === 'harm' ? 'harm level' : 'risk rating'}</Label>
                    <Select
                      value={String(r.thresholds?.[r.criterion === 'harm' ? 'minSeverity' : 'minRisk'] ?? 'high')}
                      onValueChange={(v) => patchThr(i, r.criterion === 'harm' ? 'minSeverity' : 'minRisk', v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['low','medium','high','critical'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-xs">Escalate to</Label>
                  <Select value={r.target_tier} onValueChange={(v) => patch(i, { target_tier: v as Tier })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIER_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
