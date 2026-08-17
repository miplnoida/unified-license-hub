import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEmployeeApprovers } from '@/hooks/useEmployeeApprovers';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Loader2,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Upload,
  ExternalLink,
  FileText,
  User,
  ClipboardList,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Gavel,
} from 'lucide-react';
import { normalizeFpEvidence, fpEvidenceDisplayName, openFpEvidenceFile } from '@/lib/fpEvidence';
import { AssignCommitteeCard } from '@/components/fit-and-proper/AssignCommitteeCard';
import { canTransitionFp, fpStatusLabel } from '@/lib/fpStatus';

// ── Severity helpers ──────────────────────────────────────────────────────────

function severityBadge(severity: string | undefined) {
  if (!severity) return null;
  const map: Record<string, string> = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  const cls = map[severity.toLowerCase()] ?? 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <Badge variant="outline" className={cls}>
      {severity.toUpperCase()}
    </Badge>
  );
}

function resolutionBadge(status: string | undefined) {
  if (!status) return null;
  const map: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800 border-blue-200',
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    false_positive: 'bg-green-100 text-green-800 border-green-200',
    confirmed: 'bg-red-100 text-red-800 border-red-200',
  };
  const cls = map[status.toLowerCase()] ?? 'bg-slate-100 text-slate-700';
  return (
    <Badge variant="outline" className={cls}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

// fp_findings.citations is written by the screening provider as objects —
// [{ source_url, excerpt, published_at }] (see screeningProvider.ts) — not
// plain strings, though older/manually-entered rows may still be bare
// strings. Normalize both shapes so rendering never assumes a string.
interface FpCitationItem {
  url: string | null;
  text: string;
  publishedAt: string | null;
}

function normalizeFpCitations(raw: unknown): FpCitationItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FpCitationItem[] = [];
  for (const c of raw) {
    if (typeof c === 'string') {
      if (c) out.push({ url: c.startsWith('http') ? c : null, text: c, publishedAt: null });
    } else if (c && typeof c === 'object') {
      const obj = c as Record<string, unknown>;
      const url = typeof obj.source_url === 'string' && obj.source_url ? obj.source_url : null;
      const excerpt = typeof obj.excerpt === 'string' ? obj.excerpt : '';
      out.push({
        url,
        text: excerpt || url || 'Citation',
        publishedAt: typeof obj.published_at === 'string' ? obj.published_at : null,
      });
    }
  }
  return out;
}

