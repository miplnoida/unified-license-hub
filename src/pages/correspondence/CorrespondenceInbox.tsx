import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IntakeForm } from '@/components/correspondence/IntakeForm';
import { RecordsSearchBar, type RecordsFilters } from '@/components/correspondence/RecordsSearchBar';
import { seedCases } from './seed';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle } from 'lucide-react';

const priorityTone: Record<string, string> = {
  urgent: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  normal: 'bg-blue-50 text-blue-800 border-blue-200',
  low: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function CorrespondenceInbox() {
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
        (c.senderOrg ?? '').toLowerCase().includes(q) ||
        c.tags.join(' ').toLowerCase().includes(q)
      );
    });
  }, [filters]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Correspondence Inbox"
          description="Captured correspondence awaiting classification, assignment, review, and response."
          actions={<IntakeForm />}
        />

        <Card>
          <CardContent className="p-4 space-y-3">
            <RecordsSearchBar value={filters} onChange={setFilters} />
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => {
                    const overdue = new Date(c.dueAt).getTime() < Date.now() && c.status !== 'closed' && c.status !== 'responded';
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.reference}</TableCell>
                        <TableCell className="max-w-[260px]">
                          <div className="truncate font-medium">{c.subject}</div>
                          <div className="text-xs text-muted-foreground truncate">{c.tags.map((t) => `#${t}`).join(' ')}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{c.senderName}</div>
                          {c.senderOrg && <div className="text-xs text-muted-foreground">{c.senderOrg}</div>}
                        </TableCell>
                        <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                        <TableCell>
                          <div className="text-sm">{c.assignedOfficer}</div>
                          <div className="text-xs text-muted-foreground">{c.assignedUnit}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={priorityTone[c.priority]} variant="outline">{c.priority}</Badge>
                        </TableCell>
                        <TableCell><Badge variant="secondary">{c.status.replace('_', ' ')}</Badge></TableCell>
                        <TableCell>
                          <span className={overdue ? 'text-destructive font-medium inline-flex items-center gap-1' : ''}>
                            {overdue && <AlertTriangle className="h-3.5 w-3.5" />}
                            {formatDistanceToNow(new Date(c.receivedAt))}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/correspondence/${c.id}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No correspondence matches your filters.</TableCell></TableRow>
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
