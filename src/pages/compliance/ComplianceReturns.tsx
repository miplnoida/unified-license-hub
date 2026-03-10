import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { RETURN_STATUS_LABELS, ReturnStatus, INTERNAL_ROLES } from '@/types/platform';
import { Search, Loader2, Send, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface ComplianceReturn {
  id: string;
  return_config_id: string | null;
  license_id: string | null;
  submitter_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  status: ReturnStatus;
  submitted_at: string | null;
  created_at: string;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline', draft: 'secondary', submitted: 'default', accepted: 'default', rejected: 'destructive', overdue: 'destructive',
};

export default function ComplianceReturns() {
  const { user } = useAuth();
  const [returns, setReturns] = useState<ComplianceReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const isInternal = user && INTERNAL_ROLES.includes(user.role);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.from('compliance_returns' as any).select('*').order('due_date', { ascending: false });
      if (!error) setReturns((data || []) as any);
      setLoading(false);
    }
    load();
  }, []);

  const handleSubmit = async (id: string) => {
    const { error } = await supabase.from('compliance_returns' as any)
      .update({ status: 'submitted', submitted_at: new Date().toISOString() } as any).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Return submitted');
    setReturns(prev => prev.map(r => r.id === id ? { ...r, status: 'submitted' as ReturnStatus, submitted_at: new Date().toISOString() } : r));
  };

  const handleReview = async (id: string, status: 'accepted' | 'rejected') => {
    const { error } = await supabase.from('compliance_returns' as any)
      .update({ status, reviewed_at: new Date().toISOString(), reviewer_id: user?.id } as any).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Return ${status}`);
    setReturns(prev => prev.map(r => r.id === id ? { ...r, status: status as ReturnStatus } : r));
  };

  const filtered = returns.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={isInternal ? 'Compliance Returns' : 'My Returns'}
          description={isInternal ? 'Review and manage compliance return submissions' : 'Submit and track your periodic compliance returns'}
        />

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search returns..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(RETURN_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No returns found</TableCell></TableRow>
                  ) : filtered.map(ret => (
                    <TableRow key={ret.id}>
                      <TableCell className="text-sm">{new Date(ret.period_start).toLocaleDateString()} – {new Date(ret.period_end).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm">{new Date(ret.due_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[ret.status] || 'outline'} className="capitalize">{RETURN_STATUS_LABELS[ret.status] || ret.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ret.submitted_at ? new Date(ret.submitted_at).toLocaleDateString() : '—'}</TableCell>
                      <TableCell className="text-right space-x-1">
                        {!isInternal && (ret.status === 'pending' || ret.status === 'draft') && (
                          <Button size="sm" onClick={() => handleSubmit(ret.id)}><Send className="h-3 w-3 mr-1" />Submit</Button>
                        )}
                        {isInternal && ret.status === 'submitted' && (
                          <>
                            <Button size="sm" variant="default" onClick={() => handleReview(ret.id, 'accepted')}>Accept</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleReview(ret.id, 'rejected')}>Reject</Button>
                          </>
                        )}
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
