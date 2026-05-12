import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusCircle, Search, Eye, Trash2, FileText, Clock,
  CheckCircle, AlertTriangle, XCircle, RotateCcw,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { toast } from 'sonner';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'approved' | 'pending' | 'rejected' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  submitted: { label: 'Submitted', variant: 'default' },
  in_progress: { label: 'In Progress', variant: 'pending' },
  approved: { label: 'Approved', variant: 'approved' },
  rejected: { label: 'Rejected', variant: 'rejected' },
  resubmission_requested: { label: 'Resubmit Requested', variant: 'pending' },
  query_raised: { label: 'Query Raised', variant: 'pending' },
};

export default function PreLicenseeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['pre-licensee-applications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('applicant_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (appId: string) => {
      const { error } = await supabase.from('applications').delete().eq('id', appId).eq('status', 'draft');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pre-licensee-applications'] });
      toast.success('Application deleted.');
    },
    onError: () => toast.error('Failed to delete application.'),
  });

  const filtered = useMemo(() => {
    return applications.filter((app: any) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        app.application_number?.toLowerCase().includes(q) ||
        app.license_type?.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [applications, searchQuery, statusFilter]);

  const totalApps = applications.length;
  const draftCount = applications.filter((a: any) => a.status === 'draft').length;
  const inProgressCount = applications.filter((a: any) => a.status === 'in_progress').length;
  const submittedCount = applications.filter((a: any) => ['submitted', 'under_review', 'query_raised', 'resubmission_requested'].includes(a.status)).length;
  const approvedCount = applications.filter((a: any) => a.status === 'approved').length;

  if (!user) return null;

  const getAppData = (app: any) => {
    const d = (app.data || {}) as Record<string, any>;
    return {
      sectorName: d.sector_name || '—',
      subSectorName: d.sub_sector_name || '—',
      categoryName: d.category_name || '—',
      entityName: d.entity_name || d.applicant_name || '—',
    };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome, {user.fullName}</h1>
          <p className="mt-1 text-muted-foreground">Manage your license applications and track their status.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Applications" value={totalApps} icon={<FileText className="h-6 w-6" />} />
          <StatCard title="Drafts" value={draftCount} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="In Review" value={submittedCount} icon={<AlertTriangle className="h-6 w-6" />} variant="primary" />
          <StatCard title="Approved" value={approvedCount} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
        </div>

        <div className="card-elevated">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b">
            <h2 className="text-lg font-semibold text-foreground">My Applications</h2>
            <Button onClick={() => navigate('/pre-license/new')}>
              <PlusCircle className="h-4 w-4 mr-2" />
              New Application
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 p-4 border-b bg-muted/30">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search applications..." className="pl-10" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select value={statusFilter || 'all'} onValueChange={v => setStatusFilter(v === 'all' ? 'all' : v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="resubmission_requested">Resubmit Requested</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Application #</TableHead>
                    <TableHead>License Type</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Sub-Sector</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {applications.length === 0 ? 'No applications yet. Click "New Application" to start.' : 'No matching applications.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((app: any) => {
                      const info = getAppData(app);
                      const st = STATUS_MAP[app.status] || { label: app.status, variant: 'outline' as const };
                      return (
                        <TableRow key={app.id}>
                          <TableCell className="font-mono text-xs">{app.application_number}</TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">{app.license_type}</TableCell>
                          <TableCell>{info.sectorName}</TableCell>
                          <TableCell>{info.subSectorName}</TableCell>
                          <TableCell>{info.categoryName}</TableCell>
                          <TableCell>
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </TableCell>
                          <TableCell>{app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '—'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/applications/${app.id}`)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View</TooltipContent>
                              </Tooltip>
                              {app.status === 'draft' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(app.id)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete</TooltipContent>
                                </Tooltip>
                              )}
                              {(app.status === 'draft' || app.status === 'in_progress') && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => navigate(`/applications/${app.id}/continue?draft=${app.id}&mode=continue`)}
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Continue</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
