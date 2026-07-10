import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import { INTERNAL_ROLES } from '@/types/platform';
import {
  PlusCircle, Search, Eye, Loader2, UserCheck, Mail, User, BarChart3, ChevronDown, ChevronRight,
  MoreHorizontal, Printer, RefreshCw, ShieldAlert, Filter,
} from 'lucide-react';
import { ComplaintAcknowledgement, type ComplaintAckInput } from '@/components/complaints/ComplaintAcknowledgement';
import { ComplaintEvidenceRow } from '@/components/complaints/ComplaintEvidenceRow';
import { ComplaintAttachmentsField } from '@/components/complaints/ComplaintAttachmentsField';
import { attachStagedFilesToComplaint } from '@/lib/complaintAttachments';
import { computeSlaStatus, slaStatusLabel, slaStatusVariant } from '@/lib/complaintsSla';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  submitted: 'default',
  open: 'default',
  under_investigation: 'outline',
  resolved: 'default',
  closed: 'secondary',
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  open: 'Open',
  under_investigation: 'Under Investigation',
  resolved: 'Resolved',
  closed: 'Closed',
};

const severityVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'outline',
  low: 'secondary',
};

const priorityVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  p1: 'destructive',
  p2: 'destructive',
  p3: 'outline',
  p4: 'secondary',
};

const INTAKE_SOURCES = ['consumer_portal', 'internal', 'staff_intake', 'referral', 'whistleblower'];

interface RefLookup { id: string; name: string }

