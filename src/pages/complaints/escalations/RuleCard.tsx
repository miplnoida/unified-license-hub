import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TIER_LABEL, type EscalationRule, type Tier } from './types';

interface Props {
  rule: EscalationRule;
  onChange: (r: EscalationRule) => void;
}

const CRITERION_MAP: Record<EscalationRule['key'], string> = {
  consumer_harm: 'harm',
  age: 'age',
  risk_rating: 'harm', // graded by minRisk; the SQL simulator treats it like harm ranking
  volume: 'volume',
  recurrence: 'recurrence',
};

export function RuleCard({ rule, onChange }: Props) {
  const set = (patch: Partial<EscalationRule>) => onChange({ ...rule, ...patch });
  const setThr = (k: string, v: number | string) => onChange({ ...rule, thresholds: { ...rule.thresholds, [k]: v } });

  const { data: sim, isError, refetch, isFetching } = useQuery({
    queryKey: ['simulate_escalation_rule', rule.key, rule.thresholds],
    queryFn: async () => {
      const criterion = CRITERION_MAP[rule.key];
      const { data, error } = await (supabase as any).rpc('simulate_escalation_rule', {
        _criterion: criterion,
        _thresholds: rule.thresholds,
      });
      if (error) throw error;
      return data as { total_open: number; fire_count: number };
    },
    staleTime: 30_000,
  });

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <div className="font-semibold">{rule.label}</div>
              <Badge variant="outline" className={rule.enabled ? 'bg-green-50 text-green-800 border-green-200' : 'bg-slate-50 text-slate-600 border-slate-200'}>
                {rule.enabled ? 'Active' : 'Disabled'}
              </Badge>
            </div>
            <div className="text-xs text-slate-600 mt-0.5">{rule.description}</div>
          </div>
          <Switch checked={rule.enabled} onCheckedChange={(v) => set({ enabled: v })} />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          {rule.key === 'age' && (
            <div>
              <Label className="text-xs">Max age (days)</Label>
              <Input type="number" min={1} value={Number(rule.thresholds.maxAgeDays || 14)} onChange={(e) => setThr('maxAgeDays', Number(e.target.value))} />
            </div>
          )}
          {rule.key === 'volume' && (
            <>
              <div>
                <Label className="text-xs">Window (days)</Label>
                <Input type="number" min={1} value={Number(rule.thresholds.windowDays || 30)} onChange={(e) => setThr('windowDays', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Min complaints</Label>
                <Input type="number" min={1} value={Number(rule.thresholds.minCount || 10)} onChange={(e) => setThr('minCount', Number(e.target.value))} />
              </div>
            </>
          )}
          {rule.key === 'recurrence' && (
            <div>
              <Label className="text-xs">Min repeats</Label>
              <Input type="number" min={2} value={Number(rule.thresholds.minRepeats || 3)} onChange={(e) => setThr('minRepeats', Number(e.target.value))} />
            </div>
          )}
          {(rule.key === 'consumer_harm' || rule.key === 'risk_rating') && (
            <div>
              <Label className="text-xs">Minimum {rule.key === 'consumer_harm' ? 'harm level' : 'risk rating'}</Label>
              <Select
                value={String(rule.thresholds[rule.key === 'consumer_harm' ? 'minSeverity' : 'minRisk'] || 'high')}
                onValueChange={(v) => setThr(rule.key === 'consumer_harm' ? 'minSeverity' : 'minRisk', v)}
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
            <Select value={rule.tier} onValueChange={(v) => set({ tier: v as Tier })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIER_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="text-xs text-slate-600">
          Notify: {rule.notify.join(', ')}
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-xs text-slate-700">
            {isError
              ? <span className="text-destructive">Simulation unavailable.</span>
              : <>Would fire on <span className="font-semibold">{sim?.fire_count ?? '—'}</span> of {sim?.total_open ?? '—'} open complaints.</>}
          </div>
          <Button size="sm" variant="outline" disabled={isFetching} onClick={() => {
            refetch().then((r) => {
              const v = r.data as { fire_count: number } | undefined;
              if (v) toast.success(`Tested "${rule.label}" — ${v.fire_count} match(es)`);
            });
          }}>Test rule</Button>
        </div>
      </CardContent>
    </Card>
  );
}
