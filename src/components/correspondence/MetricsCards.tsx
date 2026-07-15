import { Card, CardContent } from '@/components/ui/card';
import { Inbox, Timer, CheckCircle2, AlertOctagon } from 'lucide-react';

export function MetricsCards({
  totalOpen,
  overdue,
  avgResponseDays,
  closedThisMonth,
}: {
  totalOpen: number;
  overdue: number;
  avgResponseDays: number;
  closedThisMonth: number;
}) {
  const items = [
    { label: 'Open cases', value: totalOpen, icon: Inbox, tone: 'text-primary' },
    { label: 'Overdue', value: overdue, icon: AlertOctagon, tone: 'text-destructive' },
    { label: 'Avg response (days)', value: avgResponseDays.toFixed(1), icon: Timer, tone: 'text-amber-600' },
    { label: 'Closed this month', value: closedThisMonth, icon: CheckCircle2, tone: 'text-emerald-600' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((i) => (
        <Card key={i.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{i.label}</div>
                <div className="text-2xl font-semibold mt-1">{i.value}</div>
              </div>
              <i.icon className={`h-6 w-6 ${i.tone}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