export default function ComplaintsList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [complaints, setComplaints] = useState<any[]>([]);
  const [complaintTypes, setComplaintTypes] = useState<RefLookup[]>([]);
  const [categories, setCategories] = useState<RefLookup[]>([]);
  const [products, setProducts] = useState<RefLookup[]>([]);
  const [channels, setChannels] = useState<RefLookup[]>([]);
  const [licenseeMap, setLicenseeMap] = useState<Map<string, string>>(new Map());
  const [profileMap, setProfileMap] = useState<Map<string, { full_name: string | null; email: string | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [intakeFilter, setIntakeFilter] = useState('all');
  const [slaFilter, setSlaFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [triageFilter, setTriageFilter] = useState('all');
  const [vulnerableFilter, setVulnerableFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [demoMode, setDemoMode] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<any | null>(null);
  const [ackDialog, setAckDialog] = useState<ComplaintAckInput | null>(null);
  const [detailProfile, setDetailProfile] = useState<any | null>(null);
  const [newSubject, setNewSubject] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTypeId, setNewTypeId] = useState('');
  const [newSeverity, setNewSeverity] = useState('medium');
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [resolution, setResolution] = useState('');
  const [updating, setUpdating] = useState(false);

  const isInternal = !!(user && INTERNAL_ROLES.includes(user.role));

  const refs = useMemo(() => ({
    types: new Map(complaintTypes.map(t => [t.id, t.name])),
    categories: new Map(categories.map(t => [t.id, t.name])),
    products: new Map(products.map(t => [t.id, t.name])),
    channels: new Map(channels.map(t => [t.id, t.name])),
    licensees: licenseeMap,
    profiles: profileMap,
  }), [complaintTypes, categories, products, channels, licenseeMap, profileMap]);

  const loadComplaints = async () => {
    setLoading(true);
    let q = supabase.from('complaints').select('*').order('created_at', { ascending: false });
    if (!isInternal && user?.id) q = q.eq('complainant_id', user.id);

    const promises: any[] = [
      q,
      supabase.from('complaint_types').select('id, name').eq('is_active', true).order('name'),
    ];
    if (isInternal) {
      promises.push(
        supabase.from('conduct_risk_categories').select('id, name').order('name'),
        supabase.from('conduct_products').select('id, name').order('name'),
        supabase.from('conduct_channels').select('id, name').order('name'),
      );
    }
    const results = await Promise.all(promises);
    const rows = (results[0].data || []) as any[];
    setComplaints(rows);
    setComplaintTypes((results[1].data || []) as RefLookup[]);
    if (isInternal) {
      setCategories((results[2].data || []) as RefLookup[]);
      setProducts((results[3].data || []) as RefLookup[]);
      setChannels((results[4].data || []) as RefLookup[]);

      // Batch resolve licensees + profiles
      const licIds = Array.from(new Set(rows.map(r => r.licensee_id).filter(Boolean)));
      const profIds = Array.from(new Set(
        rows.flatMap(r => [r.investigator_id, r.complainant_id]).filter(Boolean)
      ));
      const [licRes, profRes] = await Promise.all([
        licIds.length ? supabase.from('licensees').select('id, legal_name, name').in('id', licIds) : Promise.resolve({ data: [] }),
        profIds.length ? supabase.from('profiles').select('id, full_name, email').in('id', profIds) : Promise.resolve({ data: [] }),
      ] as any);
      const lm = new Map<string, string>();
      ((licRes as any).data || []).forEach((l: any) => lm.set(l.id, l.legal_name || l.name || '—'));
      setLicenseeMap(lm);
      const pm = new Map<string, { full_name: string | null; email: string | null }>();
      ((profRes as any).data || []).forEach((p: any) => pm.set(p.id, { full_name: p.full_name, email: p.email }));
      setProfileMap(pm);
    }
    setLoading(false);
  };

  useEffect(() => { loadComplaints(); }, [isInternal, user?.id]);

  const handleCreate = async () => {
    if (!newSubject.trim() || !newDesc.trim() || !user) {
      toast.error('Please fill all fields');
      return;
    }
    setCreating(true);
    const insertData: any = isInternal
      ? {
          subject: newSubject.trim(),
          description: newDesc.trim(),
          email: user.email || null,
          severity: 'medium',
          priority: 'p3',
          status: 'open',
          intake_source: 'internal',
          internal_created_by: user.id,
        }
      : {
          complainant_id: user.id,
          subject: newSubject.trim(),
          description: newDesc.trim(),
          email: user.email,
          severity: newSeverity || 'medium',
        };
    if (newTypeId) insertData.complaint_type_id = newTypeId;
    const { data: inserted, error } = await supabase.from('complaints').insert(insertData).select('id, complaint_number, subject, description, created_at, email').single();
    if (error) {
      toast.error([error.message, error.details, error.hint].filter(Boolean).join(' '));
      setCreating(false);
      return;
    }

    await logAudit({ action: 'complaint_created', entityType: 'complaint', entityId: inserted?.id });

    if (inserted?.id) {
      try {
        const { data: tr, error: trErr } = await supabase.functions.invoke('evaluate-complaint-triage', {
          body: { complaint_id: inserted.id, triggered_by: 'intake' },
        });
        if (trErr || (tr && tr.success === false)) {
          toast.warning(`Complaint filed, but auto-triage failed: ${trErr?.message || tr?.error || 'unknown error'}.`);
        }
      } catch (e: any) {
        toast.warning(`Complaint filed, but auto-triage failed: ${e?.message || 'unknown'}.`);
      }
    }

    if (inserted?.id && newAttachments.length > 0) {
      const r = await attachStagedFilesToComplaint(newAttachments, inserted.id, user.id);
      if (r.failed.length) {
        toast.warning(`Complaint filed. ${r.failed.length} attachment(s) failed to upload.`);
      } else if (r.uploaded) {
        toast.success(`${r.uploaded} attachment(s) uploaded`);
      }
    }

    toast.success('Complaint submitted');
    setNewDialogOpen(false);
    setNewSubject(''); setNewDesc(''); setNewTypeId(''); setNewSeverity('medium'); setNewAttachments([]);
    setCreating(false);
    if (inserted) {
      setAckDialog({
        id: inserted.id,
        complaint_number: (inserted as any).complaint_number,
        subject: (inserted as any).subject,
        submitted_at: (inserted as any).created_at,
        complainant_name: user.fullName ?? user.email ?? null,
        complainant_email: (inserted as any).email ?? user.email ?? null,
        channel: isInternal ? 'staff_intake' : 'consumer_portal',
        sla_days: 20,
        description: (inserted as any).description ?? null,
        attachments: newAttachments.map(f => ({ name: f.name, size: f.size })),
      });
      setAckVariant(isInternal ? 'internal' : 'applicant');
    }
    loadComplaints();
  };

  const handleUpdateStatus = async (complaint: any, newStatus: string) => {
    setUpdating(true);
    const updates: any = { status: newStatus };
    if (newStatus === 'under_investigation') updates.investigator_id = user?.id;
    if (newStatus === 'resolved' && resolution) updates.resolution = resolution;

    const { error } = await supabase.from('complaints').update(updates).eq('id', complaint.id);
    if (error) { toast.error(error.message); setUpdating(false); return; }

    await logAudit({
      action: `complaint_${newStatus}`,
      entityType: 'complaint',
      entityId: complaint.id,
      newValue: { status: newStatus },
    });
    toast.success(`Complaint ${STATUS_LABELS[newStatus]?.toLowerCase() || newStatus}`);
    setUpdating(false);
    setDetailDialog(null);
    setResolution('');
    loadComplaints();
  };

  const reprintAck = (c: any) => {
    const prof = c.complainant_id ? profileMap.get(c.complainant_id) : null;
    setAckDialog({
      id: c.id,
      complaint_number: c.complaint_number,
      subject: c.subject,
      submitted_at: c.created_at,
      complainant_name: prof?.full_name ?? null,
      complainant_email: c.email ?? prof?.email ?? null,
      channel: c.intake_source || null,
      sla_days: c.sla_days ?? 20,
    });
  };

  const retryTriage = async (c: any) => {
    const t = toast.loading('Running auto-triage...');
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-complaint-triage', {
        body: { complaint_id: c.id, triggered_by: 'retry' },
      });
      toast.dismiss(t);
      if (error || (data && data.success === false)) {
        toast.error(`Triage failed: ${error?.message || data?.error || 'unknown'}`);
      } else {
        toast.success('Triage completed');
        await logAudit({ action: 'complaint_triage_retry', entityType: 'complaint', entityId: c.id });
        loadComplaints();
      }
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(`Triage failed: ${e?.message || 'unknown'}`);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const teams = useMemo(
    () => Array.from(new Set(complaints.map(c => c.assigned_team).filter(Boolean))) as string[],
    [complaints],
  );

  const filtered = complaints.filter(c => {
    const sla = computeSlaStatus(c.created_at, c.sla_due_at, c.sla_days, c.resolved_at);
    if (search) {
      const s = search.toLowerCase();
      const hay = [
        c.complaint_number, c.subject, c.email, c.assigned_team,
        c.licensee_id && licenseeMap.get(c.licensee_id),
        c.complaint_type_id && refs.types.get(c.complaint_type_id),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(s)) return false;
    }
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (severityFilter !== 'all' && c.severity !== severityFilter) return false;
    if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
    if (productFilter !== 'all' && c.product_id !== productFilter) return false;
    if (channelFilter !== 'all' && c.channel_id !== channelFilter) return false;
    if (categoryFilter !== 'all' && c.conduct_risk_category_id !== categoryFilter) return false;
    if (intakeFilter !== 'all' && c.intake_source !== intakeFilter) return false;
    if (slaFilter !== 'all' && sla !== slaFilter) return false;
    if (teamFilter !== 'all' && c.assigned_team !== teamFilter) return false;
    if (triageFilter !== 'all' && c.triage_source !== triageFilter) return false;
    if (vulnerableFilter === 'yes' && !c.vulnerability_indicator) return false;
    if (vulnerableFilter === 'no' && c.vulnerability_indicator) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Complaints"
          description={isInternal ? 'Intake, classification, triage & routing' : 'Submit and track your complaints'}
          actions={
            <div className="flex gap-2">
              {isInternal && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Switch id="demo-mode" checked={demoMode} onCheckedChange={(v) => {
                      setDemoMode(v);
                      if (v) setExpandedRows(new Set(filtered.map(f => f.id)));
                      else setExpandedRows(new Set());
                    }} />
                    <Label htmlFor="demo-mode" className="cursor-pointer">Demo evidence view</Label>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/complaints/analytics"><BarChart3 className="h-4 w-4 mr-2" />Analytics</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to="/complaints/new"><PlusCircle className="h-4 w-4 mr-2" />New Complaint</Link>
                  </Button>
                </>
              )}
              {!isInternal && (
                <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><PlusCircle className="h-4 w-4 mr-2" />File Complaint</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Submit a Complaint</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      {complaintTypes.length > 0 && (
                        <div>
                          <Label>Complaint Type</Label>
                          <Select value={newTypeId} onValueChange={setNewTypeId}>
                            <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                            <SelectContent>
                              {complaintTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div><Label>Subject</Label><Input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Brief subject..." /></div>
                      <div><Label>Description</Label><Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Describe the complaint in detail..." rows={5} /></div>
                      <div>
                        <Label>Severity</Label>
                        <Select value={newSeverity} onValueChange={setNewSeverity}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['low','medium','high','critical'].map(s => (
                              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <ComplaintAttachmentsField files={newAttachments} onChange={setNewAttachments} disabled={creating} />
                      <Button onClick={handleCreate} disabled={creating} className="w-full">{creating ? 'Submitting...' : 'Submit Complaint'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          }
        />

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={isInternal ? 'Search # / subject / entity / email / team...' : 'Search complaints...'}
                  className="pl-10" value={search} onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>

              {isInternal && (
                <>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Severity" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severity</SelectItem>
                      {['critical','high','medium','low'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      {['p1','p2','p3','p4'].map(s => <SelectItem key={s} value={s} className="uppercase">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={slaFilter} onValueChange={setSlaFilter}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="SLA" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All SLA</SelectItem>
                      <SelectItem value="on_track">On track</SelectItem>
                      <SelectItem value="at_risk">At risk</SelectItem>
                      <SelectItem value="breached">Breached</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm"><Filter className="h-4 w-4 mr-2" />More filters</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 space-y-3">
                      <div>
                        <Label className="text-xs">Product</Label>
                        <Select value={productFilter} onValueChange={setProductFilter}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Channel</Label>
                        <Select value={channelFilter} onValueChange={setChannelFilter}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {channels.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Conduct risk category</Label>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {categories.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Intake source</Label>
                        <Select value={intakeFilter} onValueChange={setIntakeFilter}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {INTAKE_SOURCES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Assigned team</Label>
                        <Select value={teamFilter} onValueChange={setTeamFilter}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {teams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Triage source</Label>
                        <Select value={triageFilter} onValueChange={setTriageFilter}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {['auto','manual','override'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Vulnerable customer</Label>
                        <Select value={vulnerableFilter} onValueChange={setVulnerableFilter}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !isInternal ? (
              // External: keep original simple layout
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Complaint #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No complaints found</TableCell></TableRow>
                  ) : filtered.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm font-medium">{c.complaint_number}</TableCell>
                      <TableCell className="text-sm">{refs.types.get(c.complaint_type_id) || '—'}</TableCell>
                      <TableCell className="max-w-xs truncate">{c.subject}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[c.status] || 'outline'} className="capitalize">
                          {STATUS_LABELS[c.status] || c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDetailDialog(c)}>
                          <Eye className="h-4 w-4 mr-1" />View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              // Internal: dense classification/triage/routing view
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Complaint / Intake</TableHead>
                    <TableHead>Entity / Complainant</TableHead>
                    <TableHead>Classification</TableHead>
                    <TableHead>Sev / Prio</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>SLA</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No complaints found</TableCell></TableRow>
                  ) : filtered.map(c => {
                    const expanded = expandedRows.has(c.id);
                    const sla = computeSlaStatus(c.created_at, c.sla_due_at, c.sla_days, c.resolved_at);
                    const inv = c.investigator_id ? profileMap.get(c.investigator_id) : null;
                    const entityLabel = c.licensee_id ? licenseeMap.get(c.licensee_id) : null;
                    const complainant = c.complainant_id ? profileMap.get(c.complainant_id) : null;
                    return (
                      <>
                        <TableRow key={c.id} className="align-top">
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleRow(c.id)}>
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-xs font-medium">{c.complaint_number}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[220px]">{c.subject}</div>
                            <Badge variant="outline" className="mt-1 text-[10px] capitalize">
                              {c.intake_source ? c.intake_source.replace(/_/g, ' ') : 'unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="font-medium">{entityLabel || complainant?.full_name || c.email || '—'}</div>
                            <div className="text-muted-foreground">{c.email || complainant?.email || ''}</div>
                            <div className="flex gap-1 mt-1">
                              {c.customer_type && <Badge variant="secondary" className="text-[10px] capitalize">{c.customer_type}</Badge>}
                              {c.vulnerability_indicator && <Badge variant="destructive" className="text-[10px]"><ShieldAlert className="h-3 w-3 mr-0.5" />Vulnerable</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs space-y-0.5">
                            <div>{refs.types.get(c.complaint_type_id) || '—'}</div>
                            <div className="text-muted-foreground">{refs.categories.get(c.conduct_risk_category_id) || '—'}</div>
                            <div className="text-muted-foreground">
                              {refs.products.get(c.product_id) || '—'} · {refs.channels.get(c.channel_id) || '—'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {c.severity && <Badge variant={severityVariant[c.severity] || 'outline'} className="text-[10px] capitalize w-fit">{c.severity}</Badge>}
                              {c.priority && <Badge variant={priorityVariant[c.priority] || 'outline'} className="text-[10px] uppercase w-fit">{c.priority}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{c.assigned_team || '—'}</div>
                            <div className="text-muted-foreground">{inv?.full_name || inv?.email || 'Unassigned'}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={slaStatusVariant(sla)} className="text-[10px]">{slaStatusLabel(sla)}</Badge>
                            {c.sla_due_at && <div className="text-[10px] text-muted-foreground mt-1">Due {new Date(c.sla_due_at).toLocaleDateString()}</div>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[c.status] || 'outline'} className="capitalize text-[10px]">
                              {STATUS_LABELS[c.status] || c.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => nav(`/complaints/${c.id}`)}>
                                  <Eye className="h-4 w-4 mr-2" />Open detail
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => reprintAck(c)}>
                                  <Printer className="h-4 w-4 mr-2" />Reprint acknowledgement
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => retryTriage(c)}>
                                  <RefreshCw className="h-4 w-4 mr-2" />Run / retry triage
                                </DropdownMenuItem>
                                {(c.status === 'submitted' || c.status === 'open') && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleUpdateStatus(c, 'under_investigation')}>
                                      <UserCheck className="h-4 w-4 mr-2" />Take investigation
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow key={c.id + '-exp'}>
                            <TableCell colSpan={9} className="p-0">
                              <ComplaintEvidenceRow
                                complaint={c}
                                refs={refs}
                                onReprintAck={() => reprintAck(c)}
                                onRetryTriage={() => retryTriage(c)}
                              />
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
      </div>

      {/* Detail Dialog (external users only) */}
      <Dialog open={!!detailDialog} onOpenChange={open => { if (!open) setDetailDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Complaint {detailDialog?.complaint_number}</DialogTitle></DialogHeader>
          {detailDialog && (
            <div className="space-y-4">
              {detailDialog.complaint_type_id && (
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <Badge variant="outline">{refs.types.get(detailDialog.complaint_type_id) || 'Unknown'}</Badge>
                </div>
              )}
              <div><p className="text-sm text-muted-foreground">Subject</p><p className="font-medium">{detailDialog.subject}</p></div>
              <div><p className="text-sm text-muted-foreground">Description</p><p className="text-sm">{detailDialog.description}</p></div>
              <div className="flex gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={statusVariant[detailDialog.status]} className="capitalize">{STATUS_LABELS[detailDialog.status] || detailDialog.status}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Filed</p>
                  <p className="text-sm">{new Date(detailDialog.created_at).toLocaleString()}</p>
                </div>
              </div>
              {detailDialog.resolution && (
                <div><p className="text-sm text-muted-foreground">Resolution</p><p className="text-sm">{detailDialog.resolution}</p></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {ackDialog && (
        <ComplaintAcknowledgement
          open={!!ackDialog}
          onOpenChange={(o) => !o && setAckDialog(null)}
          complaint={ackDialog}
        />
      )}
    </DashboardLayout>
  );
}
