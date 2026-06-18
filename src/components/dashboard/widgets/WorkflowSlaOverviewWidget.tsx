import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Gauge, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkflowSlaInstances } from '@/hooks/useWorkflowSlaInstances';

interface CardDef {
  key: 'healthy' | 'warning' | 'breached';
  label: string;
  count: number;
  Icon: typeof CheckCircle2;
  tone: string;
  to: string;
}

export function WorkflowSlaOverviewWidget({ entityType = 'application' }: { entityType?: string } = {}) {
  const navigate = useNavigate();
  const { isLoading, overview } = useWorkflowSlaInstances({ entityType });

  const cards: CardDef[] = [
    {
      key: 'healthy',
      label: 'Within SLA',
      count: overview.healthy,
      Icon: CheckCircle2,
      tone: 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-800',
      to: '/applications/queue?workflowSla=healthy',
    },
    {
      key: 'warning',
      label: 'Approaching Breach',
      count: overview.warning,
      Icon: AlertTriangle,
      tone: 'border-amber-200 bg-amber-50/40 hover:bg-amber-50 text-amber-800',
      to: '/applications/queue?workflowSla=warning',
    },
    {
      key: 'breached',
      label: 'Breached',
      count: overview.breached,
      Icon: AlertOctagon,
      tone: 'border-red-200 bg-red-50/40 hover:bg-red-50 text-red-800',
      to: '/applications/queue?workflowSla=breached',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" /> Workflow SLA Overview
          <span className="text-xs font-normal text-muted-foreground ml-2">
            {isLoading ? '' : `${overview.total} active`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {cards.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => navigate(c.to)}
              className={cn(
                'text-left rounded-lg border p-4 transition-colors flex items-center justify-between',
                c.tone,
              )}
            >
              <div className="flex items-center gap-3">
                <c.Icon className="h-5 w-5" />
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-[11px] opacity-70">Click to view</p>
                </div>
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-10" />
              ) : (
                <span className="text-2xl font-bold tabular-nums">{c.count}</span>
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
