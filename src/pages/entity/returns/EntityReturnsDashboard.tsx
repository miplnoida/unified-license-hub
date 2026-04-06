import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMyReturns } from '@/hooks/useReturnsManagement';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Clock, CheckCircle, AlertTriangle, FileText, PlusCircle } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';

export default function EntityReturnsDashboard() {
  const { data: returns = [] } = useMyReturns();
  const navigate = useNavigate();

  const now = new Date();
  const upcoming = returns.filter(r => r.workflow_status !== 'VAL' && r.due_date && new Date(r.due_date) > now && new Date(r.due_date) <= new Date(now.getTime() + 30 * 86400000));
  const overdue = returns.filter(r => !['VAL', 'SUB'].includes(r.workflow_status) && r.due_date && new Date(r.due_date) < now);
  const inProgress = returns.filter(r => ['TEMP', 'WIP'].includes(r.workflow_status));
  const submitted = returns.filter(r => r.workflow_status === 'SUB');
  const approved = returns.filter(r => r.workflow_status === 'VAL');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Returns Dashboard" description="Overview of your compliance returns"
          actions={<Button onClick={() => navigate('/entity/returns/new')}><PlusCircle className="h-4 w-4 mr-2" />File New Return</Button>}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Upcoming (30d)" value={upcoming.length} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Overdue" value={overdue.length} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
          <StatCard title="In Progress" value={inProgress.length} icon={<FileText className="h-6 w-6" />} />
          <StatCard title="Submitted" value={submitted.length} icon={<CalendarCheck className="h-6 w-6" />} variant="warning" />
          <StatCard title="Approved" value={approved.length} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
        </div>

        {overdue.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">You have {overdue.length} overdue return{overdue.length > 1 ? 's' : ''}</p>
              <p className="text-sm text-muted-foreground mt-1">Please submit these returns to avoid penalties.</p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {returns.slice(0, 10).map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/70" onClick={() => navigate(`/entity/returns/${r.id}/view`)}>
                  <div>
                    <p className="font-medium text-sm">{r.unique_id}</p>
                    <p className="text-xs text-muted-foreground">{r.return_configs?.name} — {r.return_period} {r.return_year}</p>
                  </div>
                  <StatusBadge status={r.workflow_status} />
                </div>
              ))}
              {returns.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No returns filed yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    TEMP: { label: 'Draft', variant: 'secondary' },
    WIP: { label: 'In Progress', variant: 'outline' },
    SUB: { label: 'Submitted', variant: 'default' },
    VAL: { label: 'Validated', variant: 'default' },
    TBR: { label: 'To Be Resubmitted', variant: 'destructive' },
  };
  const m = map[status] || { label: status, variant: 'secondary' };
  return <Badge variant={m.variant} className={status === 'VAL' ? 'bg-green-600 text-white' : status === 'SUB' ? 'bg-amber-500 text-white' : status === 'WIP' ? 'bg-blue-500 text-white' : ''}>{m.label}</Badge>;
}
