import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useClosureApprovalQueue } from '@/hooks/useInvestigationClosure';
import { Loader2, Gavel } from 'lucide-react';

const LABELS: Record<string, string> = {
  closure_with_enforcement: 'Closure — enforcement',
  closure_no_further_action: 'Closure — no further action',
  discontinuation: 'Discontinuation',
};

export default function InvestigationClosureQueue() {
  const { data, isLoading } = useClosureApprovalQueue();
  const rows = data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Investigation Closure Approvals"
          description="Closure and discontinuation determinations awaiting a supervisory decision."
        />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Gavel className="h-4 w-4" />Awaiting approval ({rows.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No closure determinations are awaiting approval.
              </div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Investigation</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Determination</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium text-sm truncate">
                          {c.conduct_investigations?.allegation?.slice(0, 70) || '—'}
                        </div>
                        <div className="text-xs font-mono text-muted-foreground">
                          {c.conduct_investigations?.code || c.investigation_id.slice(0, 8)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.conduct_investigations?.licensees?.name || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {LABELS[c.determination_type] || c.determination_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.submitted_at ? new Date(c.submitted_at).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/conduct/investigations/${c.investigation_id}`}>Review</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
