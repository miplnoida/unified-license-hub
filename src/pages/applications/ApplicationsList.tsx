import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/StatCard';
import { PaymentVerificationDialog } from '@/components/applications/PaymentVerificationDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { APPLICATION_STATUS_LABELS, ApplicationStatus, INTERNAL_ROLES } from '@/types/platform';
import { PlusCircle, Search, Eye, Loader2, FileText, CheckCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp, MessageSquare, Pencil, Ban } from 'lucide-react';
import { toast } from 'sonner';

const statusBadgeVariant = (s: string) => {
  switch (s) {
    case 'approved': return 'approved';
    case 'rejected': return 'rejected';
    case 'submitted': return 'submitted';
    case 'in_progress': return 'under-review';
    case 'resubmission_requested': return 'returned';
    case 'query_raised': return 'returned';
    case 'cancelled': return 'destructive';
    default: return 'draft';
  }
};

const licenseTypeBadgeVariant = (t: string) => {
  if (t.toLowerCase().includes('pre')) return 'submitted';
  if (t.toLowerCase().includes('post')) return 'approved';
  return 'secondary';
};

const paymentBadgeVariant = (s: string) => {
  switch (s) {
    case 'success': return 'approved';
    case 'pending': return 'pending';
    case 'failed': return 'rejected';
    default: return 'draft';
  }
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

interface ActionEvent {
  id: string;
  application_id: string;
  action: string;
  comments: string | null;
  actor_id: string;
  created_at: string;
  actor_email?: string;
}

interface PaymentInfo {
  id?: string;
  application_id: string;
  amount: number;
  status: string;
  currency: string;
  payment_method?: string;
  transaction_ref?: string;
  created_at?: string;
  paid_at?: string;
}

type SearchMode = 'contains' | 'starts_with' | 'exact';

const TAB_STATUS_MAP: Record<string, ApplicationStatus[]> = {
  submitted: ['submitted', 'in_progress'],
  resubmission: ['resubmission_requested'],
  accepted: ['approved'],
  rejected: ['rejected'],
};

const PAGE_SIZE = 10;

export default function ApplicationsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [sectors, setSectors] = useState<Record<string, string>>({});
  const [subSectors, setSubSectors] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [services, setServices] = useState<Record<string, string>>({});
  const [allActions, setAllActions] = useState<ActionEvent[]>([]);
  const [payments, setPayments] = useState<Record<string, PaymentInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('contains');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPaymentApp, setSelectedPaymentApp] = useState<{ payment: PaymentInfo; applicantName: string; applicationNumber: string; applicantId: string } | null>(null);

  const isInternal = user && INTERNAL_ROLES.includes(user.role);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [appRes, profRes, preLicRes, actionsRes, sectorRes, subSectorRes, catRes, svcRes, payRes] = await Promise.all([
        supabase.from('applications').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name, email'),
        supabase.from('pre_license_users' as any).select('id, full_name, email'),
        supabase.from('approval_actions').select('*').order('created_at', { ascending: true }),
        supabase.from('sectors').select('id, name'),
        supabase.from('sub_sectors').select('id, name'),
        supabase.from('categories').select('id, name'),
        supabase.from('services').select('id, name'),
        supabase.from('payments').select('id, application_id, amount, status, currency, payment_method, transaction_ref, created_at, paid_at'),
      ]);
      if (appRes.data) setApplications(appRes.data as any);
      const allProfiles: any[] = [...(profRes.data || []), ...(preLicRes.data || [])];
      setProfiles(allProfiles);

      if (sectorRes.data) setSectors(Object.fromEntries((sectorRes.data as any[]).map(s => [s.id, s.name])));
      if (subSectorRes.data) setSubSectors(Object.fromEntries((subSectorRes.data as any[]).map(s => [s.id, s.name])));
      if (catRes.data) setCategories(Object.fromEntries((catRes.data as any[]).map(c => [c.id, c.name])));
      if (svcRes.data) setServices(Object.fromEntries((svcRes.data as any[]).map(s => [s.id, s.name])));

      if (payRes.data) {
        const payMap: Record<string, PaymentInfo> = {};
        (payRes.data as any[]).forEach(p => {
          if (p.application_id) payMap[p.application_id] = p;
        });
        setPayments(payMap);
      }
      if (actionsRes.data) {
        const emailMap: Record<string, string> = {};
        allProfiles.forEach((p: any) => { emailMap[p.id] = p.email || p.full_name; });
        setAllActions((actionsRes.data as any[]).map(a => ({
          ...a,
          actor_email: emailMap[a.actor_id] || a.actor_id,
        })));
      }
      setLoading(false);
    }
    load();
  }, []);

  const getApplicantName = (id: string) => profiles.find(p => p.id === id)?.full_name || '—';

  const getAppActions = (appId: string) => allActions.filter(a => a.application_id === appId);

  const resolveField = (app: Application, field: string): string => {
    const data = app.data as any;
    if (!data) return '—';
    const id = data[field];
    if (!id) return '—';
    switch (field) {
      case 'sector_id': return sectors[id] || id;
      case 'sub_sector_id': return subSectors[id] || id;
      case 'category_id': return categories[id] || id;
      case 'service_id': return services[id] || id;
      default: return String(id);
    }
  };

  const matchSearch = (value: string, query: string, mode: SearchMode): boolean => {
    const v = value.toLowerCase();
    const q = query.toLowerCase();
    switch (mode) {
      case 'starts_with': return v.startsWith(q);
      case 'exact': return v === q;
      case 'contains': default: return v.includes(q);
    }
  };

  const filtered = useMemo(() => {
    return applications.filter(a => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'resubmission_requested') {
          if (a.status !== 'resubmission_requested' && a.status !== 'query_raised') return false;
        } else if (a.status !== statusFilter) return false;
      }
      if (search) {
        const q = search;
        const name = getApplicantName(a.applicant_id);
        const sector = resolveField(a, 'sector_id');
        const subSector = resolveField(a, 'sub_sector_id');
        if (
          !matchSearch(a.application_number, q, searchMode) &&
          !matchSearch(name, q, searchMode) &&
          !matchSearch(sector, q, searchMode) &&
          !matchSearch(subSector, q, searchMode)
        ) return false;
      }
      return true;
    });
  }, [applications, statusFilter, search, searchMode, profiles, sectors, subSectors]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const approved = applications.filter(a => a.status === 'approved').length;
  const pending = applications.filter(a => !['approved', 'rejected', 'cancelled'].includes(a.status)).length;
  const rejected = applications.filter(a => a.status === 'rejected').length;

  const renderTable = () => (
    <>
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
                  <TableHead>Applicant</TableHead>
                  <TableHead>License Type</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Sub Sector</TableHead>
                  <TableHead>Category / Service</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>History</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-12">
                      No applications found.
                    </TableCell>
                  </TableRow>
                ) : paged.map(app => {
                  const actions = getAppActions(app.id);
                  const isExpanded = expandedId === app.id;
                  const sectorName = resolveField(app, 'sector_id');
                  const subSectorName = resolveField(app, 'sub_sector_id');
                  const categoryName = resolveField(app, 'category_id');
                  const serviceName = resolveField(app, 'service_id');
                  const catSvc = [categoryName, serviceName].filter(v => v !== '—').join(' / ') || '—';
                  const payment = payments[app.id];
                  return (
                    <> 
                      <TableRow
                        key={app.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/applications/${app.id}`)}
                      >
                        <TableCell className="font-mono font-medium text-sm">{app.application_number}</TableCell>
                        <TableCell>{getApplicantName(app.applicant_id)}</TableCell>
                        <TableCell className="text-sm">
                          {(app.data as any)?.service_id ? 'Post Licensee' : (app.data as any)?.category_id ? 'Pre Licensee' : '—'}
                        </TableCell>
                        <TableCell className="text-sm">{sectorName}</TableCell>
                        <TableCell className="text-sm">{subSectorName}</TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate">{catSvc}</TableCell>
                        <TableCell>
                          {payment ? (
                            <div
                              className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedPaymentApp({
                                  payment,
                                  applicantName: getApplicantName(app.applicant_id),
                                  applicationNumber: app.application_number,
                                  applicantId: app.applicant_id,
                                });
                                setPaymentDialogOpen(true);
                              }}
                            >
                              <span className="text-xs font-medium">{payment.currency === 'USD' ? '$' : payment.currency}{Number(payment.amount).toLocaleString()}</span>
                              <Badge variant={paymentBadgeVariant(payment.status) as any} className="text-[10px]">
                                {payment.status === 'success' ? 'Paid' : payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(app.status) as any} className="text-xs">
                            {APPLICATION_STATUS_LABELS[app.status] || app.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : new Date(app.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {actions.length > 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : app.id); }}
                            >
                              <MessageSquare className="h-4 w-4" />
                              <span className="text-xs">{actions.length}</span>
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); navigate(`/applications/${app.id}`); }}>
                              <Eye className="h-4 w-4 mr-1" />View
                            </Button>
                            {!isInternal && ['draft', 'resubmission_requested'].includes(app.status) && (
                              <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); navigate(`/applications/${app.id}?mode=edit`); }}>
                                <Pencil className="h-4 w-4 mr-1" />Edit
                              </Button>
                            )}
                            {!isInternal && ['draft', 'resubmission_requested'].includes(app.status) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={async e => {
                                  e.stopPropagation();
                                  if (!window.confirm('Are you sure you want to cancel this application?')) return;
                                  const { error } = await supabase.from('applications').update({ status: 'cancelled' } as any).eq('id', app.id);
                                  if (error) { toast.error(error.message); return; }
                                  await supabase.from('approval_actions').insert({
                                    application_id: app.id, action: 'cancelled', actor_id: user!.id,
                                    comments: 'Application cancelled by applicant',
                                  } as any);
                                  toast.success('Application cancelled');
                                  setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'cancelled' as ApplicationStatus } : a));
                                }}
                              >
                                <Ban className="h-4 w-4 mr-1" />Cancel
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && actions.length > 0 && (
                        <TableRow key={`${app.id}-history`}>
                          <TableCell colSpan={11} className="bg-muted/30 p-4">
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">Application History</p>
                              {actions.map(evt => (
                                <div key={evt.id} className="flex gap-3 items-start border-l-2 border-primary/30 pl-3 py-1">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="outline" className="text-[10px] capitalize">
                                        {evt.action.replace(/_/g, ' ')}
                                      </Badge>
                                      <span className="text-[10px] text-muted-foreground">
                                        {new Date(evt.created_at).toLocaleString()}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">by {evt.actor_email}</p>
                                    {evt.comments && (
                                      <p className="text-xs mt-1 italic text-muted-foreground border-l-2 border-muted pl-2">
                                        "{evt.comments}"
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
    </>
  );

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

        {/* Search & Filter Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by App #, Company, Sector, Sub Sector..."
                  className="pl-10"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                />
              </div>
              <Select value={searchMode} onValueChange={v => { setSearchMode(v as SearchMode); setPage(0); }}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="starts_with">Starts With</SelectItem>
                  <SelectItem value="exact">Exact Match</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resubmission_requested">Resubmission Requested</SelectItem>
                  <SelectItem value="approved">Accepted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="ml-auto">
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Application List */}
        <div className="space-y-4">
          {renderTable()}
        </div>

        <PaymentVerificationDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          payment={selectedPaymentApp?.payment || null}
          applicantName={selectedPaymentApp?.applicantName || ''}
          applicationNumber={selectedPaymentApp?.applicationNumber || ''}
          applicantId={selectedPaymentApp?.applicantId || ''}
          onVerified={() => {
            // Reload data
            window.location.reload();
          }}
        />
      </div>
    </DashboardLayout>
  );
}
