import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { APPLICATION_STATUS_LABELS, ApplicationStatus, INTERNAL_ROLES } from '@/types/platform';
import { PlusCircle, Search, Eye, Loader2 } from 'lucide-react';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary', submitted: 'default', scrutiny: 'outline', query_raised: 'outline',
  resubmitted: 'outline', technical_review: 'outline', pending_approval: 'outline',
  approved: 'default', rejected: 'destructive', license_issued: 'default',
};

interface Application {
  id: string; application_number: string; applicant_id: string; license_type: string;
  status: ApplicationStatus; data: Record<string, unknown>; submitted_at: string | null; created_at: string;
}

export default function ApplicationsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const isInternal = user && INTERNAL_ROLES.includes(user.role);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('applications').select('*').order('created_at', { ascending: false });
      if (data) setApplications(data as any);
      setLoading(false);
    })();
  }, []);

  const filtered = applications.filter(a => {
    if (search && !a.application_number.toLowerCase().includes(search.toLowerCase()) &&
        !a.license_type.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={isInternal ? 'Applications Queue' : 'My Applications'}
          description={isInternal ? 'Review and process license applications' : 'View and manage your license applications'}
          actions={
            !isInternal && (
              <Button onClick={() => navigate('/applications/new')}>
                <PlusCircle className="h-4 w-4 mr-2" />New Application
              </Button>
            )
          }
        />

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search applications..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(APPLICATION_STATUS_LABELS).map(([k, v]) => (
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
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Application #</TableHead>
                    <TableHead>License Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No applications found
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(app => (
                    <TableRow key={app.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/applications/${app.id}`)}>
                      <TableCell className="font-medium font-mono text-sm">{app.application_number}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{app.license_type}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[app.status] || 'outline'} className="capitalize text-xs">
                          {APPLICATION_STATUS_LABELS[app.status] || app.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(app.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4 mr-1" />View
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
