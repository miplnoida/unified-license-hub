import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { INTERNAL_ROLES } from '@/types/platform';
import {
  PlusCircle, Search, Eye, Loader2, BarChart3, ChevronDown, ChevronRight,
  MoreHorizontal, Printer, RefreshCw, ShieldAlert, Filter,
  ChevronLeft, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import { ComplaintAcknowledgement, type ComplaintAckInput } from '@/components/complaints/ComplaintAcknowledgement';
import { ComplaintEvidenceRow } from '@/components/complaints/ComplaintEvidenceRow';
import { ComplaintAttachmentsField } from '@/components/complaints/ComplaintAttachmentsField';
import { attachStagedFilesToComplaint } from '@/lib/complaintAttachments';
import { loadComplaintAttachments } from '@/lib/complaintAttachmentsView';

import { getSignedUrl } from '@/lib/secureFileUpload';
import { Paperclip, ExternalLink } from 'lucide-react';
import { slaBucketFromRow, slaStatusLabel, slaStatusVariant, SLA_FILTER_OPTIONS } from '@/lib/complaintsSla';
import { useWorkflowTotalSla } from '@/hooks/useWorkflowTotalSla';
import { TotalSlaBadge } from '@/components/workflows/TotalSlaBadge';
import { DuplicateAlertBanner } from '@/components/complaints/duplicates/DuplicateAlertBanner';
import { EscalationBanner } from '@/components/complaints/escalations/EscalationBanner';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { formatDateTime, formatDateOnly } from '@/lib/datetime';

// Status metadata is centralized in src/lib/complaintStatus.ts. Aliased here to
// keep existing JSX references intact while the module is the single source of
// truth for labels/variants/transitions.
import {
  complaintStatusLabel,
  complaintStatusVariant,
  isOpenComplaint,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_PRIORITIES,
  complaintPriorityLabel,
} from '@/lib/complaintStatus';


const statusVariant = new Proxy({} as Record<string, 'default' | 'secondary' | 'destructive' | 'outline'>, {
  get: (_t, k: string) => complaintStatusVariant(k),
});
const STATUS_LABELS: Record<string, string> = COMPLAINT_STATUS_LABELS;

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


// URL keys are the single source of truth for list state — every change writes
// back to the URL, and every read re-triggers the RPC via useQuery.
const URL_KEYS = [
  'page','pageSize','sort','dir','q',
  'status','severity','priority','sla','type','product','channel','category',
  'intake','team','triage','vulnerable','regulator','from','to',
] as const;
type UrlKey = typeof URL_KEYS[number];

export default function ComplaintsList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const isInternal = !!(user && INTERNAL_ROLES.includes(user.role));

  // --- URL-backed list state ---
  const getParam = (k: UrlKey, d = '') => searchParams.get(k) ?? d;
  const page = Math.max(1, parseInt(getParam('page','1'), 10) || 1);
  const pageSize = [25,50,100].includes(parseInt(getParam('pageSize','25'),10))
    ? parseInt(getParam('pageSize','25'),10) : 25;
  const sortCol = getParam('sort','created_at');
  const sortDir = (getParam('dir','desc') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const search = getParam('q','');
  const statusFilter   = getParam('status','all');
  const severityFilter = getParam('severity','all');
  const priorityFilter = getParam('priority','all');
  const slaFilter      = getParam('sla','all');
  const typeFilter     = getParam('type','all');
  const productFilter  = getParam('product','all');
  const channelFilter  = getParam('channel','all');
  const categoryFilter = getParam('category','all');
  const intakeFilter   = getParam('intake','all');
  const teamFilter     = getParam('team','all');
  const triageFilter   = getParam('triage','all');
  const vulnerableFilter = getParam('vulnerable','all');
  const regulatorFilter = getParam('regulator','all');
  const dateFrom = getParam('from','');
  const dateTo   = getParam('to','');

  const updateUrl = useCallback((patch: Partial<Record<UrlKey,string|null>>, opts?: { resetPage?: boolean }) => {
    const next = new URLSearchParams(searchParams);
    for (const [k,v] of Object.entries(patch)) {
      if (v === null || v === '' || v === 'all') next.delete(k);
      else next.set(k, String(v));
    }
    if (opts?.resetPage) next.delete('page');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Debounced search — write to URL after 300ms of no typing
  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => { setSearchDraft(search); }, [search]);
  const searchTimer = useRef<number | undefined>(undefined);
  const onSearchChange = (v: string) => {
    setSearchDraft(v);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      updateUrl({ q: v }, { resetPage: true });
    }, 300);
  };

  // --- Filters payload built server-side ---
  const filtersPayload = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (statusFilter !== 'all') p.status = statusFilter;
    if (severityFilter !== 'all') p.severity = severityFilter;
    if (priorityFilter !== 'all') p.priority = priorityFilter;
    if (slaFilter !== 'all') p.sla = slaFilter;
    if (typeFilter !== 'all') p.complaint_type_id = typeFilter;
    if (productFilter !== 'all') p.product_id = productFilter;
    if (channelFilter !== 'all') p.channel_id = channelFilter;
    if (categoryFilter !== 'all') p.conduct_risk_category_id = categoryFilter;
    if (intakeFilter !== 'all') p.intake_source = intakeFilter;
    if (teamFilter !== 'all') p.assigned_team = teamFilter;
    if (triageFilter !== 'all') p.triage_override_status = triageFilter;
    if (vulnerableFilter === 'yes') p.vulnerability_indicator = true;
    if (vulnerableFilter === 'no')  p.vulnerability_indicator = false;
    if (regulatorFilter !== 'all') p.regulator_id = regulatorFilter;
    if (dateFrom) p.date_from = new Date(dateFrom).toISOString();
    if (dateTo)   p.date_to   = new Date(dateTo + 'T23:59:59').toISOString();
    return p;
  }, [statusFilter,severityFilter,priorityFilter,slaFilter,typeFilter,productFilter,channelFilter,categoryFilter,intakeFilter,teamFilter,triageFilter,vulnerableFilter,regulatorFilter,dateFrom,dateTo]);

  // --- Reference data queries with explicit error handling ---
  const typesQ = useQuery<RefLookup[]>({
    queryKey: ['complaint_types_ref'],
    queryFn: async () => {
      const { data, error } = await supabase.from('complaint_types').select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return (data as RefLookup[]) ?? [];
    },
    throwOnError: false,
  });
  const categoriesQ = useQuery<RefLookup[]>({
    queryKey: ['conduct_categories_ref'],
    enabled: isInternal,
    queryFn: async () => {
      const { data, error } = await supabase.from('conduct_risk_categories').select('id, name').order('name');
      if (error) throw error;
      return (data as RefLookup[]) ?? [];
    },
  });
  const productsQ = useQuery<RefLookup[]>({
    queryKey: ['conduct_products_ref'],
    enabled: isInternal,
    queryFn: async () => {
      const { data, error } = await supabase.from('conduct_products').select('id, name').order('name');
      if (error) throw error;
      return (data as RefLookup[]) ?? [];
    },
  });
  const channelsQ = useQuery<RefLookup[]>({
    queryKey: ['conduct_channels_ref'],
    enabled: isInternal,
    queryFn: async () => {
      const { data, error } = await supabase.from('conduct_channels').select('id, name').order('name');
      if (error) throw error;
      return (data as RefLookup[]) ?? [];
    },
  });

  const regulatorsQ = useQuery<RefLookup[]>({
    queryKey: ['regulators_ref_complaints'],
    enabled: isInternal,
    queryFn: async () => {
      const { data, error } = await supabase.from('regulators').select('id, name').order('name');
      if (error) throw error;
      return (data as RefLookup[]) ?? [];
    },
  });

  const complaintTypes = typesQ.data ?? [];
  const categories     = categoriesQ.data ?? [];
  const products       = productsQ.data ?? [];
  const channels       = channelsQ.data ?? [];
  const regulators     = regulatorsQ.data ?? [];

  // --- Server-side list query ---
  const listQ = useQuery<{ total: number; rows: any[]; page: number; page_size: number }>({
    queryKey: ['complaints_list', { page, pageSize, sortCol, sortDir, search, filtersPayload, isInternal }],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('list_complaints', {
        _filters: filtersPayload,
        _sort: `${sortCol}.${sortDir}`,
        _page: page,
        _page_size: pageSize,
        _search: search.trim() ? search.trim() : undefined,
      });
      if (error) throw error;
      const payload = (data ?? {}) as any;
      return {
        total: Number(payload.total ?? 0),
        rows: Array.isArray(payload.rows) ? payload.rows : [],
        page: Number(payload.page ?? 1),
        page_size: Number(payload.page_size ?? pageSize),
      };
    },
    placeholderData: (prev) => prev,
    throwOnError: false,
  });

  const complaints = listQ.data?.rows ?? [];
  const totalCount = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const loading = listQ.isLoading || listQ.isFetching;

  // --- Batch resolve licensees + profiles + assignees for the current page only ---
  const enrichmentIds = useMemo(() => {
    const licIds = Array.from(new Set(complaints.map((r: any) => r.licensee_id).filter(Boolean))) as string[];
    const profIds = Array.from(new Set(
      complaints.flatMap((r: any) => [r.investigator_id, r.complainant_id]).filter(Boolean),
    )) as string[];
    const cids = complaints.map((r: any) => r.id) as string[];
    return { licIds, profIds, cids };
  }, [complaints]);

  const licenseesQ = useQuery({
    queryKey: ['complaints_list_licensees', enrichmentIds.licIds],
    enabled: isInternal && enrichmentIds.licIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('licensees').select('id, name').in('id', enrichmentIds.licIds);
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((l: any) => m.set(l.id, l.name || '—'));

      return m;
    },
  });
  const profilesQ = useQuery({
    queryKey: ['complaints_list_profiles', enrichmentIds.profIds],
    enabled: isInternal && enrichmentIds.profIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email').in('id', enrichmentIds.profIds);
      if (error) throw error;
      const m = new Map<string, { full_name: string | null; email: string | null }>();
      (data ?? []).forEach((p: any) => m.set(p.id, { full_name: p.full_name, email: p.email }));
      return m;
    },
  });
  const assigneesQ = useQuery({
    queryKey: ['complaints_list_assignees', enrichmentIds.cids],
    enabled: isInternal && enrichmentIds.cids.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_complaint_current_assignees', { _complaint_ids: enrichmentIds.cids });
      if (error) throw error;
      const m = new Map<string, { role: string | null; users: Array<{ id: string; full_name: string | null; email: string | null }> }>();
      ((data as any[]) ?? []).forEach((row: any) => {
        const existing = m.get(row.complaint_id) || { role: row.step_role || null, users: [] };
        if (row.user_id && !existing.users.find(u => u.id === row.user_id)) {
          existing.users.push({ id: row.user_id, full_name: row.full_name, email: row.email });
        }
        existing.role = existing.role || row.step_role || null;
        m.set(row.complaint_id, existing);
      });
      return m;
    },
  });

  const licenseeMap = licenseesQ.data ?? new Map<string, string>();
  const profileMap  = profilesQ.data  ?? new Map<string, { full_name: string | null; email: string | null }>();
  const assigneesByComplaint = assigneesQ.data ?? new Map<string, { role: string | null; users: Array<{ id: string; full_name: string | null; email: string | null }> }>();

  const refs = useMemo(() => ({
    types: new Map(complaintTypes.map(t => [t.id, t.name])),
    categories: new Map(categories.map(t => [t.id, t.name])),
    products: new Map(products.map(t => [t.id, t.name])),
    channels: new Map(channels.map(t => [t.id, t.name])),
    licensees: licenseeMap,
    profiles: profileMap,
  }), [complaintTypes, categories, products, channels, licenseeMap, profileMap]);

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ['complaints_list'] });
  };

  // --- Local UI state (dialogs, expanded rows, ack, new-complaint form) ---
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [demoMode, setDemoMode] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<any | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<{ id: string; name: string; size?: number; filePath?: string }[]>([]);

  useEffect(() => {
    if (!detailDialog?.id) { setDetailAttachments([]); return; }
    let cancelled = false;
    (async () => {
      const atts = await loadComplaintAttachments(detailDialog.id);
      if (!cancelled) setDetailAttachments(atts);
    })();
    return () => { cancelled = true; };
  }, [detailDialog?.id]);


  const openDetailAttachment = async (filePath?: string) => {
    if (!filePath) return;
    const { url, error } = await getSignedUrl(filePath, 300);
    if (error || !url) { toast.error(error || 'Unable to open file'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };


  const [ackDialog, setAckDialog] = useState<ComplaintAckInput | null>(null);
  const [ackVariant, setAckVariant] = useState<'applicant' | 'internal'>('internal');
  const [newSubject, setNewSubject] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTypeId, setNewTypeId] = useState('');
  
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);

  // Legacy dashboard link support: /complaints?status=open filters to open buckets
  // via the RPC's `_filters.status='open'` handling (already implemented server-side).


  const handleCreate = async () => {
    if (!newSubject.trim() || !newDesc.trim() || !user) {
      toast.error('Please fill all fields');
      return;
    }
    setCreating(true);
    // Canonical intake: server-side create_complaint handles number gen, audit,
    // and trigger-based notifications. No duplicate client-side dispatch here.
    // Severity is never sent: complaint_intake_decide assigns it from triage
    // configuration (matched rule or configured default).
    // `variant` is explicit so the server records ownership correctly:
    // internal = staff-filed (no complainant), licensee = filed by this user.
    const payload: Record<string, unknown> = isInternal
      ? {
          variant: 'internal',
          subject: newSubject.trim(),
          description: newDesc.trim(),
          email: user.email || null,
          priority: 'p3',
          intake_source: 'internal',
        }
      : {
          variant: 'licensee',
          subject: newSubject.trim(),
          description: newDesc.trim(),
          email: user.email,
          intake_source: 'consumer_portal',
        };

    if (newTypeId) payload.complaint_type_id = newTypeId;

    const { data: insertedRaw, error } = await (supabase as any).rpc('create_complaint', { _payload: payload });
    if (error) {
      toast.error([error.message, (error as any).details, (error as any).hint].filter(Boolean).join(' '));
      setCreating(false);
      return;
    }
    const inserted = insertedRaw as any;

    // Triage is enqueued server-side via trg_complaint_triage_enqueue; no
    // client-side edge invoke here (prevents duplicate triage runs).




    let uploadedAttachments: { name: string; size: number; fileUploadId: string; filePath: string }[] = [];
    if (inserted?.id && newAttachments.length > 0) {
      const r = await attachStagedFilesToComplaint(newAttachments, inserted.id, user.id);
      uploadedAttachments = r.attachments;
      if (r.failed.length) {
        toast.error(
          `Complaint filed, but ${r.failed.length} attachment(s) could not be attached: ` +
            r.failed.map(f => `${f.name} (${f.error})`).join('; '),
          { duration: 10000 },
        );
      } else if (r.uploaded) {
        toast.success(`${r.uploaded} attachment(s) uploaded`);
      }
    }

    toast.success('Complaint submitted');
    setNewDialogOpen(false);
    setNewSubject(''); setNewDesc(''); setNewTypeId(''); setNewAttachments([]);
    setCreating(false);
    if (inserted) {
      // create_complaint returns { id, complaint_number, workflow_instance_id, complaint: <row> }.
      // Read the record fields from `complaint`, falling back to the top level.
      const row = ((inserted as any).complaint ?? inserted) as any;
      setAckDialog({
        id: inserted.id,
        complaint_number: (inserted as any).complaint_number ?? row.complaint_number,
        subject: row.subject ?? newSubject.trim(),
        submitted_at: row.created_at ?? new Date().toISOString(),
        complainant_name: user.fullName ?? user.email ?? null,
        complainant_email: row.email ?? user.email ?? null,
        channel: row.intake_source ?? (isInternal ? 'internal' : 'consumer_portal'),
        sla_days: row.sla_days ?? null,
        description: row.description ?? null,
        attachments: uploadedAttachments.map(a => ({
          name: a.name, size: a.size, filePath: a.filePath, fileUploadId: a.fileUploadId,
        })),
      });
      setAckVariant(isInternal ? 'internal' : 'applicant');
    }

    refetchAll();
  };

  const handleUpdateStatus = async (complaint: any, newStatus: string) => {
    try {
      if (newStatus === 'under_investigation') {
        const { error } = await (supabase as any).rpc('start_complaint_investigation', {
          _id: complaint.id,
          _expected_updated_at: complaint.updated_at,
        });
        if (error) throw error;
        toast.success('Investigation started');
        setDetailDialog(null);
        refetchAll();
      } else if (newStatus === 'resolved' || newStatus === 'closed') {
        // Resolution/closure require reason + category; enforce via the detail page.
        toast.info('Open the complaint to add resolution notes and close it.');
        nav(`/complaints/${complaint.id}`);
      } else {
        throw new Error(`Unsupported status transition: ${newStatus}`);
      }
    } catch (e: any) {
      const msg = e?.message || 'Update failed';
      if (msg.includes('complaint_stale')) {
        toast.error('Someone else updated this complaint. Please reload.');
      } else {
        toast.error(msg);
      }
    }
  };

  const reprintAck = async (c: any) => {
    const prof = c.complainant_id ? profileMap.get(c.complainant_id) : null;

    // Fetch linked evidence + any unlinked complaint uploads for preview
    const loaded = await loadComplaintAttachments(c.id);
    const atts: { name: string; size?: number; filePath?: string; fileUploadId?: string }[] =
      loaded.map(a => ({ name: a.name, size: a.size, filePath: a.filePath, fileUploadId: a.id }));


    setAckDialog({
      id: c.id,
      complaint_number: c.complaint_number,
      subject: c.subject,
      submitted_at: c.created_at,
      complainant_name: prof?.full_name ?? null,
      complainant_email: c.email ?? prof?.email ?? null,
      channel: c.intake_source || null,
      sla_days: c.sla_days ?? null,
      description: c.description ?? null,
      attachments: atts,
    });
    setAckVariant(isInternal ? 'internal' : 'applicant');
  };

  const retryTriage = async (c: any) => {
    const t = toast.loading('Queuing auto-triage...');
    try {
      // Permission-checked, audited server-side. The RPC only marks the row
      // for reprocessing; the edge scheduler picks it up.
      const { error } = await (supabase as any).rpc('retry_complaint_triage', { _id: c.id });
      toast.dismiss(t);
      if (error) {
        toast.error(`Triage failed: ${error.message}`);
      } else {
        toast.success('Triage requested');
        refetchAll();
      }
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(`Triage failed: ${e?.message || 'unknown'}`);
    }
  };


  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const teams = useMemo(
    () => Array.from(new Set(complaints.map(c => c.assigned_team).filter(Boolean))) as string[],
    [complaints],
  );

  // Filtering + search + sort + pagination are all server-side now.
  // `complaints` is already the paginated slice — no local filtering.
  const filtered = complaints;

  const filteredIds = useMemo(() => filtered.map(c => c.id), [filtered]);
  const { byEntityId: totalSlaByComplaint } = useWorkflowTotalSla({
    entityType: 'complaint',
    entityIds: filteredIds,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Complaints"
          helpSurface="complaints"
          description={isInternal ? 'Intake, classification, triage & routing' : 'Submit and track your complaints'}
          actions={
            <div className="flex gap-2">
              {isInternal && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Switch id="expand-evidence" checked={demoMode} onCheckedChange={(v) => {
                      setDemoMode(v);
                      // Only expand the currently paginated rows — avoids an
                      // unbounded fan-out of evidence queries on large lists.
                      if (v) setExpandedRows(new Set(filtered.map(f => f.id)));
                      else setExpandedRows(new Set());
                    }} />
                    <Label htmlFor="expand-evidence" className="cursor-pointer">Expand evidence summaries</Label>
                  </div>

                  <Button data-rbac="complaint_management.view" variant="outline" size="sm" asChild>
                    <Link to="/complaints/analytics"><BarChart3 className="h-4 w-4 mr-2" />Analytics</Link>
                  </Button>
                  <Button data-rbac="complaint_management.create" variant="outline" size="sm" asChild>
                    <Link to="/complaints/bulk-intake">Bulk intake</Link>
                  </Button>
                  <Button data-rbac="complaint_management.create" size="sm" asChild>
                    <Link to="/complaints/internal/new"><PlusCircle className="h-4 w-4 mr-2" />New Complaint</Link>
                  </Button>
                </>
              )}
              {!isInternal && (
                <Button variant="outline" asChild>
                  <Link to="/complaints/track"><Search className="h-4 w-4 mr-2" />Track Complaint</Link>
                </Button>
              )}
              {!isInternal && (
                <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-rbac="complaint_management.create"><PlusCircle className="h-4 w-4 mr-2" />File Complaint</Button>
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

                      <ComplaintAttachmentsField files={newAttachments} onChange={setNewAttachments} disabled={creating} />
                      <Button onClick={handleCreate} disabled={creating} className="w-full">{creating ? 'Submitting...' : 'Submit Complaint'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          }
        />

        {isInternal && <EscalationBanner />}
        {isInternal && <DuplicateAlertBanner />}


        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={isInternal ? 'Search # / subject / entity / email / team...' : 'Search complaints...'}
                  className="pl-10" value={searchDraft} onChange={e => onSearchChange(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => updateUrl({ status: v }, { resetPage: true })}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>

              {isInternal && (
                <>
                  <Select value={severityFilter} onValueChange={(v) => updateUrl({ severity: v }, { resetPage: true })}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Severity" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severity</SelectItem>
                      {['critical','high','medium','low'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={priorityFilter} onValueChange={(v) => updateUrl({ priority: v }, { resetPage: true })}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      {COMPLAINT_PRIORITIES.map(s => <SelectItem key={s} value={s}>{complaintPriorityLabel(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={slaFilter} onValueChange={(v) => updateUrl({ sla: v }, { resetPage: true })}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="SLA" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All SLA</SelectItem>
                      {SLA_FILTER_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm"><Filter className="h-4 w-4 mr-2" />More filters</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 space-y-3">
                      <div>
                        <Label className="text-xs">Product</Label>
                        <Select value={productFilter} onValueChange={(v) => updateUrl({ product: v }, { resetPage: true })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Channel</Label>
                        <Select value={channelFilter} onValueChange={(v) => updateUrl({ channel: v }, { resetPage: true })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {channels.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Conduct risk category</Label>
                        <Select value={categoryFilter} onValueChange={(v) => updateUrl({ category: v }, { resetPage: true })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {categories.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Intake source</Label>
                        <Select value={intakeFilter} onValueChange={(v) => updateUrl({ intake: v }, { resetPage: true })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {INTAKE_SOURCES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Assigned team</Label>
                        <Select value={teamFilter} onValueChange={(v) => updateUrl({ team: v }, { resetPage: true })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {teams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Triage source</Label>
                        <Select value={triageFilter} onValueChange={(v) => updateUrl({ triage: v }, { resetPage: true })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {['auto','manual','override'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Vulnerable customer</Label>
                        <Select value={vulnerableFilter} onValueChange={(v) => updateUrl({ vulnerable: v }, { resetPage: true })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Regulator</Label>
                        <Select value={regulatorFilter} onValueChange={(v) => updateUrl({ regulator: v }, { resetPage: true })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {regulators.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Created from</Label>
                          <Input type="date" value={dateFrom} onChange={e => updateUrl({ from: e.target.value || null }, { resetPage: true })} />
                        </div>
                        <div>
                          <Label className="text-xs">Created to</Label>
                          <Input type="date" value={dateTo} onChange={e => updateUrl({ to: e.target.value || null }, { resetPage: true })} />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {listQ.isError && (
          <QueryErrorState
            title="Failed to load complaints"
            error={listQ.error}
            onRetry={() => listQ.refetch()}
          />
        )}

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading && complaints.length === 0 ? (
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
                    <TableHead>SLA</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No complaints found</TableCell></TableRow>
                  ) : filtered.map(c => {
                    const sla = slaBucketFromRow(c);
                    return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm font-medium">{c.complaint_number}</TableCell>
                      <TableCell className="text-sm">{refs.types.get(c.complaint_type_id) || '—'}</TableCell>
                      <TableCell className="max-w-xs truncate">{c.subject}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[c.status] || 'outline'} className="capitalize">
                          {STATUS_LABELS[c.status] || c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={slaStatusVariant(sla)} className="text-[10px] w-fit">{slaStatusLabel(sla)}</Badge>
                          {c.sla_due_at && <div className="text-[10px] text-muted-foreground">Due {formatDateOnly(c.sla_due_at)}</div>}
                          <TotalSlaBadge entry={totalSlaByComplaint.get(c.id)} />
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(c.created_at)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setDetailDialog(c)}>
                          <Eye className="h-4 w-4 mr-1" />View
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/complaints/track/${encodeURIComponent(c.complaint_number)}`}>
                            <Search className="h-4 w-4 mr-1" />Track
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
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
                    const sla = slaBucketFromRow(c);
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
                            {c.conduct_risk_category_id && (
                              <div className="text-muted-foreground">{refs.categories.get(c.conduct_risk_category_id)}</div>
                            )}
                            {(c.product_id || c.channel_id) && (
                              <div className="text-muted-foreground">
                                {refs.products.get(c.product_id) || '—'} · {refs.channels.get(c.channel_id) || '—'}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {c.severity && <Badge variant={severityVariant[c.severity] || 'outline'} className="text-[10px] capitalize w-fit">{c.severity}</Badge>}
                              {c.priority && <Badge variant={priorityVariant[c.priority] || 'outline'} className="text-[10px] w-fit">{complaintPriorityLabel(c.priority)}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {(() => {
                              const asg = assigneesByComplaint.get(c.id);
                              const roleLabel = asg?.role || c.assigned_team || '—';
                              const users = asg?.users || [];
                              const names = users.map(u => u.full_name || u.email || 'User');
                              return (
                                <>
                                  <div className="capitalize">{roleLabel.replace(/_/g, ' ')}</div>
                                  <div className="text-muted-foreground">
                                    {names.length === 0
                                      ? (inv?.full_name || inv?.email || 'Unassigned')
                                      : names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '')}
                                  </div>
                                </>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant={slaStatusVariant(sla)} className="text-[10px] w-fit">{slaStatusLabel(sla)}</Badge>
                              {c.sla_due_at && <div className="text-[10px] text-muted-foreground">Due {formatDateOnly(c.sla_due_at)}</div>}
                              <TotalSlaBadge entry={totalSlaByComplaint.get(c.id)} />
                            </div>
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
                                <DropdownMenuItem data-rbac="complaint_management.view" onClick={() => reprintAck(c)}>
                                  <Printer className="h-4 w-4 mr-2" />Reprint acknowledgement
                                </DropdownMenuItem>
                                <DropdownMenuItem data-rbac="complaint_management.edit" onClick={() => retryTriage(c)}>
                                  <RefreshCw className="h-4 w-4 mr-2" />Run / retry triage
                                </DropdownMenuItem>
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

        {/* Server-side pagination footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
          <div className="text-xs text-muted-foreground">
            {totalCount === 0
              ? 'No results'
              : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}
            {listQ.isFetching && complaints.length > 0 && <span className="ml-2 inline-flex items-center"><Loader2 className="h-3 w-3 animate-spin mr-1" />refreshing…</span>}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Rows</Label>
            <Select value={String(pageSize)} onValueChange={(v) => updateUrl({ pageSize: v }, { resetPage: true })}>
              <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1}
              onClick={() => updateUrl({ page: '1' })}><ChevronsLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1}
              onClick={() => updateUrl({ page: String(page - 1) })}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-xs tabular-nums px-2">{page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages}
              onClick={() => updateUrl({ page: String(page + 1) })}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages}
              onClick={() => updateUrl({ page: String(totalPages) })}><ChevronsRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>



      {/* Detail Dialog (external users only) */}
      <Dialog open={!!detailDialog} onOpenChange={open => { if (!open) { setDetailDialog(null); setDetailAttachments([]); } }}>
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
                  <p className="text-sm">{formatDateTime(detailDialog.created_at)}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                  <Paperclip className="h-3.5 w-3.5" />Attachments {detailAttachments.length > 0 && <span>({detailAttachments.length})</span>}
                </p>
                {detailAttachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No attachments</p>
                ) : (
                  <ul className="divide-y border rounded-md">
                    {detailAttachments.map(a => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.name}</p>
                          {a.size ? <p className="text-xs text-muted-foreground">{a.size < 1024 ? `${a.size} B` : a.size < 1024 * 1024 ? `${(a.size / 1024).toFixed(1)} KB` : `${(a.size / (1024 * 1024)).toFixed(1)} MB`}</p> : null}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openDetailAttachment(a.filePath)} disabled={!a.filePath}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />View
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
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
          variant={ackVariant}
        />
      )}

    </DashboardLayout>
  );
}
