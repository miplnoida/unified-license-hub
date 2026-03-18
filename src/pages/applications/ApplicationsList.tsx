import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/StatCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { APPLICATION_STATUS_LABELS, ApplicationStatus, INTERNAL_ROLES } from '@/types/platform';
import { PlusCircle, Search, Eye, Loader2, FileText, CheckCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight, Download } from 'lucide-react';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary', submitted: 'default', in_progress: 'outline',
  approved: 'default', rejected: 'destructive',
};

interface Application {
  id: string;
  application_number: string;
  applicant_id: string;
  license_type: string;
  status: ApplicationStatus;
  data: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string;
}

const PAGE_SIZE = 10;

export default function ApplicationsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(0);

  const isInternal = user && INTERNAL_ROLES.includes(user.role);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [appRes, profRes, preLicRes] = await Promise.all([
        supabase.from('applications').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name'),
        supabase.from('pre_license_users' as any).select('id, full_name'),
      ]);
      if (appRes.data) setApplications(appRes.data as any);
      const allProfiles: Profile[] = [
        ...((profRes.data || []) as any),
        ...((preLicRes.data || []) as any),
      ];
      setProfiles(allProfiles);
      setLoading(false);
    }
    load();
  }, []);

  const getApplicantName = (id: string) => profiles.find(p => p.id === id)?.full_name || '—';

  // Extract unique license types for filter
  const licenseTypes = useMemo(() => {
    const types = new Set(applications.map(a => a.license_type));
    return Array.from(types).filter(Boolean).sort();
  }, [applications]);

  const filtered = useMemo(() => {
    return applications.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (typeFilter !== 'all' && a.license_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = getApplicantName(a.applicant_id).toLowerCase();
        if (!a.application_number.toLowerCase().includes(q) &&
            !a.license_type.toLowerCase().includes(q) &&
            !name.includes(q)) return false;
      }
      return true;
    });
  }, [applications, statusFilter, typeFilter, search, profiles]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const approved = applications.filter(a => a.status === 'approved').length;
  const pending = applications.filter(a => !['approved', 'rejected'].includes(a.status)).length;
  const rejected = applications.filter(a => a.status === 'rejected').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={isInternal ? 'License Requests' : 'My Applications'}
          description={isInternal ? 'All pre-license and post-license requests' : 'View and manage your license applications'}
          actions={
            !isInternal && (
              <Button onClick={() => navigate('/applications/new')}>
                <PlusCircle className="h-4 w-4 mr-2" />New Application
              </Button>
            )
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Requests" value={applications.length} icon={<FileText className="h-6 w-6" />} />
          <StatCard title="Approved" value={approved} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Pending" value={pending} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Rejected" value={rejected} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, number, or type..."
                  className="pl-10"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(APPLICATION_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All License Types</SelectItem>
                  {licenseTypes.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="ml-auto">
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
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
                    <TableHead>Applicant Name</TableHead>
                    <TableHead>License Type / Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                        No license requests found.
                      </TableCell>
                    </TableRow>
                  ) : paged.map(app => (
                    <TableRow
                      key={app.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/applications/${app.id}`)}
                    >
                      <TableCell className="font-mono font-medium text-sm">{app.application_number}</TableCell>
                      <TableCell>{getApplicantName(app.applicant_id)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{app.license_type}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[app.status] || 'outline'} className="capitalize text-xs">
                          {APPLICATION_STATUS_LABELS[app.status] || app.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : new Date(app.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); navigate(`/applications/${app.id}`); }}>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">{page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
