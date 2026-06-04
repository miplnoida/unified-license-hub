import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMyReturns, useMutateReturn } from '@/hooks/useReturnsManagement';
import { StatusBadge } from './EntityReturnsDashboard';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Eye, Pencil, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import Swal from 'sweetalert2';

export default function MyReturnsPage() {
  const { data: returns = [], isLoading } = useMyReturns();
  const { remove } = useMutateReturn();
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [yearFilter, setYearFilter] = useState('');

  const filtered = returns.filter(r => {
    if (tab === 'draft') return ['TEMP', 'WIP'].includes(r.workflow_status);
    if (tab === 'submitted') return r.workflow_status === 'SUB';
    if (tab === 'validated') return r.workflow_status === 'VAL';
    if (tab === 'tbr') return r.workflow_status === 'TBR';
    return true;
  })
  .filter(r => !yearFilter || r.return_year === parseInt(yearFilter));

  const years = [...new Set(returns.map(r => r.return_year))].sort((a, b) => b - a);

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({ title: 'Delete this draft?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete' });
    if (result.isConfirmed) remove.mutate(id);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="My Returns" description="View and manage your compliance returns"
          actions={<Button onClick={() => navigate('/entity/returns/new')}><PlusCircle className="h-4 w-4 mr-2" />Create New Return</Button>}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="submitted">Submitted</TabsTrigger>
              <TabsTrigger value="validated">Validated</TabsTrigger>
              <TabsTrigger value="tbr">Resubmit</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <Select value={yearFilter || 'all'} onValueChange={v => setYearFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="All years" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All</SelectItem>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <TabsContent value={tab} className="mt-0">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Unique ID</TableHead><TableHead>Return Type</TableHead><TableHead>Period</TableHead><TableHead>Year</TableHead>
                          <TableHead>Status</TableHead><TableHead>Due Date</TableHead><TableHead>Submitted</TableHead><TableHead>On-Time</TableHead><TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.length === 0 ? (
                          <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No returns found</TableCell></TableRow>
                        ) : filtered.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium text-primary cursor-pointer" onClick={() => navigate(`/entity/returns/${r.id}/view`)}>{r.unique_id}</TableCell>
                            <TableCell>{r.return_configs?.return_types?.name || '—'}</TableCell>
                            <TableCell>{r.return_period}</TableCell>
                            <TableCell>{r.return_year}</TableCell>
                            <TableCell><StatusBadge status={r.workflow_status} /></TableCell>
                            <TableCell>{r.due_date || '—'}</TableCell>
                            <TableCell>{r.submit_date ? format(new Date(r.submit_date), 'MMM dd, yyyy') : '—'}</TableCell>
                            <TableCell>{r.ontime_status ? <StatusBadge status={r.ontime_status === 'ON_TIME' ? 'VAL' : 'TBR'} /> : '—'}</TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button variant="ghost" size="icon" onClick={() => navigate(`/entity/returns/${r.id}/view`)}><Eye className="h-4 w-4" /></Button>
                              {['TEMP', 'WIP', 'TBR'].includes(r.workflow_status) && (
                                <Button variant="ghost" size="icon" onClick={() => navigate(`/entity/returns/${r.id}/fill`)}><Pencil className="h-4 w-4" /></Button>
                              )}
                              {r.workflow_status === 'TEMP' && (
                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4" /></Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
