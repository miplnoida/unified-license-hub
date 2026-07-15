import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { TIER_LABEL, type EscalationRule, type Tier } from './types';
import { MOCK_COMPLAINTS } from './mockData';

interface Props {
  rule: EscalationRule;
  onChange: (r: EscalationRule) => void;
}

function wouldFire(rule: EscalationRule): number {
  return MOCK_COMPLAINTS.filter((c) => {
    switch (rule.key) {
      case 'consumer_harm': {
        const order = ['low','medium','high','critical'];
        const min = String(rule.thresholds.minSeverity || 'high');
        return order.indexOf(c.harm) >= order.indexOf(min);
      }
      case 'age':
        return c.ageDays >= Number(rule.thresholds.maxAgeDays || 14);
      case 'risk_rating': {
        const order = ['low','medium','high','critical'];
        const min = String(rule.thresholds.minRisk || 'high');
        return order.indexOf(c.institutionRisk) >= order.indexOf(min);
      }
      case 'volume':
        return c.institutionVolume30d >= Number(rule.thresholds.minCount || 10);
      case 'recurrence':
        return c.recurrenceCount >= Number(rule.thresholds.minRepeats || 3);
    }
  }).length;
}

export function RuleCard({ rule, onChange }: Props) {
  const set = (patch: Partial<EscalationRule>) => onChange({ ...rule, ...patch });
  const setThr = (k: string, v: number | string) => onChange({ ...rule, thresholds: { ...rule.thresholds, [k]: v } });
  const fireCount = wouldFire(rule);

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
            Would fire on <span className="font-semibold">{fireCount}</span> of {MOCK_COMPLAINTS.length} sample complaints.
          </div>
          <Button size="sm" variant="outline" onClick={() => toast.success(`Tested "${rule.label}" — ${fireCount} match(es)`)}>Test rule</Button>
        </div>
      </CardContent>
    </Card>
  );
}
