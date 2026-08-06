import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, TrendingUp, Timer, ShieldCheck, RefreshCcw, Gavel } from 'lucide-react';
import {
  interventionDelta, fmtNum, stageRate,
  type LoopEffectiveness, type LoopFunnel,
} from '@/lib/conduct/supervisionLoop';

export function EffectivenessKpis({ effectiveness, funnel }: { effectiveness: LoopEffectiveness; funnel: LoopFunnel }) {
  const delta = interventionDelta(effectiveness);
  const improving = delta !== null && delta < 0;

  const tiles = [
    {
      label: 'Pre vs post intervention',
      value: `${fmtNum(effectiveness.pre_intervention_avg)} → ${fmtNum(effectiveness.post_intervention_avg)}`,
      hint: delta === null ? 'Insufficient data' : `${delta > 0 ? '+' : ''}${delta}% complaint volume`,
      icon: improving ? <TrendingDown className="h-4 w-4 text-primary" /> : <TrendingUp className="h-4 w-4 text-destructive" />,
      badge: delta === null ? null : improving ? 'Effective' : 'Watch',
    },
    {
      label: 'Avg time to enforcement',
      value: fmtNum(effectiveness.time_to_enforcement_avg_days, ' days'),
      hint: `Best ${fmtNum(effectiveness.time_to_enforcement_min_days, 'd')} · Worst ${fmtNum(effectiveness.time_to_enforcement_max_days, 'd')}`,
      icon: <Gavel className="h-4 w-4 text-primary" />,
      badge: null,
    },
    {
      label: 'Avg time to compliance',
      value: fmtNum(effectiveness.time_to_compliance_avg_days, ' days'),
      hint: 'Enforcement opened → compliance recorded',
      icon: <Timer className="h-4 w-4 text-primary" />,
      badge: null,
    },
    {
      label: 'Recurrence rate',
      value: `${effectiveness.recurrence_rate}%`,
      hint: `${funnel.recurrences} of ${funnel.monitoring} monitored cases`,
      icon: <RefreshCcw className="h-4 w-4 text-primary" />,
      badge: effectiveness.recurrence_rate > 25 ? 'High' : null,
    },
    {
      label: 'Interventions with measurable drop',
      value: `${effectiveness.improved_interventions} / ${effectiveness.interventions}`,
      hint: 'Complaint volume fell after enforcement',
      icon: <ShieldCheck className="h-4 w-4 text-primary" />,
      badge: null,
    },
    {
      label: 'Complaint → enforcement conversion',
      value: `${fmtNum(stageRate(funnel, 'complaints_received', 'enforcement'), '%')}`,
      hint: `${funnel.enforcement} enforcement actions from ${funnel.complaints_received} complaints`,
      icon: <Gavel className="h-4 w-4 text-primary" />,
      badge: null,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">{t.icon}{t.label}</div>
              {t.badge && <Badge variant={t.badge === 'Effective' ? 'default' : 'destructive'}>{t.badge}</Badge>}
            </div>
            <div className="text-xl font-semibold font-mono">{t.value}</div>
            <div className="text-[11px] text-muted-foreground">{t.hint}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
