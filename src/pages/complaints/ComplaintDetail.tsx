import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logAction } from '@/hooks/useAuditLog';
import { ArrowLeft, Loader2, Gavel, CheckCircle2, XCircle, UserCheck, AlertTriangle, Printer, Paperclip, ExternalLink, Building2, Check, ChevronsUpDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { getSignedUrl } from '@/lib/secureFileUpload';
import { ComplaintAcknowledgement, type ComplaintAckInput } from '@/components/complaints/ComplaintAcknowledgement';
import { slaBucketFromRow, slaStatusLabel, slaStatusVariant } from '@/lib/complaintsSla';
import ComplaintInvestigationTab from '@/components/complaints/ComplaintInvestigationTab';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { ConductClassificationCard } from '@/components/complaints/ConductClassificationCard';
import { TriageHistoryCard } from '@/components/complaints/TriageHistoryCard';
import { DecisionGatesBanner } from '@/components/decision-gates/DecisionGatesBanner';
import { useWorkflowTotalSla } from '@/hooks/useWorkflowTotalSla';
import { TotalSlaBadge } from '@/components/workflows/TotalSlaBadge';
import { CollaborativeReview } from '@/components/collab-review/CollaborativeReview';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { ComplaintTrackingTimeline } from '@/components/complaints/ComplaintTrackingTimeline';
import { notifyComplaintLifecycle } from '@/lib/complaintNotifications';

const STATUS_META: Record<string, { label: string; variant: any }> = {
  submitted: { label: 'Submitted', variant: 'default' },
  under_investigation: { label: 'Under Investigation', variant: 'outline' },
  resolved: { label: 'Resolved', variant: 'default' },
  closed: { label: 'Closed', variant: 'secondary' },
};

const SEVERITY_META: Record<string, { label: string; variant: any }> = {
  low: { label: 'Low', variant: 'outline' },
  medium: { label: 'Medium', variant: 'secondary' },
  high: { label: 'High', variant: 'default' },
  critical: { label: 'Critical', variant: 'destructive' },
};

export default function ComplaintDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [resolution, setResolution] = useState('');
  const [severity, setSeverity] = useState<string>('');
  const [escalateNote, setEscalateNote] = useState('');
  const [severityOverride, setSeverityOverride] = useState<null | { from: string; to: string }>(null);
  const [ackOpen, setAckOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeCategory, setCloseCategory] = useState<string>('resolved_at_source');
  const [licPickerOpen, setLicPickerOpen] = useState(false);
  const [licSearch, setLicSearch] = useState('');
  const [stagedLicensee, setStagedLicensee] = useState<{ id: string; name: string; license_number?: string | null } | null>(null);

  const complaintQ = useQuery({
    queryKey: ['complaint', id],
    enabled: !!id,
    queryFn: async () => {
      // get_complaint RPC returns the row + server-computed sla_status,
      // scoped by has_complaint_perm / complainant_id.
      const { data, error } = await (supabase as any).rpc('get_complaint', { _id: id });
      if (error) throw error;
      return data as any;
    },
  });
  const complaint = complaintQ.data;
  const isLoading = complaintQ.isLoading;

  const complainantQ = useQuery({
    queryKey: ['complaint_complainant', complaint?.complainant_id],
    enabled: !!complaint?.complainant_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('full_name, email, user_type')
        .eq('id', complaint!.complainant_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const complainant = complainantQ.data;

  const complaintTypeQ = useQuery({
    queryKey: ['complaint_type', complaint?.complaint_type_id],
    enabled: !!complaint?.complaint_type_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('complaint_types')
        .select('name, sla_days')
        .eq('id', complaint!.complaint_type_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const complaintType = complaintTypeQ.data;

  const enforcementQ = useQuery({
    queryKey: ['complaint_enforcement', complaint?.enforcement_action_id],
    enabled: !!complaint?.enforcement_action_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('enforcement_actions')
        .select('id, case_number, status')
        .eq('id', complaint!.enforcement_action_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const enforcement = enforcementQ.data;

  const attachmentsQ = useQuery({
    queryKey: ['complaint_attachments', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_evidence' as any)
        .select('id, label, created_at, file_upload_id, file_uploads(file_name, file_path, file_size, mime_type)')
        .eq('complaint_id', id!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const attachments = attachmentsQ.data ?? [];

  async function openAttachment(filePath?: string) {
    if (!filePath) return;
    const { url, error } = await getSignedUrl(filePath, 300);
    if (error || !url) { toast.error(error || 'Unable to open file'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function formatSize(n?: number | null) {
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ['complaint', id] });

  const takeInvestigation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc('start_complaint_investigation', {
        _id: id!,
        _expected_updated_at: complaint?.updated_at ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Investigation started');
      notifyComplaintLifecycle({
        event_key: 'complaint.investigation_started',
        complaint_id: id!,
        complaint_number: complaint?.complaint_number,
        complainant_id: complaint?.complainant_id,
        licensee_id: complaint?.licensee_id,
        sector_id: complaint?.sector_id,
        regulator_id: complaint?.regulator_id,
      });
      invalidate();
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? '');
      if (msg.includes('complaint_stale')) {
        toast.error('This complaint was updated by another user. Reload before continuing.');
      } else {
        toast.error(msg);
      }
      invalidate();
    },
  });



  // Optimistic concurrency: every mutation carries the updated_at we loaded, so
  // the RPC raises `complaint_stale` if another user modified the row.
  const handleMutationError = (e: any) => {
    const msg = String(e?.message ?? '');
    if (msg.includes('complaint_stale')) {
      toast.error('This complaint was updated by another user. Reload before continuing.');
    } else {
      toast.error(msg || 'Update failed');
    }
    invalidate();
  };

  const setSeverityMut = useMutation({
    mutationFn: async (opts?: { reason?: string }) => {
      if (!severity) throw new Error('Pick a severity');
      const current = complaint?.severity ?? null;
      const changed = current && current !== severity;
      const args: Record<string, unknown> = {
        _id: id!,
        _severity: severity,
        _expected_updated_at: complaint?.updated_at ?? null,
      };
      // Only pass _reason when a genuine reason exists (avoid null literals).
      if (changed && opts?.reason) args._reason = opts.reason;
      const { error } = await (supabase as any).rpc('update_complaint_severity', args);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Severity updated'); setSeverity(''); invalidate(); },
    onError: handleMutationError,
  });

  // Applies the severity change ONLY after the override is logged.
  async function applySeverityChange(next: string, from: string, reason: string) {
    const { error } = await (supabase as any).rpc('update_complaint_severity', {
      _id: id!, _severity: next, _reason: reason,
      _expected_updated_at: complaint?.updated_at ?? null,
    });
    if (error) { handleMutationError(error); return; }
    toast.success('Severity overridden');
    setSeverity('');
    invalidate();
  }

  function handleSeverityUpdate() {
    if (!severity) { toast.error('Pick a severity'); return; }
    const current = complaint?.severity;
    if (!current || current === severity) {
      setSeverityMut.mutate({});
      return;
    }
    setSeverityOverride({ from: current, to: severity });
  }

  const resolve = useMutation({
    mutationFn: async () => {
      if (resolution.trim().length < 5) throw new Error('Resolution notes required');
      const { error } = await (supabase as any).rpc('resolve_complaint', {
        _id: id!, _resolution: resolution.trim(),
        _expected_updated_at: complaint?.updated_at ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Complaint resolved');
      notifyComplaintLifecycle({
        event_key: 'complaint.resolved',
        complaint_id: id!,
        complaint_number: complaint?.complaint_number,
        complainant_id: complaint?.complainant_id,
        licensee_id: complaint?.licensee_id,
        sector_id: complaint?.sector_id,
        regulator_id: complaint?.regulator_id,
        note: resolution.trim(),
      });
      setResolution('');
      invalidate();
    },
  });

  const CLOSURE_CATEGORIES = ['resolved_at_source','withdrawn','duplicate','out_of_scope','no_action_required','referred_out'] as const;

  const close = useMutation({
    mutationFn: async () => {
      const reason = closeReason.trim();
      const category = (closeCategory || '').trim();
      if (reason.length < 5) throw new Error('Closure reason required (min 5 chars)');
      if (!category || !CLOSURE_CATEGORIES.includes(category as any)) {
        throw new Error('Closure category is required');
      }
      const { error } = await (supabase as any).rpc('close_complaint', {
        _id: id!, _reason: reason, _category: category,
        _expected_updated_at: complaint?.updated_at ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Complaint closed');
      setCloseOpen(false); setCloseReason(''); invalidate();
    },
    onError: handleMutationError,
  });

  const escalate = useMutation({
    mutationFn: async () => {
      if (!complaint?.licensee_id) throw new Error('Link a licensee before escalating.');
      if (escalateNote.trim().length < 10) throw new Error('Provide findings (min 10 chars)');
      const { data, error } = await (supabase as any).rpc('escalate_complaint_to_enforcement', {
        _id: id!, _findings: escalateNote.trim(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('Escalation failed');
      return { id: row.enforcement_id, case_number: row.case_number };
    },
    onSuccess: (row) => {
      toast.success(`Enforcement case ${row.case_number} opened`);
      setEscalateNote('');
      invalidate();
      nav(`/enforcement/${row.id}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const licenseeSearchQ = useQuery({
    queryKey: ['licensee_search_for_complaint', licSearch],
    enabled: licPickerOpen,
    queryFn: async () => {
      const term = licSearch.trim();
      let q = supabase
        .from('licensees')
        .select('id, name, license_id, licenses:license_id(license_number)')
        .order('name')
        .limit(20);
      if (term) q = q.ilike('name', `%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []).map((l: any) => ({
        id: l.id,
        name: l.name,
        license_number: l.licenses?.license_number ?? null,
      }));
      return term
        ? rows.filter(r =>
            r.name?.toLowerCase().includes(term.toLowerCase()) ||
            r.license_number?.toLowerCase().includes(term.toLowerCase()),
          )
        : rows;
    },
  });

  const linkedLicenseeQ = useQuery({
    queryKey: ['complaint_linked_licensee', complaint?.licensee_id],
    enabled: !!complaint?.licensee_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('licensees')
        .select('id, name, license_id, licenses:license_id(license_number)')
        .eq('id', complaint!.licensee_id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: (data as any).id,
        name: (data as any).name,
        license_number: (data as any).licenses?.license_number ?? null,
      };
    },
  });


  const linkLicensee = useMutation({
    mutationFn: async () => {
      if (!stagedLicensee) throw new Error('Select a licensee first');
      const { error } = await (supabase as any).rpc('link_complaint_licensee', {
        _complaint_id: id!,
        _licensee_id: stagedLicensee.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Licensee linked');
      setStagedLicensee(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to link licensee'),
  });

  if (isLoading) return <DashboardLayout><div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div></DashboardLayout>;
  if (complaintQ.isError) return <DashboardLayout><div className="p-8"><QueryErrorState title="Failed to load complaint" error={complaintQ.error} onRetry={() => complaintQ.refetch()} /></div></DashboardLayout>;
  if (!complaint) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Complaint not found.</div></DashboardLayout>;

  const statusMeta = STATUS_META[complaint.status] || { label: complaint.status, variant: 'outline' };
  const sevMeta = SEVERITY_META[complaint.severity] || { label: complaint.severity, variant: 'outline' };
  const slaDays = complaint.sla_days || complaintType?.sla_days || 30;
  const _openDays = Math.floor((Date.now() - new Date(complaint.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const displayDaysOpen = complaint.resolved_at
    ? Math.floor((new Date(complaint.resolved_at).getTime() - new Date(complaint.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : _openDays;
  // Canonical SLA — server-computed when available (list_complaints/get_complaint
  // return sla_status); JS helper is fallback for optimistic UI.
  const slaStatus = slaBucketFromRow(complaint);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Complaint ${complaint.complaint_number}`}
          description={complaint.subject}
          actions={
            <div className="flex items-center gap-2">
              <HistoryButton entityType="complaint" entityId={complaint.id} title={`History — ${complaint.complaint_number}`} />
              <Button variant="outline" size="sm" onClick={() => setAckOpen(true)}>
                <Printer className="h-4 w-4 mr-2" />Reprint acknowledgement
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/complaints"><ArrowLeft className="h-4 w-4 mr-2" />Back to Complaints</Link>
              </Button>
            </div>
          }
        />

        <DecisionGatesBanner subjectType="complaint" subjectId={complaint.id} compact />

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Status</p><Badge variant={statusMeta.variant} className="mt-1">{statusMeta.label}</Badge></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Severity</p><Badge variant={sevMeta.variant} className="mt-1">{sevMeta.label}</Badge></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Days Open</p><p className="text-2xl font-semibold">{displayDaysOpen}<span className="text-xs text-muted-foreground ml-1">/ {slaDays}</span></p></CardContent></Card>
          <Card><CardContent className="pt-6 space-y-2"><p className="text-xs text-muted-foreground">SLA</p>
            <Badge variant={slaStatusVariant(slaStatus)} className="capitalize">{slaStatusLabel(slaStatus)}</Badge>
            <ComplaintTotalSla complaintId={complaint.id} />
          </CardContent></Card>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="investigation">Investigation</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Type</p>
                  {complaintTypeQ.isError ? (
                    <QueryErrorState compact message="Failed to load complaint type" onRetry={() => complaintTypeQ.refetch()} />
                  ) : (
                    <p>{complaintType?.name || '—'}</p>
                  )}
                </div>
                <div><p className="text-muted-foreground">Description</p><p className="whitespace-pre-wrap">{complaint.description}</p></div>
                {complaint.resolution && <div><p className="text-muted-foreground">Resolution</p><p className="whitespace-pre-wrap">{complaint.resolution}</p></div>}
                {complaint.enforcement_action_id && (
                  <div>
                    <p className="text-muted-foreground">Linked Enforcement</p>
                    {enforcementQ.isError ? (
                      <QueryErrorState compact message="Failed to load enforcement case" onRetry={() => enforcementQ.refetch()} />
                    ) : enforcement ? (
                      <Link to={`/enforcement/${enforcement.id}`} className="text-primary underline">{enforcement.case_number} ({enforcement.status})</Link>
                    ) : (
                      <p className="text-muted-foreground">—</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Complainant</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm md:grid-cols-3">
                {complainantQ.isError ? (
                  <div className="md:col-span-3">
                    <QueryErrorState compact message="Failed to load complainant profile" onRetry={() => complainantQ.refetch()} />
                  </div>
                ) : (
                  <>
                    <div><p className="text-muted-foreground">Name</p><p>{complainant?.full_name || '—'}</p></div>
                    <div><p className="text-muted-foreground">Email</p><p>{complaint.email || complainant?.email || '—'}</p></div>
                    <div><p className="text-muted-foreground">User Type</p><p className="capitalize">{complainant?.user_type || '—'}</p></div>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Paperclip className="h-4 w-4" />Attachments {attachments.length > 0 && <span className="text-xs text-muted-foreground font-normal">({attachments.length})</span>}</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {attachmentsQ.isError ? (
                  <QueryErrorState message="Failed to load attachments" onRetry={() => attachmentsQ.refetch()} />
                ) : attachments.length === 0 ? (
                  <p className="text-muted-foreground">No attachments uploaded with this complaint.</p>
                ) : (
                  <ul className="divide-y">
                    {attachments.map((a: any) => {
                      const f = a.file_uploads || {};
                      const name = f.file_name || a.label || 'Attachment';
                      return (
                        <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatSize(f.file_size)}{f.file_size ? ' • ' : ''}
                              {new Date(a.created_at).toLocaleString()}
                            </p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => openAttachment(f.file_path)} disabled={!f.file_path}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />View
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
            <ConductClassificationCard complaint={complaint} />
            <TriageHistoryCard complaint={complaint} />
          </TabsContent>

          <TabsContent value="investigation">
            <ComplaintInvestigationTab complaintId={id!} complaintStatus={complaint.status} />
          </TabsContent>

          <TabsContent value="actions" className="space-y-4">
            {complaint.status === 'closed' ? (
              <Card><CardContent className="pt-6 text-sm text-muted-foreground">This complaint is closed; no further actions can be taken.</CardContent></Card>
            ) : (
              <>
                <Card>
                  <CardHeader><CardTitle className="text-base">Triage</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label>Severity</Label>
                        <Select value={severity || complaint.severity} onValueChange={setSeverity}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(SEVERITY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleSeverityUpdate} disabled={setSeverityMut.isPending || !severity}>Update</Button>
                    </div>
                    {complaint.status === 'submitted' && (
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => takeInvestigation.mutate()} disabled={takeInvestigation.isPending}>
                          <UserCheck className="h-4 w-4 mr-2" />Take Investigation
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {complaint.status === 'under_investigation' && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Resolve</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea rows={3} placeholder="Resolution notes…" value={resolution} onChange={e => setResolution(e.target.value)} />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setCloseOpen(true)}><XCircle className="h-4 w-4 mr-2" />Close</Button>
                        <Button size="sm" onClick={() => resolve.mutate()} disabled={resolve.isPending}><CheckCircle2 className="h-4 w-4 mr-2" />Mark Resolved</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {complaint.status === 'resolved' && (
                  <Card><CardContent className="pt-6 flex justify-end"><Button size="sm" variant="outline" onClick={() => setCloseOpen(true)}><XCircle className="h-4 w-4 mr-2" />Close Complaint</Button></CardContent></Card>
                )}

                {!complaint.enforcement_action_id && (
                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gavel className="h-4 w-4" /> Escalate to Enforcement</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {complaint.licensee_id ? (
                        <div className="rounded-md border bg-muted/40 p-3 text-xs flex items-start gap-2">
                          <Building2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {linkedLicenseeQ.data?.name || 'Licensee'}
                            </div>
                            {linkedLicenseeQ.data?.license_number && (
                              <div className="text-muted-foreground font-mono">{linkedLicenseeQ.data.license_number}</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label className="text-xs">Map to Licensee</Label>
                          <Popover open={licPickerOpen} onOpenChange={setLicPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" role="combobox" aria-expanded={licPickerOpen} className="w-full justify-between font-normal">
                                <span className="truncate">
                                  {stagedLicensee ? stagedLicensee.name : 'Search licensee by name or license #'}
                                </span>
                                <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                              <Command shouldFilter={false}>
                                <CommandInput placeholder="Search licensees…" value={licSearch} onValueChange={setLicSearch} />
                                <CommandList>
                                  {licenseeSearchQ.isLoading ? (
                                    <div className="py-6 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-1" />Searching…</div>
                                  ) : (licenseeSearchQ.data ?? []).length === 0 ? (
                                    <CommandEmpty>No licensees found.</CommandEmpty>
                                  ) : (
                                    <CommandGroup>
                                      {(licenseeSearchQ.data ?? []).map((l: any) => (
                                        <CommandItem
                                          key={l.id}
                                          value={l.id}
                                          onSelect={() => {
                                            setStagedLicensee({ id: l.id, name: l.name, license_number: l.license_number });
                                            setLicPickerOpen(false);
                                          }}
                                        >
                                          <Check className={cn('h-4 w-4 mr-2', stagedLicensee?.id === l.id ? 'opacity-100' : 'opacity-0')} />
                                          <div className="flex-1 min-w-0">
                                            <div className="truncate">{l.name}</div>
                                            {l.license_number && <div className="text-[10px] text-muted-foreground font-mono">{l.license_number}</div>}
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  )}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!stagedLicensee || linkLicensee.isPending}
                              onClick={() => linkLicensee.mutate()}
                            >
                              {linkLicensee.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Building2 className="h-4 w-4 mr-2" />}
                              Link Licensee
                            </Button>
                          </div>
                          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] flex gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span>A licensee must be linked before this complaint can be escalated to enforcement.</span>
                          </div>
                        </div>
                      )}
                      <Textarea rows={3} placeholder="Findings that justify enforcement…" value={escalateNote} onChange={e => setEscalateNote(e.target.value)} disabled={!complaint.licensee_id} />
                      <div className="flex justify-end">
                        <Button size="sm" variant="destructive" onClick={() => escalate.mutate()} disabled={escalate.isPending || !complaint.licensee_id}>
                          <Gavel className="h-4 w-4 mr-2" />Open Enforcement Case
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {severityOverride && complaint && (
          <OverrideReasonDialog
            open={!!severityOverride}
            onOpenChange={(o) => { if (!o) setSeverityOverride(null); }}
            module="complaints"
            entityType="complaint"
            entityId={complaint.id}
            ruleKey="complaints.triage.severity_override"
            originalValue={{ severity: severityOverride.from }}
            overriddenValue={{ severity: severityOverride.to }}
            metadata={{
              source: 'phase1_override_framework',
              screen: 'ComplaintDetail',
              complaint_id: complaint.id,
              previous_severity: severityOverride.from,
              new_severity: severityOverride.to,
              recommendation_source: 'triage_engine',
            }}
            title="Override complaint severity"
            description={`Changing severity from ${severityOverride.from} to ${severityOverride.to} contradicts the current triage classification. Provide a written justification.`}
            onOverridden={async (overrideId) => {
              const next = severityOverride.to;
              const from = severityOverride.from;
              setSeverityOverride(null);
              await applySeverityChange(next, from, `Override justification captured (override_id=${overrideId})`);
            }}
          />
        )}

        {closeOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setCloseOpen(false)}>
            <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-2">Close complaint</h3>
              <p className="text-sm text-muted-foreground mb-4">Provide a closure reason (min 5 chars). This is captured in the audit trail.</p>
              <div className="space-y-3">
                <div>
                  <Label>Category</Label>
                  <Select value={closeCategory} onValueChange={setCloseCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="resolved_at_source">Resolved at source</SelectItem>
                      <SelectItem value="withdrawn">Withdrawn by complainant</SelectItem>
                      <SelectItem value="duplicate">Duplicate</SelectItem>
                      <SelectItem value="out_of_scope">Out of scope</SelectItem>
                      <SelectItem value="no_action_required">No action required</SelectItem>
                      <SelectItem value="referred_out">Referred to another regulator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reason</Label>
                  <Textarea rows={3} value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="Explain why this complaint is being closed…" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancel</Button>
                  <Button onClick={() => close.mutate()} disabled={close.isPending || closeReason.trim().length < 5}>Confirm close</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {ackOpen && complaint && (
          <ComplaintAcknowledgement
            open={ackOpen}
            onOpenChange={setAckOpen}
            complaint={{
              id: complaint.id,
              complaint_number: complaint.complaint_number,
              subject: complaint.subject,
              submitted_at: complaint.created_at,
              complainant_name: (complaint as any).complainant_name ?? null,
              complainant_email: (complaint as any).email ?? null,
              channel: (complaint as any).channel ?? 'staff_intake',
              sla_days: slaDays,
            } as ComplaintAckInput}
          />
        )}

        {id && (
          <CollaborativeReview
            entityType="complaint"
            entityId={id}
            fields={[
              { key: 'investigation_notes', label: 'Investigation notes', value: (complaint as any)?.investigation_notes ?? '' },
              { key: 'resolution_notes', label: 'Resolution notes', value: (complaint as any)?.resolution_notes ?? '' },
              { key: 'findings', label: 'Findings', value: (complaint as any)?.findings ?? '' },
            ]}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function ComplaintTotalSla({ complaintId }: { complaintId: string }) {
  const { byEntityId } = useWorkflowTotalSla({ entityType: 'complaint', entityIds: [complaintId] });
  const entry = byEntityId.get(complaintId);
  if (!entry || entry.stepCount === 0) return null;
  return <TotalSlaBadge entry={entry} />;
}