function routingBanner(severity: string | undefined) {
  if (!severity) return null;
  const isHigh = severity.toLowerCase() === 'high';
  if (isHigh) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800">
        <ShieldAlert className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-semibold tracking-wide uppercase">Supervisor Queue</span>
        <Badge variant="outline" className="ml-auto bg-red-100 text-red-800 border-red-300 text-xs">
          HIGH SEVERITY
        </Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
      <ShieldCheck className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm font-semibold tracking-wide uppercase">Assessor Review</span>
      <Badge variant="outline" className="ml-auto bg-amber-100 text-amber-800 border-amber-300 text-xs">
        {severity?.toUpperCase() ?? 'MEDIUM'} SEVERITY
      </Badge>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FpaManualTaskDetail() {
  const { id: findingId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [notes, setNotes] = useState('');
  const [notesInitialised, setNotesInitialised] = useState(false);

  // Confirm-clear dialog
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  // Confirm-adverse dialog
  const [adverseDialogOpen, setAdverseDialogOpen] = useState(false);
  const [adverseReason, setAdverseReason] = useState('');

  // Evidence upload state
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [removingPaths, setRemovingPaths] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Finding query ─────────────────────────────────────────────────────────

  const { data: finding, isLoading } = useQuery({
    queryKey: ['fpa_finding_detail', findingId],
    enabled: !!findingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_findings')
        .select('*')
        .eq('id', findingId!)
        .maybeSingle();
      if (error) throw error;
      if (data && !notesInitialised) {
        setNotes((data as any).review_note ?? '');
        setNotesInitialised(true);
      }
      return data as any;
    },
  });

  // ── Assessment + individual (if assessment_id is set) ─────────────────────

  const { data: assessmentInfo, isError: assessmentError } = useQuery({
    queryKey: ['fpa_finding_assessment', finding?.assessment_id],
    enabled: !!finding?.assessment_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('id, assessment_type, status, committee_id, created_at, fp_individuals(id, full_name)')
        .eq('id', finding.assessment_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // ── Committee assignment (so staff can route the assessment to a
  // committee right from the review task, instead of a separate trip to the
  // individual's profile) ────────────────────────────────────────────────────

  const { data: committees } = useQuery({
    queryKey: ['fp_committees_active'],
    enabled: !!finding?.assessment_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_committees')
        .select('id, name, quorum, approval_threshold_pct')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Config name query (if config_id is set) ───────────────────────────────

  const { data: screeningConfig } = useQuery({
    queryKey: ['fpa_screening_config', finding?.config_id],
    enabled: !!finding?.config_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_screening_configs')
        .select('id, display_label, check_type')
        .eq('id', finding.config_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // ── Evidence upload handler ───────────────────────────────────────────────
  // The 'fp-evidence' bucket is private (screening evidence is sensitive), so
  // we store the storage path — not a public URL — and mint a fresh signed
  // URL on demand whenever a file is opened (see openEvidenceFile below).

  const handleEvidenceUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !findingId) return;

    setUploadingEvidence(true);
    const uploadedPaths: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${findingId}/${Date.now()}-${i}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('fp-evidence')
        .upload(path, file, { upsert: false });

      if (uploadError) {
        errors.push(`${file.name}: ${uploadError.message}`);
        continue;
      }

      uploadedPaths.push(path);
    }

    if (uploadedPaths.length > 0) {
      const currentPaths: string[] = Array.isArray(finding?.evidence_urls)
        ? finding.evidence_urls
        : [];
      const merged = [...currentPaths, ...uploadedPaths];

      const { error: dbError } = await supabase
        .from('fp_findings')
        .update({ evidence_urls: merged } as any)
        .eq('id', findingId);

      if (dbError) {
        toast.error(`Uploaded files but failed to save: ${dbError.message}`);
      } else {
        toast.success(
          `${uploadedPaths.length} file${uploadedPaths.length > 1 ? 's' : ''} uploaded successfully`,
        );
        qc.invalidateQueries({ queryKey: ['fpa_finding_detail', findingId] });
      }
    }

    if (errors.length > 0) {
      toast.error(`Failed to upload: ${errors.join(', ')}`);
    }

    setUploadingEvidence(false);
  };

  const handleEvidenceRemove = async (path: string) => {
    if (!findingId) return;
    if (!confirm('Remove this evidence file? This cannot be undone.')) return;

    setRemovingPaths((prev) => new Set(prev).add(path));

    // Filter the raw array (not the normalized copy) so unrelated entries —
    // whichever of the two historical shapes they're in — are left untouched.
    const rawList: unknown[] = Array.isArray(finding?.evidence_urls) ? finding.evidence_urls : [];
    const updated = rawList.filter((entry) => {
      const p = typeof entry === 'string' ? entry : (entry && typeof entry === 'object' ? (entry as Record<string, unknown>).path : undefined);
      return p !== path;
    });

    const { error: dbError } = await supabase
      .from('fp_findings')
      .update({ evidence_urls: updated } as any)
      .eq('id', findingId);

    if (dbError) {
      toast.error(`Failed to remove file: ${dbError.message}`);
      setRemovingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      return;
    }

    // Best-effort — the reference is already gone from the finding either way.
    const { error: storageError } = await supabase.storage.from('fp-evidence').remove([path]);
    if (storageError) console.warn('[FpaManualTaskDetail] failed to delete storage object', storageError);

    toast.success('Evidence file removed');
    qc.invalidateQueries({ queryKey: ['fpa_finding_detail', findingId] });
    setRemovingPaths((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  };

  const handleLegacyEvidenceRemove = async () => {
    if (!findingId) return;
    if (!confirm('Remove this evidence file? This cannot be undone.')) return;

    const { error } = await supabase.from('fp_findings').update({ evidence_url: null } as any).eq('id', findingId);
    if (error) {
      toast.error(`Failed to remove file: ${error.message}`);
      return;
    }
    toast.success('Evidence file removed');
    qc.invalidateQueries({ queryKey: ['fpa_finding_detail', findingId] });
  };

  // Evidence paths are opaque storage keys, not public URLs — mint a
  // short-lived signed URL each time a file is opened.
  const openEvidenceFile = openFpEvidenceFile;

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleEvidenceUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // ── Assignment ─────────────────────────────────────────────────────────────

  const { data: allEmployees } = useEmployeeApprovers();
  const activeEmployees = (allEmployees ?? []).filter((e) => e.status === 'active');

  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!findingId) throw new Error('No finding ID');
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('fp_findings')
        .update({
          assigned_to: userId,
          resolution_status: 'under_review',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        } as any)
        .eq('id', findingId);
      if (error) throw error;
      try {
        await supabase.functions.invoke('dispatch-notification-event', {
          body: { event_key: 'fp_finding_assigned', entity_type: 'fp_finding', entity_id: findingId, payload: { assigned_to: userId } },
        });
      } catch (e) { console.warn('dispatch-notification-event failed', e); }
    },
    onSuccess: () => {
      toast.success('Task assigned.');
      qc.invalidateQueries({ queryKey: ['fpa_finding_detail', findingId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Assignment failed'),
  });

  // ── Save notes mutation ───────────────────────────────────────────────────

  const saveNotesMutation = useMutation({
    mutationFn: async () => {
      if (!findingId) throw new Error('No finding ID');
      const { error } = await supabase
        .from('fp_findings')
        .update({
          review_note: notes,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id ?? null,
        } as any)
        .eq('id', findingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Notes saved');
      qc.invalidateQueries({ queryKey: ['fpa_finding_detail', findingId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save notes'),
  });

  // ── Mark cleared mutation ─────────────────────────────────────────────────

  const markClearedMutation = useMutation({
    mutationFn: async () => {
      if (!findingId) throw new Error('No finding ID');
      const { error } = await supabase
        .from('fp_findings')
        .update({
          resolution_status: 'false_positive',
          is_false_positive: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id ?? null,
        } as any)
        .eq('id', findingId);
      if (error) throw error;
      try {
        await supabase.functions.invoke('dispatch-notification-event', {
          body: { event_key: 'fp_finding_resolved', entity_type: 'fp_finding', entity_id: findingId, payload: { assigned_to: finding?.assigned_to ?? null, outcome: 'cleared' } },
        });
      } catch (e) { console.warn('dispatch-notification-event failed', e); }
    },
    onSuccess: () => {
      toast.success('Finding cleared');
      setClearDialogOpen(false);
      navigate('/fpa/manual-tasks');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to clear finding'),
  });

  // ── Confirm adverse mutation ───────────────────────────────────────────────

  const confirmAdverseMutation = useMutation({
    mutationFn: async () => {
      if (!findingId) throw new Error('No finding ID');
      const { error } = await supabase
        .from('fp_findings')
        .update({
          resolution_status: 'confirmed',
          is_false_positive: false,
          review_note: adverseReason || notes || null,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id ?? null,
        } as any)
        .eq('id', findingId);
      if (error) throw error;
      try {
        await supabase.functions.invoke('dispatch-notification-event', {
          body: { event_key: 'fp_finding_resolved', entity_type: 'fp_finding', entity_id: findingId, payload: { assigned_to: finding?.assigned_to ?? null, outcome: 'confirmed adverse' } },
        });
      } catch (e) { console.warn('dispatch-notification-event failed', e); }
    },
    onSuccess: () => {
      toast.success('Adverse finding confirmed');
      setAdverseDialogOpen(false);
      navigate('/fpa/manual-tasks');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to confirm finding'),
  });

  // ── Loading / not-found ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading finding...
        </div>
      </DashboardLayout>
    );
  }

  if (!finding) {
    return (
      <DashboardLayout>
        <div className="py-24 text-center text-muted-foreground">Finding not found.</div>
      </DashboardLayout>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const citations = normalizeFpCitations(finding.citations);
  const evidenceItems = normalizeFpEvidence(finding.evidence_urls);
  const isResolved =
    finding.resolution_status === 'false_positive' ||
    finding.resolution_status === 'confirmed';

  const individual = assessmentInfo?.fp_individuals ?? null;

  const confidencePct =
    finding.confidence_score != null
      ? `${Math.round(Number(finding.confidence_score))}%`
      : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-5xl">
        {/* Page header */}
        <PageHeader
          title={`Review: ${finding.title ?? 'Finding'}`}
          description="Manual review task — FPA-006"
          backHref="/fpa/manual-tasks"
          backLabel="Manual Tasks"
          actions={resolutionBadge(finding.resolution_status)}
        />

        {/* Routing banner */}
        {routingBanner(finding.severity)}

        {/* Main two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left column */}
          <div className="lg:col-span-2 space-y-5">

            {/* Finding Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Finding Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Title + severity row */}
                <div className="flex flex-wrap items-start gap-3">
                  <h2 className="text-sm font-semibold flex-1 leading-snug">
                    {finding.title ?? '—'}
                  </h2>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {severityBadge(finding.severity)}
                    {confidencePct && (
                      <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                        {confidencePct} confidence
                      </Badge>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Meta grid */}
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Check Type</dt>
                    <dd className="font-medium">{finding.check_type ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Source</dt>
                    <dd className="font-medium">{finding.source ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Status</dt>
                    <dd>{resolutionBadge(finding.resolution_status) ?? <span className="text-muted-foreground">—</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Created</dt>
                    <dd className="text-muted-foreground">
                      {finding.created_at
                        ? new Date(finding.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </dd>
                  </div>
                </dl>

                {/* Summary */}
                {finding.summary && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                      Summary
                    </p>
                    <p className="text-sm leading-relaxed text-foreground">{finding.summary}</p>
                  </div>
                )}

                {/* Citations */}
                {citations.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                      Citations
                    </p>
                    <ul className="space-y-1.5 pl-4 list-disc marker:text-muted-foreground">
                      {citations.map((c, i) => (
                        <li key={i} className="text-sm">
                          {c.url ? (
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline break-all inline-flex items-center gap-1"
                            >
                              {c.text}
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                          ) : (
                            <span className="text-foreground">{c.text}</span>
                          )}
                          {c.publishedAt && (
                            <span className="text-xs text-muted-foreground ml-1.5">
                              ({new Date(c.publishedAt).toLocaleDateString()})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Evidence URLs */}
                {evidenceItems.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                      Evidence URLs
                    </p>
                    <ul className="space-y-1.5">
                      {evidenceItems.map((item, i) => (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => openEvidenceFile(item.path)}
                            className="text-sm text-blue-600 hover:underline break-all inline-flex items-center gap-1 text-left"
                          >
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            {fpEvidenceDisplayName(item)}
                          </button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive"
                            disabled={removingPaths.has(item.path)}
                            onClick={() => handleEvidenceRemove(item.path)}
                          >
                            {removingPaths.has(item.path) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Legacy single evidence_url */}
                {finding.evidence_url && !evidenceItems.some((it) => it.path === finding.evidence_url) && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                      Evidence Link
                    </p>
                    <a
                      href={finding.evidence_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline break-all inline-flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      {finding.evidence_url}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Evidence Upload Area */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Evidence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx"
                  className="hidden"
                  onChange={(e) => handleEvidenceUpload(e.target.files)}
                />

                {/* Drag-and-drop zone */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors ${
                    isDragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-muted/20 hover:bg-muted/40'
                  }`}
                >
                  {uploadingEvidence ? (
                    <>
                      <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                      <p className="text-sm font-medium text-foreground">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">
                        Drag and drop evidence files here
                      </p>
                      <p className="text-xs text-muted-foreground max-w-xs">
                        or click to select files (PDF, images, Word, CSV, Excel)
                      </p>
                    </>
                  )}
                </div>

                {/* Already-attached evidence */}
                {evidenceItems.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                      Attached Evidence
                    </p>
                    <ul className="space-y-1.5">
                      {evidenceItems.map((item, i) => (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => openEvidenceFile(item.path)}
                            className="text-sm text-blue-600 hover:underline break-all inline-flex items-center gap-1 text-left"
                          >
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            {fpEvidenceDisplayName(item)}
                          </button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive"
                            disabled={removingPaths.has(item.path)}
                            onClick={() => handleEvidenceRemove(item.path)}
                          >
                            {removingPaths.has(item.path) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Legacy single evidence_url (if not already in array) */}
                {finding.evidence_url && !evidenceItems.some((it) => it.path === finding.evidence_url) && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                      Attached Evidence
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={finding.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline break-all inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        {finding.evidence_url}
                      </a>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={handleLegacyEvidenceRemove}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Case Notes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  Case Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Review Note</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Enter review observations, context, or justification..."
                  />
                </div>
                <Button data-rbac="fit_and_proper.edit"
                  size="sm"
                  variant="outline"
                  onClick={() => saveNotesMutation.mutate()}
                  disabled={saveNotesMutation.isPending}
                >
                  {saveNotesMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  )}
                  Save Notes
                </Button>
              </CardContent>
            </Card>

            {/* Complete Review */}
            {!isResolved && (
              <Card className="border-2 border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Complete Review</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* Mark Cleared */}
                    <Button data-rbac="fit_and_proper.edit"
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
                      onClick={() => setClearDialogOpen(true)}
                      disabled={markClearedMutation.isPending || confirmAdverseMutation.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark CLEARED
                    </Button>

                    {/* Confirm Adverse */}
                    <Button data-rbac="fit_and_proper.edit"
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2"
                      onClick={() => setAdverseDialogOpen(true)}
                      disabled={markClearedMutation.isPending || confirmAdverseMutation.isPending}
                    >
                      <XCircle className="h-4 w-4" />
                      Confirm ADVERSE
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resolved banner */}
            {isResolved && (
              <Card
                className={
                  finding.resolution_status === 'confirmed'
                    ? 'border-red-200 bg-red-50/40'
                    : 'border-green-200 bg-green-50/40'
                }
              >
                <CardContent className="p-4 flex items-center gap-3">
                  {finding.resolution_status === 'confirmed' ? (
                    <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {finding.resolution_status === 'confirmed'
                        ? 'Adverse finding confirmed'
                        : 'Finding cleared'}
                    </p>
                    {finding.resolved_at && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(finding.resolved_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">

            {/* Assessment / Individual Info */}
            {finding.assessment_id && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Assessment Context
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                      Individual
                    </p>
                    <p className="font-medium">
                      {assessmentError ? (
                        <span className="text-destructive">Failed to load assessment</span>
                      ) : individual?.full_name ? (
                        individual.full_name
                      ) : assessmentInfo === undefined ? (
                        <span className="text-muted-foreground">Loading...</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </p>
                  </div>
                  {assessmentInfo && !assessmentError && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                        Assessment Type
                      </p>
                      <p className="font-medium">
                        {assessmentInfo.assessment_type ?? '—'}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                      Assessment ID
                    </p>
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      {finding.assessment_id}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Committee Assignment */}
            {finding.assessment_id && assessmentInfo && !assessmentError && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gavel className="h-4 w-4 text-muted-foreground" />
                    Committee Assignment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {assessmentInfo.committee_id ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        This assessment has already been routed to a committee for voting.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/fpa/individuals/${individual?.id}?tab=determinations`)}
                      >
                        <Gavel className="h-3.5 w-3.5 mr-1.5" />
                        View Committee &amp; Voting
                      </Button>
                    </>
                  ) : canTransitionFp(assessmentInfo.status, 'awaiting_committee') ? (
                    <AssignCommitteeCard
                      individualId={individual?.id ?? ''}
                      assessment={assessmentInfo}
                      committees={(committees ?? []) as any[]}
                      onAssigned={() => qc.invalidateQueries({ queryKey: ['fpa_finding_assessment', finding.assessment_id] })}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Not yet eligible for committee assignment — this assessment is currently "{fpStatusLabel(assessmentInfo.status)}".
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Assignment */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Assignment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={finding.assigned_to ?? undefined}
                  onValueChange={(v) => assignMutation.mutate(v)}
                  disabled={assignMutation.isPending}
                >
                  <SelectTrigger>
                    {assignMutation.isPending ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Assigning…
                      </span>
                    ) : (
                      <SelectValue placeholder="Assign to…" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {activeEmployees.length === 0 && (
                      <SelectItem value="__none__" disabled>No active employees found</SelectItem>
                    )}
                    {activeEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name || e.email || e.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Finding Meta */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Finding Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                    Finding ID
                  </p>
                  <p className="font-mono text-xs text-muted-foreground break-all">{finding.id}</p>
                </div>
                {finding.run_id && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                      Run ID
                    </p>
                    <p className="font-mono text-xs text-muted-foreground break-all">{finding.run_id}</p>
                  </div>
                )}
                {finding.config_id && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                      Screening Config
                    </p>
                    <p className="font-medium text-foreground">
                      {screeningConfig
                        ? `${screeningConfig.display_label}${screeningConfig.check_type ? ` (${screeningConfig.check_type})` : ''}`
                        : <span className="text-muted-foreground">Loading...</span>}
                    </p>
                  </div>
                )}
                {finding.reviewed_at && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                      Last Reviewed
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(finding.reviewed_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick back nav */}
            <Button
              variant="ghost"
              className="w-full gap-2 text-muted-foreground justify-start"
              onClick={() => navigate('/fpa/manual-tasks')}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Manual Tasks
            </Button>
          </div>
        </div>
      </div>

      {/* Confirm Clear Dialog */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Mark this finding as cleared?
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2 py-1">
            <p>
              This will mark the finding as a <strong>false positive</strong> and record the
              resolution timestamp. This action cannot be undone from this screen.
            </p>
            {finding.title && (
              <p className="font-medium text-foreground">"{finding.title}"</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setClearDialogOpen(false)}>
              Cancel
            </Button>
            <Button data-rbac="fit_and_proper.edit"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => markClearedMutation.mutate()}
              disabled={markClearedMutation.isPending}
            >
              {markClearedMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Yes, Mark CLEARED
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Adverse Dialog */}
      <Dialog open={adverseDialogOpen} onOpenChange={setAdverseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Confirm adverse finding?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              This will mark the finding as <strong>confirmed adverse</strong>. Provide a reason or
              supporting rationale below.
            </p>
            {finding.title && (
              <p className="text-sm font-medium text-foreground">"{finding.title}"</p>
            )}
            <div className="space-y-1.5">
              <Label>Reason / Rationale</Label>
              <Textarea
                value={adverseReason}
                onChange={(e) => setAdverseReason(e.target.value)}
                rows={4}
                placeholder="Describe why this finding is confirmed adverse..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setAdverseDialogOpen(false);
                setAdverseReason('');
              }}
            >
              Cancel
            </Button>
            <Button data-rbac="fit_and_proper.edit"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => confirmAdverseMutation.mutate()}
              disabled={confirmAdverseMutation.isPending}
            >
              {confirmAdverseMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Confirm ADVERSE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
