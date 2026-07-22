import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RecordsSearchBar, type RecordsFilters } from '@/components/correspondence/RecordsSearchBar';
import { RetentionBadge } from '@/components/correspondence/RetentionBadge';
import { seedCases } from './seed';
import { format } from 'date-fns';
import { Download, Eye } from 'lucide-react';
import { authorizedExport } from '@/lib/rbac/authorizedExport';
import { toast } from 'sonner';

export default function CorrespondenceRecords() {
  const [filters, setFilters] = useState<RecordsFilters>({ query: '', category: 'all', status: 'all', channel: 'all' });

  const rows = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return seedCases.filter((c) => {
      if (filters.category !== 'all' && c.category !== filters.category) return false;
      if (filters.status !== 'all' && c.status !== filters.status) return false;
      if (filters.channel !== 'all' && c.channel !== filters.channel) return false;
      if (!q) return true;
      return (
        c.subject.toLowerCase().includes(q) ||
        c.reference.toLowerCase().includes(q) ||
        c.senderName.toLowerCase().includes(q) ||
        c.tags.join(' ').includes(q)
      );
    });
  }, [filters]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Correspondence Records"
          description="Search, retrieve, and manage historical correspondence with version history and retention schedules."
          actions={<Button data-rbac="correspondence_management.export" variant="outline"><Download className="h-4 w-4 mr-2" />Export index</Button>}
        />

        <Card>
          <CardContent className="p-4 space-y-4">
            <RecordsSearchBar value={filters} onChange={setFilters} />
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Attachments</TableHead>
                    <TableHead>Retention</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.reference}</TableCell>
                      <TableCell className="max-w-[240px] truncate font-medium">{c.subject}</TableCell>
                      <TableCell>
                        <div className="text-sm">{c.senderName}</div>
                        {c.senderOrg && <div className="text-xs text-muted-foreground">{c.senderOrg}</div>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                      <TableCell className="text-sm">{format(new Date(c.receivedAt), 'PP')}</TableCell>
                      <TableCell>
                        <div className="text-sm">{c.attachments.length} file(s)</div>
                        <div className="text-xs text-muted-foreground">
                          latest v{Math.max(...c.attachments.map((a) => a.version), 1)}
                        </div>
                      </TableCell>
                      <TableCell><RetentionBadge years={c.retentionYears} expiresAt={c.retentionExpiresAt} /></TableCell>
                      <TableCell><Badge variant="secondary">{c.status.replace('_', ' ')}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/correspondence/${c.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No records match your filters.</TableCell></TableRow>
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
