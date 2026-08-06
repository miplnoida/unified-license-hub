import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ClipboardCheck, FileCheck2 } from 'lucide-react';
import { useThematicClosureQueue, useThematicReportApprovalQueue } from '@/hooks/useThematicClosure';

export default function ThematicClosureQueue() {
  const closures = useThematicClosureQueue();
  const reports = useThematicReportApprovalQueue();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Thematic Closure Approvals"
          description="Reports awaiting approval and thematic reviews awaiting a closure decision."
        />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck2 className="h-4 w-4" /> Reports awaiting approval ({(reports.data || []).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {reports.isLoading ? (
              <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : (reports.data || []).length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No reports awaiting approval.</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Review</TableHead><TableHead>Report</TableHead><TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow></TableHeader>
                <TableBody>{(reports.data || []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{r.thematic_reviews?.title || r.review_id}</div>
                      <div className="text-xs font-mono text-muted-foreground">{r.thematic_reviews?.code || '—'}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.title} <Badge variant="secondary" className="ml-1">v{r.version}</Badge></TableCell>
                    <TableCell className="text-xs">{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/supervision/thematic-reviews/${r.review_id}`}>Review report</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Closure decisions ({(closures.data || []).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {closures.isLoading ? (
              <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : (closures.data || []).length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No reviews awaiting a closure decision.</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Code</TableHead><TableHead>Review</TableHead><TableHead>Closure state</TableHead>
                  <TableHead>Requested</TableHead><TableHead className="text-right">Action</TableHead>
                </TableRow></TableHeader>
                <TableBody>{(closures.data || []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.code || '—'}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{r.title}</div>
                      {r.closure_summary && <div className="text-xs text-muted-foreground line-clamp-1">{r.closure_summary}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.closure_state === 'rejected' ? 'destructive' : 'secondary'}>
                        {r.closure_state === 'pending_approval' ? 'Pending approval' : 'Rejected'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.closure_requested_at ? new Date(r.closure_requested_at).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" asChild><Link to={`/supervision/thematic-reviews/${r.id}`}>Open</Link></Button>
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
