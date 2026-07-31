import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCorrespondenceThreads } from '@/hooks/useCorrespondence';
import { format } from 'date-fns';
import { MessageSquare, Search } from 'lucide-react';

export default function MyCorrespondence() {
  const [query, setQuery] = useState('');
  const { data: rows = [], isLoading } = useCorrespondenceThreads({ query });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="My Correspondence"
          description="Letters, notices and messages exchanged with the regulator. Open a thread to read the full conversation and reply."
        />

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="relative max-w-md">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search subject or reference…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && <TableRow><TableCell colSpan={6}><Skeleton className="h-20 w-full" /></TableCell></TableRow>}
                  {!isLoading && rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.reference}</TableCell>
                      <TableCell className="font-medium max-w-[280px] truncate">{c.subject}</TableCell>
                      <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                      <TableCell className="text-sm">{format(new Date(c.received_at), 'PP')}</TableCell>
                      <TableCell><Badge variant="secondary">{c.status.replace('_', ' ')}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/entity/correspondence/${c.id}`}><MessageSquare className="h-3.5 w-3.5 mr-1" />Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">You have no correspondence yet.</TableCell></TableRow>
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
