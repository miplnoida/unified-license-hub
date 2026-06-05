import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { RETURN_STATUS_LABELS, ReturnStatus, INTERNAL_ROLES } from '@/types/platform';
import { Search, Loader2, Send, Eye, ClipboardList, CheckCircle, Clock, AlertTriangle, DollarSign, Calendar, TrendingUp, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { describeReturnsFilter } from '@/lib/licenseeDashboardDrilldowns';

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
  reviewed_at: string | null;
  reviewer_comments: string | null;
  form_data: any;
  created_at: string;
}

interface ReturnConfig {
  id: string;
  name: string;
  frequency: string;
  due_day: number;
  is_active: boolean;
}

interface Penalty {
  id: string;
  amount: number;
  currency: string;
  fee_type: string;
  name: string;
  is_active: boolean;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline', draft: 'secondary', submitted: 'default', accepted: 'default', rejected: 'destructive', overdue: 'destructive', resubmission_requested: 'outline',
};

export default function ComplianceReturns() {
  const { user } = useAuth();
  const { isPpoc, activeLicensee, activeLicenseeId } = usePpoc();
  const portalContext = useEffectivePortalContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Dashboard drill-down params:
  //   ?filter=due_soon|overdue|pending_review|upcoming
  //   ?status=<ReturnStatus>            (exact-match)
  const urlFilter = searchParams.get('filter');
  const urlStatus = searchParams.get('status');
  const dashboardFilterChip = describeReturnsFilter(searchParams);
  const [returns, setReturns] = useState<ComplianceReturn[]>([]);
  const [configs, setConfigs] = useState<ReturnConfig[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [licenseLicenseeMap, setLicenseLicenseeMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(urlStatus && urlStatus !== 'all' ? urlStatus : 'all');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [activeTab, setActiveTab] = useState(urlFilter || urlStatus ? 'returns' : 'dashboard');
  const isInternal = !!user && !portalContext.loading && (portalContext.isInternal || INTERNAL_ROLES.includes(user.role));

  // Keep tab/status in sync when the URL changes (e.g. user navigates from dashboard while page is mounted)
  useEffect(() => {
    if (urlStatus && urlStatus !== 'all') setStatusFilter(urlStatus);
    if (urlFilter || urlStatus) setActiveTab('returns');
  }, [urlFilter, urlStatus]);

  const clearDashboardFilter = () => {
    setSearchParams({});
    setStatusFilter('all');
  };

  useEffect(() => {
    loadAll();
    // Reload list when PPOC switches active licensee so the dataset always
    // represents the licensee the user is currently acting for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLicenseeId]);

  const loadAll = async () => {
    setLoading(true);
    const [returnsRes, configsRes, penaltiesRes] = await Promise.all([
      supabase.from('compliance_returns' as any).select('*').order('due_date', { ascending: false }),
      supabase.from('return_configurations' as any).select('*').eq('is_active', true),
      supabase.from('fee_configurations' as any).select('*').eq('fee_type', 'penalty').eq('is_active', true),
    ]);
    if (!returnsRes.error) setReturns((returnsRes.data || []) as any);
    if (!configsRes.error) setConfigs((configsRes.data || []) as any);
    if (!penaltiesRes.error) setPenalties((penaltiesRes.data || []) as any);

    // Build license → licensee map (only needed for PPOC filtering; cheap query)
    const licenseIds = Array.from(new Set(((returnsRes.data || []) as any[]).map(r => r.license_id).filter(Boolean)));
    if (licenseIds.length > 0) {
      const { data: lics } = await supabase
        .from('licenses')
        .select('id, holder_id')
        .in('id', licenseIds);
      const holderIds = Array.from(new Set(((lics || []) as any[]).map(l => l.holder_id).filter(Boolean)));
      let profMap: Record<string, string> = {};
      if (holderIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, licensee_id')
          .in('id', holderIds);
        profMap = Object.fromEntries(((profs || []) as any[]).map(p => [p.id, p.licensee_id]));
      }
      const map: Record<string, string> = {};
      for (const l of (lics || []) as any[]) {
        const lid = profMap[l.holder_id];
        if (lid) map[l.id] = lid;
      }
      setLicenseLicenseeMap(map);
    } else {
      setLicenseLicenseeMap({});
    }
    setLoading(false);
  };

  // Mark overdue + apply PPOC active-licensee filter
  const processedReturns = useMemo(() => {
    const now = new Date();
    let list = returns.map(r => {
      if ((r.status === 'pending' || r.status === 'draft') && new Date(r.due_date) < now) {
        return { ...r, status: 'overdue' as ReturnStatus };
      }
      return r;
    });
    // PPOC: only show returns belonging to the actively-selected licensee
    if (isPpoc && activeLicenseeId) {
      list = list.filter(r => {
        if (!r.license_id) return false;
        return licenseLicenseeMap[r.license_id] === activeLicenseeId;
      });
    }
    return list;
  }, [returns, isPpoc, activeLicenseeId, licenseLicenseeMap]);

  const stats = useMemo(() => {
    const total = processedReturns.length;
    const accepted = processedReturns.filter(r => r.status === 'accepted').length;
    const pending = processedReturns.filter(r => r.status === 'pending' || r.status === 'draft').length;
    const submitted = processedReturns.filter(r => r.status === 'submitted').length;
    const overdue = processedReturns.filter(r => r.status === 'overdue').length;
    const rejected = processedReturns.filter(r => r.status === 'rejected').length;
    const complianceRate = total > 0 ? Math.round(((accepted + submitted) / total) * 100) : 0;
    const estimatedPenalties = overdue * (penalties[0]?.amount || 0);
    return { total, accepted, pending, submitted, overdue, rejected, complianceRate, estimatedPenalties };
  }, [processedReturns, penalties]);

  const getConfigName = (id: string | null) => configs.find(c => c.id === id)?.name || '—';
  const getConfigFrequency = (id: string | null) => configs.find(c => c.id === id)?.frequency || '';

  const handleSubmit = async (id: string) => {
    const { error } = await supabase.from('compliance_returns' as any)
      .update({ status: 'submitted', submitted_at: new Date().toISOString() } as any).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Return submitted'); loadAll();
  };

  const handleReview = async (id: string, status: 'accepted' | 'rejected' | 'resubmission_requested') => {
    const updateData: any = { status, reviewed_at: new Date().toISOString(), reviewer_id: user?.id };
    if (status === 'resubmission_requested') {
      // Clear reviewed_at so it shows as pending resubmission
      updateData.reviewed_at = null;
    }
    const { error } = await supabase.from('compliance_returns' as any)
      .update(updateData).eq('id', id);
    if (error) { toast.error(error.message); return; }
    const label = status === 'resubmission_requested' ? 'requested for resubmission' : status;
    toast.success(`Return ${label}`); loadAll();
  };

  const matchesDashboardFilter = (r: ComplianceReturn): boolean => {
    if (!urlFilter) return true;
    const now = new Date();
    const due = new Date(r.due_date);
    const in30 = new Date(now.getTime() + 30 * 86400000);
    switch (urlFilter) {
      case 'overdue':
        return ['pending', 'draft', 'overdue', 'not_submitted'].includes(r.status) && due < now;
      case 'due_soon':
      case 'upcoming':
        return ['pending', 'draft', 'not_submitted'].includes(r.status) && due >= now && due <= in30;
      case 'pending_review':
        return ['submitted', 'pending_review'].includes(r.status);
      default:
        return true;
    }
  };

  const filtered = processedReturns.filter(r => {
    if (!matchesDashboardFilter(r)) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (frequencyFilter !== 'all') {
      const freq = getConfigFrequency(r.return_config_id);
      if (freq !== frequencyFilter) return false;
    }
    if (search) {
      const configName = getConfigName(r.return_config_id).toLowerCase();
      if (!configName.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const renderReturnsTable = (rows: ComplianceReturn[]) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Return Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Year</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Submit Date</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                {dashboardFilterChip ? `No returns matching “${dashboardFilterChip}”.` : 'No returns found'}
              </TableCell>
            </TableRow>
          ) : rows.map(ret => {
            const configName = getConfigName(ret.return_config_id);
            const freq = getConfigFrequency(ret.return_config_id);
            const year = new Date(ret.period_end).getFullYear();
            const returnDisplayName = configName !== '—'
              ? `${configName}_${new Date(ret.period_end).toISOString().split('T')[0].replace(/-/g, '')}`
              : '—';

            return (
              <TableRow key={ret.id}>
                <TableCell>
                  <button
                    className="font-medium text-primary hover:underline text-left"
                    onClick={() => navigate(`/compliance/returns/submit?returnId=${ret.id}`)}
                  >
                    {returnDisplayName}
                  </button>
                </TableCell>
                <TableCell className="text-sm uppercase">{freq ? `${freq.toUpperCase()} ${configName}` : '—'}</TableCell>
                <TableCell className="text-sm">{year}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[ret.status] || 'outline'} className="capitalize">
                    {RETURN_STATUS_LABELS[ret.status] || ret.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{ret.submitted_at ? 'Yes' : '—'}</TableCell>
                <TableCell className="text-sm">{new Date(ret.due_date).toLocaleDateString()}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ret.submitted_at ? new Date(ret.submitted_at).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {!isInternal && (ret.status === 'pending' || ret.status === 'draft' || ret.status === 'overdue' || ret.status === 'resubmission_requested') && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/compliance/returns/submit?returnId=${ret.id}`)}>
                        <FileText className="h-3 w-3 mr-1" />
                        {ret.status === 'resubmission_requested' ? 'Edit & Resubmit' : ret.status === 'overdue' ? 'Fill Now' : 'Fill Form'}
                      </Button>
                      {ret.status !== 'resubmission_requested' && ret.form_data && Object.keys(ret.form_data).length > 0 && (
                        <Button size="sm" onClick={() => handleSubmit(ret.id)}>
                          <Send className="h-3 w-3 mr-1" />Submit
                        </Button>
                      )}
                    </>
                  )}
                  {isInternal && ret.status === 'submitted' && (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="default" onClick={() => handleReview(ret.id, 'accepted')}>Accept</Button>
                      <Button size="sm" variant="outline" onClick={() => handleReview(ret.id, 'resubmission_requested')}>Resubmit</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleReview(ret.id, 'rejected')}>Reject</Button>
                    </div>
                  )}
                  {(ret.status === 'accepted' || ret.status === 'submitted') && (
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/compliance/returns/submit?returnId=${ret.id}`)}>
                      <Eye className="h-3 w-3" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  const isLate = (ret: ComplianceReturn) => {
    if (!ret.submitted_at || !ret.due_date) return false;
    return new Date(ret.submitted_at) > new Date(ret.due_date);
  };

  const daysOverdue = (ret: ComplianceReturn) => {
    const now = new Date();
    const due = new Date(ret.due_date);
    if (now <= due) return 0;
    return Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={isInternal ? 'Returns Management' : isPpoc && activeLicensee ? `Returns — ${activeLicensee.licensee_name}` : 'My Returns'}
          description={isInternal ? 'Monitor compliance returns, track penalties, and review submissions' : isPpoc ? 'Submit and track returns on behalf of the selected licensee' : 'Submit and track your periodic compliance returns'}
          actions={
            !isInternal ? (
              <Button
                onClick={() => navigate('/compliance/returns/submit')}
                disabled={isPpoc && !activeLicenseeId}
                title={isPpoc && !activeLicenseeId ? 'Select a licensee first' : undefined}
              >
                <Send className="h-4 w-4 mr-2" />New Submission
              </Button>
            ) : undefined
          }
        />

        <Tabs value={(urlFilter || urlStatus) ? 'returns' : activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard"><TrendingUp className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
            <TabsTrigger value="returns"><ClipboardList className="h-4 w-4 mr-1" />Returns</TabsTrigger>
            {isInternal && <TabsTrigger value="penalties"><DollarSign className="h-4 w-4 mr-1" />Penalties</TabsTrigger>}
          </TabsList>

          {/* DASHBOARD TAB */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10"><ClipboardList className="h-5 w-5 text-primary" /></div>
                    <div><p className="text-2xl font-bold">{stats.total}</p><p className="text-sm text-muted-foreground">Total Returns</p></div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10"><CheckCircle className="h-5 w-5 text-primary" /></div>
                    <div><p className="text-2xl font-bold">{stats.accepted}</p><p className="text-sm text-muted-foreground">Accepted</p></div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10"><Clock className="h-5 w-5 text-primary" /></div>
                    <div><p className="text-2xl font-bold">{stats.pending + stats.submitted}</p><p className="text-sm text-muted-foreground">In Progress</p></div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-destructive/10"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
                    <div><p className="text-2xl font-bold">{stats.overdue}</p><p className="text-sm text-muted-foreground">Overdue</p></div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Compliance Rate</CardTitle><CardDescription>Overall submission compliance</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-bold">{stats.complianceRate}%</span>
                    <span className="text-sm text-muted-foreground mb-1">of returns filed</span>
                  </div>
                  <Progress value={stats.complianceRate} className="h-3" />
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div><p className="text-muted-foreground">Accepted</p><p className="font-semibold">{stats.accepted}</p></div>
                    <div><p className="text-muted-foreground">Submitted</p><p className="font-semibold">{stats.submitted}</p></div>
                    <div><p className="text-muted-foreground">Rejected</p><p className="font-semibold text-destructive">{stats.rejected}</p></div>
                  </div>
                </CardContent>
              </Card>

              {isInternal && (
              <Card>
                <CardHeader><CardTitle className="text-base">Penalty Summary</CardTitle><CardDescription>Outstanding penalties from overdue returns</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-bold text-destructive">
                      ${stats.estimatedPenalties.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-sm text-muted-foreground mb-1">estimated</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Overdue returns</span>
                      <span className="font-semibold">{stats.overdue}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Penalty per return</span>
                      <span className="font-semibold">${(penalties[0]?.amount || 0).toFixed(2)}</span>
                    </div>
                    {penalties.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No penalty fees configured. Configure in Fee Management.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
              )}
            </div>

            {/* Upcoming due dates */}
            <Card>
              <CardHeader><CardTitle className="text-base">Upcoming Due Returns</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Days Left</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processedReturns
                      .filter(r => r.status === 'pending' || r.status === 'draft')
                      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
                      .slice(0, 5)
                      .map(ret => {
                        const daysLeft = Math.ceil((new Date(ret.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return (
                          <TableRow key={ret.id}>
                            <TableCell className="font-medium">{getConfigName(ret.return_config_id)}</TableCell>
                            <TableCell className="text-sm">{new Date(ret.period_start).toLocaleDateString()} – {new Date(ret.period_end).toLocaleDateString()}</TableCell>
                            <TableCell className="text-sm">{new Date(ret.due_date).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <Badge variant={daysLeft <= 3 ? 'destructive' : daysLeft <= 7 ? 'outline' : 'secondary'}>
                                {daysLeft > 0 ? `${daysLeft} days` : 'Due today'}
                              </Badge>
                            </TableCell>
                            <TableCell><Badge variant={statusVariant[ret.status] || 'outline'} className="capitalize">{ret.status}</Badge></TableCell>
                          </TableRow>
                        );
                      })}
                    {processedReturns.filter(r => r.status === 'pending' || r.status === 'draft').length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No upcoming returns</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* RETURNS TAB */}
          <TabsContent value="returns" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search returns..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {Object.entries(RETURN_STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={frequencyFilter} onValueChange={setFrequencyFilter}>
                    <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Frequencies" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Frequencies</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {dashboardFilterChip && (
              <div className="flex items-center gap-2 -mt-2">
                <Badge variant="outline" className="text-xs">Filter: {dashboardFilterChip}</Badge>
                <Button variant="ghost" size="sm" onClick={clearDashboardFilter} className="h-7 px-2 text-xs">
                  <X className="h-3 w-3 mr-1" />Clear filter
                </Button>
              </div>
            )}

            <Card>
              <CardContent className="p-0">
                {renderReturnsTable(filtered)}
              </CardContent>
            </Card>
          </TabsContent>

          {/* PENALTIES TAB */}
          <TabsContent value="penalties" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Overdue Returns & Penalties</CardTitle><CardDescription>Returns past their due date with estimated penalty amounts</CardDescription></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return Type</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Days Overdue</TableHead>
                      <TableHead>Estimated Penalty</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processedReturns.filter(r => r.status === 'overdue').length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No overdue returns — great compliance!</TableCell></TableRow>
                    ) : processedReturns.filter(r => r.status === 'overdue').map(ret => {
                      const days = daysOverdue(ret);
                      const penaltyAmount = penalties[0]?.amount || 0;
                      return (
                        <TableRow key={ret.id}>
                          <TableCell className="font-medium">{getConfigName(ret.return_config_id)}</TableCell>
                          <TableCell className="text-sm">{new Date(ret.period_start).toLocaleDateString()} – {new Date(ret.period_end).toLocaleDateString()}</TableCell>
                          <TableCell className="text-sm">{new Date(ret.due_date).toLocaleDateString()}</TableCell>
                          <TableCell><Badge variant="destructive">{days} days</Badge></TableCell>
                          <TableCell className="font-mono font-semibold text-destructive">${(penaltyAmount).toFixed(2)}</TableCell>
                          <TableCell><Badge variant="destructive">Overdue</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Penalty Configuration</CardTitle><CardDescription>Active penalty fee rules from Fee Management</CardDescription></CardHeader>
              <CardContent>
                {penalties.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground mb-3">No penalty fees configured yet.</p>
                    <Button variant="outline" onClick={() => navigate('/admin/fees')}>Configure Penalties</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {penalties.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-sm text-muted-foreground capitalize">{p.fee_type}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold">{p.currency} {Number(p.amount).toFixed(2)}</p>
                          <Badge variant={p.is_active ? 'default' : 'secondary'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
                        </div>
                      </div>
                    ))}
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
