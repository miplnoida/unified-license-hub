import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RecordsSearchBar, type RecordsFilters } from '@/components/correspondence/RecordsSearchBar';
import { RetentionBadge } from '@/components/correspondence/RetentionBadge';
import { useCorrespondenceThreads } from '@/hooks/useCorrespondence';
import { format } from 'date-fns';
import { Download, Eye } from 'lucide-react';
import { authorizedExport } from '@/lib/rbac/authorizedExport';
import { toast } from 'sonner';

export default function CorrespondenceRecords() {
  const [filters, setFilters] = useState<RecordsFilters>({ query: '', category: 'all', status: 'all', channel: 'all' });
  const { data: rows = [], isLoading } = useCorrespondenceThreads(filters);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Correspondence Records"
          description="Search, retrieve, and manage historical correspondence with version history and retention schedules."
          actions={<Button data-rbac="correspondence_management.export" variant="outline" onClick={async () => { try { await authorizedExport('correspondence_management', 'export', { count: rows.length }); toast.success('Export queued'); } catch (e: any) { toast.error(e?.message ?? 'Not authorized'); } }}><Download className="h-4 w-4 mr-2" />Export index</Button>}
        />

        <Card>
          <CardContent className="p-4 space-y-4">
            <RecordsSearchBar value={filters} onChange={setFilters} />
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Retention</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && <TableRow><TableCell colSpan={8}><Skeleton className="h-24 w-full" /></TableCell></TableRow>}
                  {!isLoading && rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.reference}</TableCell>
                      <TableCell className="max-w-[240px] truncate font-medium">{c.subject}</TableCell>
                      <TableCell>
                        <div className="text-sm">{c.sender_name}</div>
                        {c.sender_org && <div className="text-xs text-muted-foreground">{c.sender_org}</div>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                      <TableCell className="text-sm">{format(new Date(c.received_at), 'PP')}</TableCell>
                      <TableCell>{c.retention_expires_at && <RetentionBadge years={c.retention_years} expiresAt={c.retention_expires_at} />}</TableCell>
                      <TableCell><Badge variant="secondary">{c.status.replace('_', ' ')}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/correspondence/${c.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No records match your filters.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
