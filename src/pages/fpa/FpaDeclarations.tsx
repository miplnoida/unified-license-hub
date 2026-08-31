import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { fpDeclarationInvitationCreate, fpDeclarationInvitationResend } from '@/lib/fpGovernedOps';
import { toast } from 'sonner';
import {
  Loader2, Plus, Bell, Send, Copy, CheckCheck, ClipboardList,
  FileText, Clock, AlertCircle, RefreshCw, Eye,
} from 'lucide-react';
import { canRequestDeclaration } from '@/lib/fpaAssessmentStatus';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { PQ_STATE_META, type PqState } from '@/lib/fp/pqState';
import { FpPqAmendmentDialog } from '@/components/fit-and-proper/FpPqAmendmentDialog';
import { generateToken, computeVerificationHash, computeIdentityHashes, getAssessmentEntityName } from '@/lib/fpDeclarationInvitation';
import { SubmittedDeclarationView } from '@/components/fit-and-proper/SubmittedDeclarationView';
import { publicAppUrl } from '@/lib/publicAppUrl';


// ─── helpers ────────────────────────────────────────────────────────────────

function declStatus(status: string): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } {
  switch (status) {
    case 'draft':       return { label: 'Pending',   variant: 'secondary' };
    case 'submitted':   return { label: 'Received',  variant: 'default' };
    case 'screening':   return { label: 'In Review', variant: 'outline' };
    case 'determined':  return { label: 'Complete',  variant: 'default' };
    default:            return { label: status,      variant: 'outline' };
  }
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const ACTION_COLORS: Record<string, string> = {
  NOTIFICATION_SENT:    'bg-blue-50 text-blue-700 border-blue-200',
  WORKFLOW_TRANSITION:  'bg-amber-50 text-amber-700 border-amber-200',
  CREATE:               'bg-emerald-50 text-emerald-700 border-emerald-200',
  UPDATE:               'bg-slate-50 text-slate-700 border-slate-200',
};

// ─── assessment detail dialog ────────────────────────────────────────────────

function AssessmentDetailDialog({ row }: { row: any }) {
  const [open, setOpen] = useState(false);
  const indiv = row.fp_individuals as any;
  const ds = declStatus(row.status);
  // Only a genuinely submitted declaration has answers worth rendering — while
  // still in Draft, declaration_data (if any) is just "an invitation was sent",
  // not a completed questionnaire.
  const isSubmitted = !canRequestDeclaration(row.status);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs">
          <Eye className="h-3 w-3 mr-1" />
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assessment Detail</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Individual</p>
              <p className="font-medium">{indiv?.full_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">National ID</p>
              <p className="font-mono text-xs">{indiv?.national_id ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Assessment Type</p>
              <p className="capitalize">{row.assessment_type ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={ds.variant} className="text-xs">{ds.label}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p>{fmtDate(row.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Declaration Channel</p>
              <p className="capitalize">{(row.declaration_data as any)?.channel ?? 'Not requested'}</p>
            </div>
          </div>
          {(row.declaration_data as any)?.note && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Note</p>
              <p className="text-xs bg-muted rounded p-2">{(row.declaration_data as any).note}</p>
            </div>
          )}
          {(row.declaration_data as any)?.requested_at && (
            <div>
              <p className="text-xs text-muted-foreground">Requested At</p>
              <p className="text-xs">{fmtDate((row.declaration_data as any).requested_at)} at {fmtTime((row.declaration_data as any).requested_at)}</p>
            </div>
          )}

          {isSubmitted && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Submitted Declaration</p>
                <SubmittedDeclarationView
                  formTemplateId={row.form_template_id}
                  formVersionId={row.form_version_id}
                  declarationData={row.declaration_data}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function FpaDeclarations() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [portalLink, setPortalLink] = useState('');

  // form state
  const [selectedIndividual, setSelectedIndividual] = useState('');
  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [channel] = useState<'EMAIL'>('EMAIL');
  const [recipientEmail, setRecipientEmail] = useState('');

  const [note, setNote] = useState('');

  // identity-gate verification hash state — verificationHash is whichever
  // identity document (national ID or passport) is on file, verificationHashAlt
  // the second one's hash when both are, so either may be presented at
  // verification (see computeIdentityHashes()).
  const [verificationHash, setVerificationHash] = useState('');
  const [verificationHashAlt, setVerificationHashAlt] = useState('');
  const [manualDob, setManualDob] = useState('');
  const [manualLast4, setManualLast4] = useState('');
  // null = not yet computed, true = auto-computed from profile, false = profile missing DOB/national_id
  const [verifDataSource, setVerifDataSource] = useState<'auto' | 'manual' | null>(null);

  // ── queries ──────────────────────────────────────────────────────────────

  // Stats: pending declarations (draft with declaration_data)
  const {
    data: stats,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['fpa_declaration_stats'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [pending, submittedCount, monthly] = await Promise.all([
        supabase
          .from('fp_assessments' as any)
          .select('id', { count: 'exact', head: true })
          .eq('status', 'draft')
          .not('declaration_data', 'is', null),
        supabase
          .from('fp_assessments' as any)
          .select('id', { count: 'exact', head: true })
          .eq('status', 'submitted'),
        supabase
          .from('fp_assessments' as any)
          .select('id', { count: 'exact', head: true })
          .gte('created_at', monthStart),
      ]);

      if (pending.error) throw pending.error;
      if (submittedCount.error) throw submittedCount.error;
      if (monthly.error) throw monthly.error;

      return {
        pending: pending.count ?? 0,
        submitted: submittedCount.count ?? 0,
        monthly: monthly.count ?? 0,
      };
    },
  });

  // Declaration queue: fp_assessments where declaration_data is not null OR status in draft/submitted
  const {
    data: queue,
    isLoading: queueLoading,
    isError: queueError,
    error: queueErr,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: ['fpa_declaration_queue'],
    queryFn: async () => {
      const [withDecl, byStatus] = await Promise.all([
        supabase
          .from('fp_assessments' as any)
          .select('id, individual_id, assessment_type, status, pq_state, pq_amendment_reason, declaration_data, form_template_id, form_version_id, created_at, fp_individuals(full_name, national_id)')

          .not('declaration_data', 'is', null)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('fp_assessments' as any)
          .select('id, individual_id, assessment_type, status, pq_state, pq_amendment_reason, declaration_data, form_template_id, form_version_id, created_at, fp_individuals(full_name, national_id)')
          .in('status', ['draft', 'submitted'])
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (withDecl.error) throw withDecl.error;
      if (byStatus.error) throw byStatus.error;

      const merged = new Map<string, any>();
      for (const r of [...(withDecl.data ?? []), ...(byStatus.data ?? [])] as any[]) {
        merged.set(r.id, r);
      }
      return Array.from(merged.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
  });

  // Notification log: compliance_audit_logs filtered by object_type='fp_assessment'
  // and action_type IN ('NOTIFICATION_SENT','WORKFLOW_TRANSITION')
  const {
    data: notifLog,
    isLoading: notifLoading,
    isError: notifError,
    refetch: refetchNotif,
  } = useQuery({
    queryKey: ['fpa_notif_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_audit_logs' as any)
        .select('entry_id, action_type, object_type, object_id, timestamp, user_role, justification')
        .eq('object_type', 'fp_assessment')
        .in('action_type', ['NOTIFICATION_SENT', 'WORKFLOW_TRANSITION'])
        .order('timestamp', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Individuals for dropdown
  const {
    data: individuals,
    isError: individualsError,
    refetch: refetchIndividuals,
  } = useQuery({
    queryKey: ['fp_individuals_dropdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individuals' as any)
        .select('id, full_name, national_id, passport_number, date_of_birth, email')
        .order('full_name')
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Assessments for selected individual
  const {
    data: individualAssessments,
    isError: assessmentsError,
    refetch: refetchAssessments,
  } = useQuery({
    queryKey: ['fp_assessments_for_individual', selectedIndividual],
    enabled: !!selectedIndividual,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments' as any)
        .select('id, assessment_type, status, created_at')
        .eq('individual_id', selectedIndividual)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── mutations ─────────────────────────────────────────────────────────────

  const sendReminder = useMutation({
    mutationFn: async ({ assessmentId, individualId }: { assessmentId: string; individualId: string }) => {
      // A genuine resend needs a fresh token — only the SHA-256 hash of the
      // original raw token was ever stored, so the old portal link cannot be
      // recovered or re-sent as-is. Reuse the prior invitation's
      // verification_hash/channel/recipient so identity verification still
      // matches what was originally set up, mint a new token, expire the old
      // invitation, and actually send the email this time instead of only
      // writing an audit entry that implied one went out.
      const { data: priorInvitation, error: priorErr } = await supabase
        .from('declaration_invitations' as any)
        .select('id, verification_hash, verification_hash_alt, channel, recipient_email, recipient_phone')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (priorErr) throw priorErr;
      if (!priorInvitation) {
        throw new Error('No declaration invitation has been sent for this assessment yet — use "Request Declaration" first.');
      }
      const prior = priorInvitation as any;

      const { data: individual, error: indErr } = await supabase
        .from('fp_individuals' as any)
        .select('full_name, email')
        .eq('id', individualId)
        .maybeSingle();
      if (indErr) throw indErr;
      const recipientEmail = (individual as any)?.email || prior.recipient_email || '';

      const { raw: rawToken, hash: tokenHash } = await generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await fpDeclarationInvitationResend({
        invitationId: prior.id,
        tokenHash,
        expiresAt,
        recipientEmail: recipientEmail || null,
      });

      const portalLink = await publicAppUrl(`/declaration/${rawToken}`);
      let emailSent = false;
      if (recipientEmail) {
        const individualName = (individual as any)?.full_name || 'Applicant';
        const entityName = await getAssessmentEntityName(assessmentId);
        const entityLine = entityName ? ` in connection with your role at ${entityName}` : '';
        const emailSubject = 'Reminder: Fit & Proper Declaration — Action Required';
        const emailText = [
          `Dear ${individualName},`,
          '',
          `This is a reminder that your Fit & Proper Personal Questionnaire Declaration${entityLine} is still outstanding.`,
          '',
          'Please use the link below to access the secure declaration form:',
          portalLink,
          '',
          'When prompted, verify your identity using your date of birth and the last 4 digits of your national ID or passport number.',
          '',
          'This link expires in 7 days. If you did not expect this request, please disregard this message.',
          '',
          'Regards,',
          'The Compliance Team',
        ].join('\n');
        const emailHtml = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
            <h2 style="margin-top:0;color:#111827">Reminder: Fit &amp; Proper Declaration</h2>
            <p>Dear <strong>${individualName}</strong>,</p>
            <p>This is a reminder that your <strong>Fit &amp; Proper Personal Questionnaire Declaration</strong>${entityName ? ` in connection with your role at <strong>${entityName}</strong>` : ''} is still outstanding.</p>
            <p>Click the button below to access the secure declaration form:</p>
            <p style="text-align:center;margin:32px 0">
              <a href="${portalLink}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
                Complete Declaration Form
              </a>
            </p>
            <p style="font-size:13px;color:#6b7280">Or copy this link into your browser:<br>
              <span style="word-break:break-all;color:#2563eb">${portalLink}</span>
            </p>
            <p>When prompted, you will need your <strong>date of birth</strong> and the <strong>last 4 digits of your national ID or passport number</strong> to verify your identity.</p>
            <p style="color:#dc2626;font-size:13px">⚠ This link expires in 7 days.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
            <p style="font-size:12px;color:#9ca3af">This is an automated message from the Regulatory Compliance Portal. Do not reply to this email.</p>
          </div>`;
        try {
          const { data: emailResult } = await supabase.functions.invoke('send-notification', {
            body: { type: 'email', to: recipientEmail, subject: emailSubject, body: emailText, html: emailHtml },
          });
          emailSent = emailResult?.success === true;
        } catch {
          // Email send threw — the new invitation row is still valid; caller gets a warning.
        }
      }

      await supabase.rpc('log_compliance_audit' as any, {
        _action_type: 'NOTIFICATION_SENT',
        _object_type: 'fp_assessment',
        _object_id: assessmentId,
        _justification: emailSent
          ? `Reminder re-sent to ${recipientEmail} (new invitation, prior one expired)`
          : 'Reminder invitation re-issued (email not sent — no recipient email or SMTP unavailable)',
      });

      return { emailSent, recipientEmail };
    },
    onSuccess: ({ emailSent, recipientEmail }) => {
      if (recipientEmail && !emailSent) {
        toast.warning('New invitation issued but email could not be sent — SMTP may not be configured.');
      } else if (recipientEmail) {
        toast.success(`Reminder sent to ${recipientEmail}`);
      } else {
        toast.warning('New invitation issued, but this individual has no email on file to send it to.');
      }
      qc.invalidateQueries({ queryKey: ['fpa_notif_log'] });
      qc.invalidateQueries({ queryKey: ['fpa_declaration_queue'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to send reminder'),
  });

  const requestDeclaration = useMutation({
    mutationFn: async () => {
      if (!selectedAssessment) throw new Error('Select an assessment');
      if (!selectedIndividual) throw new Error('Select an individual');

      // 1. Generate a secure random token and its SHA-256 hash
      const { raw: rawToken, hash: tokenHash } = await generateToken();

      // 2. Use the pre-computed verification hash (sha256 of dob|last4 matching verify_declaration_identity()).
      if (!verificationHash) throw new Error('Verification hash not ready. Ensure the individual has a date of birth and a national ID or passport number on file, or enter them manually.');

      // 3. Insert the declaration_invitation record
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await fpDeclarationInvitationCreate({
        assessmentId: selectedAssessment,
        individualId: selectedIndividual,
        tokenHash,
        verificationHash,
        verificationHashAlt: verificationHashAlt || null,
        channel: channel as any,
        expiresAt: expiresAt,
        recipientEmail: recipientEmail.trim() || null,
        note: note.trim() || null,
      });

      // 6. Send the invitation email with the secure portal link
      const portalLink = await publicAppUrl(`/declaration/${rawToken}`);
      let emailSent = false;
      if (recipientEmail.trim()) {
        const individualName = (individuals ?? []).find((i: any) => i.id === selectedIndividual)?.full_name || 'Applicant';
        const entityName = await getAssessmentEntityName(selectedAssessment);
        const entityLine = entityName ? ` in connection with your role at ${entityName}` : '';
        const emailSubject = 'Fit & Proper Declaration — Action Required';
        const emailText = [
          `Dear ${individualName},`,
          '',
          `You have been invited to complete a Fit & Proper Personal Questionnaire Declaration${entityLine}.`,
          '',
          'Please use the link below to access the secure declaration form:',
          portalLink,
          '',
          'When prompted, verify your identity using your date of birth and the last 4 digits of your national ID or passport number.',
          '',
          'This link expires in 7 days. If you did not expect this request, please disregard this message.',
          '',
          'Regards,',
          'The Compliance Team',
        ].join('\n');
        const emailHtml = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
            <h2 style="margin-top:0;color:#111827">Fit &amp; Proper Declaration — Action Required</h2>
            <p>Dear <strong>${individualName}</strong>,</p>
            <p>You have been invited to complete a <strong>Fit &amp; Proper Personal Questionnaire Declaration</strong>${entityName ? ` in connection with your role at <strong>${entityName}</strong>` : ''}.</p>
            <p>Click the button below to access the secure declaration form:</p>
            <p style="text-align:center;margin:32px 0">
              <a href="${portalLink}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
                Complete Declaration Form
              </a>
            </p>
            <p style="font-size:13px;color:#6b7280">Or copy this link into your browser:<br>
              <span style="word-break:break-all;color:#2563eb">${portalLink}</span>
            </p>
            <p>When prompted, you will need your <strong>date of birth</strong> and the <strong>last 4 digits of your national ID or passport number</strong> to verify your identity.</p>
            <p style="color:#dc2626;font-size:13px">⚠ This link expires in 7 days.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
            <p style="font-size:12px;color:#9ca3af">This is an automated message from the Regulatory Compliance Portal. Do not reply to this email.</p>
          </div>`;

        try {
          const { data: emailResult } = await supabase.functions.invoke('send-notification', {
            body: { type: 'email', to: recipientEmail.trim(), subject: emailSubject, body: emailText, html: emailHtml },
          });
          emailSent = emailResult?.success === true;
        } catch {
          // Email send threw — invitation row is still valid; caller gets a warning
        }
      }

      return { rawToken, emailSent, recipientEmail: recipientEmail.trim() };
    },
    onSuccess: async ({ rawToken, emailSent, recipientEmail: toEmail }: { rawToken: string; emailSent: boolean; recipientEmail: string }) => {
      if (toEmail && !emailSent) {
        toast.warning('Invitation created but email could not be sent — SMTP may not be configured. Share the portal link below manually.');
      } else {
        toast.success(toEmail ? `Declaration request sent to ${toEmail}` : 'Declaration invitation created');
      }
      qc.invalidateQueries({ queryKey: ['fpa_declaration_queue'] });
      qc.invalidateQueries({ queryKey: ['fpa_declaration_stats'] });
      qc.invalidateQueries({ queryKey: ['fpa_notif_log'] });
      const link = await publicAppUrl(`/declaration/${rawToken}`);
      setPortalLink(link);
      setSubmitted(true);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to send request'),
  });

  async function handleIndividualSelect(id: string) {
    setSelectedIndividual(id);
    setSelectedAssessment('');
    setVerificationHash('');
    setVerificationHashAlt('');
    setVerifDataSource(null);
    setManualDob('');
    setManualLast4('');

    const ind = (individuals ?? []).find((i: any) => i.id === id) as any;
    if (ind?.email) setRecipientEmail(ind.email);
    const { primary, alt } = await computeIdentityHashes(ind?.date_of_birth, ind?.national_id, ind?.passport_number);
    if (primary) {
      setVerificationHash(primary);
      setVerificationHashAlt(alt);
      setVerifDataSource('auto');
    } else {
      setVerifDataSource('manual');
    }
  }

  async function handleManualVerifChange(dob: string, last4: string) {
    setManualDob(dob);
    setManualLast4(last4);
    if (dob && last4.length === 4) {
      const hash = await computeVerificationHash(dob, last4);
      setVerificationHash(hash);
      setVerificationHashAlt('');
    } else {
      setVerificationHash('');
    }
  }

  function resetDialog() {
    setSelectedIndividual('');
    setSelectedAssessment('');
    // channel is fixed to EMAIL
    setRecipientEmail('');
    setNote('');
    setVerificationHash('');
    setVerificationHashAlt('');
    setManualDob('');
    setManualLast4('');
    setVerifDataSource(null);
    setSubmitted(false);
    setPortalLink('');
    setCopied(false);
  }

  function copyLink() {
    navigator.clipboard.writeText(portalLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Notification entries to display — real data only; empty array if none returned
  const displayNotifs: any[] = notifLoading ? [] : (notifLog ?? []);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* ── header ──────────────────────────────────────────────────── */}
        <PageHeader
          title="Declarations"
          description="Manage declaration requests and track notification delivery — FPA-004"
          actions={
            <Dialog
              open={dialogOpen}
              onOpenChange={(o) => {
                setDialogOpen(o);
                if (!o) resetDialog();
              }}
            >
              <DialogTrigger asChild>
                <Button data-rbac="fit_and_proper.create">
                  <Plus className="h-4 w-4 mr-2" />
                  Request Declaration
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Request Declaration</DialogTitle>
                </DialogHeader>

                {!submitted ? (
                  <div className="space-y-4 py-1">
                    {/* Individual */}
                    <div className="space-y-1.5">
                      <Label htmlFor="decl-individual">Individual</Label>
                      {individualsError && (
                        <Alert variant="destructive" className="py-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            Failed to load individuals.{' '}
                            <button
                              type="button"
                              className="underline"
                              onClick={() => refetchIndividuals()}
                            >
                              Retry
                            </button>
                          </AlertDescription>
                        </Alert>
                      )}
                      <Select
                        value={selectedIndividual}
                        onValueChange={handleIndividualSelect}
                      >
                        <SelectTrigger id="decl-individual">
                          <SelectValue placeholder="Select individual…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(individuals ?? []).map((ind: any) => (
                            <SelectItem key={ind.id} value={ind.id}>
                              {ind.full_name || ind.national_id || ind.id.slice(0, 8)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Identity gate status */}
                    {verifDataSource === 'auto' && (
                      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                        <CheckCheck className="h-3.5 w-3.5 shrink-0" />
                        Identity gate ready — DOB and {verificationHashAlt ? 'national ID and passport number' : 'national ID or passport number'} loaded from profile.
                      </div>
                    )}
                    {verifDataSource === 'manual' && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2.5">
                        <div className="flex items-start gap-2 text-xs text-amber-800">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>
                            This individual is missing a date of birth, national ID, and passport number on their profile.
                            Enter the values below to set the identity gate the portal will verify against.
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Date of Birth <span className="text-red-500">*</span></Label>
                            <Input
                              type="date"
                              value={manualDob}
                              onChange={(e) => handleManualVerifChange(e.target.value, manualLast4)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Last 4 of National ID / Passport <span className="text-red-500">*</span></Label>
                            <Input
                              type="text"
                              maxLength={4}
                              placeholder="e.g. 5993"
                              value={manualLast4}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                                handleManualVerifChange(manualDob, v);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Assessment */}
                    <div className="space-y-1.5">
                      <Label htmlFor="decl-assessment">Assessment</Label>
                      {assessmentsError && selectedIndividual && (
                        <Alert variant="destructive" className="py-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            Failed to load assessments.{' '}
                            <button
                              type="button"
                              className="underline"
                              onClick={() => refetchAssessments()}
                            >
                              Retry
                            </button>
                          </AlertDescription>
                        </Alert>
                      )}
                      <Select
                        value={selectedAssessment}
                        onValueChange={setSelectedAssessment}
                        disabled={!selectedIndividual}
                      >
                        <SelectTrigger id="decl-assessment">
                          <SelectValue placeholder={selectedIndividual ? 'Select assessment…' : 'Select individual first'} />
                        </SelectTrigger>
                        <SelectContent>
                          {(individualAssessments ?? []).filter((a: any) => canRequestDeclaration(a.status)).map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.assessment_type ?? 'Assessment'} · {fmtDate(a.created_at)}
                            </SelectItem>
                          ))}
                          {selectedIndividual && (individualAssessments ?? []).filter((a: any) => canRequestDeclaration(a.status)).length === 0 && !assessmentsError && (
                            <SelectItem value="__none__" disabled>No pending assessments found</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Channel — fixed to Email */}
                    <div className="space-y-1.5">
                      <Label htmlFor="decl-channel">Delivery Channel</Label>
                      <div className="flex items-center h-9 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                        Email
                      </div>
                    </div>

                    {/* Recipient email */}
                    <div className="space-y-1.5">
                      <Label htmlFor="decl-email">Recipient Email</Label>
                      <Input
                        id="decl-email"
                        type="email"
                        placeholder="applicant@example.com"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                      />
                    </div>

                    {/* Note */}
                    <div className="space-y-1.5">
                      <Label htmlFor="decl-note">Note (optional)</Label>
                      <Textarea
                        id="decl-note"
                        rows={3}
                        placeholder="Internal note about this declaration request…"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  /* ── post-submit confirmation ── */
                  <div className="space-y-4 py-2">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <CheckCheck className="h-5 w-5 flex-shrink-0" />
                      <p className="text-sm font-medium">Declaration invitation recorded and logged.</p>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Share this secure, expiring link with the applicant to complete the declaration form.
                        This link expires in 7 days.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all">
                          {portalLink}
                        </code>
                        <Button size="icon" variant="outline" onClick={copyLink} className="flex-shrink-0">
                          {copied ? <CheckCheck className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <DialogFooter>
                  {!submitted ? (
                    <>
                      <Button variant="ghost" onClick={() => { setDialogOpen(false); resetDialog(); }}>
                        Cancel
                      </Button>
                      <Button data-rbac="fit_and_proper.create"
                        onClick={() => requestDeclaration.mutate()}
                        disabled={requestDeclaration.isPending || !selectedAssessment || !verificationHash}
                      >
                        {requestDeclaration.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        <Send className="h-4 w-4 mr-2" />
                        Send Request
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => { setDialogOpen(false); resetDialog(); }}>
                      Close
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        {/* ── stats row ───────────────────────────────────────────────── */}
        {statsError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center gap-2">
              Failed to load statistics.
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => refetchStats()}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="rounded-md bg-amber-50 p-2 text-amber-600">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pending declarations</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {stats?.pending ?? <Loader2 className="h-4 w-4 animate-spin inline" />}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="rounded-md bg-emerald-50 p-2 text-emerald-600">
                  <CheckCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Submitted</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {stats?.submitted ?? <Loader2 className="h-4 w-4 animate-spin inline" />}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="rounded-md bg-blue-50 p-2 text-blue-600">
                  <ClipboardList className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total this month</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {stats?.monthly ?? <Loader2 className="h-4 w-4 animate-spin inline" />}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── two-panel layout ─────────────────────────────────────────── */}
        <div className="flex gap-4 items-start flex-col lg:flex-row">

          {/* ── left: declaration queue (60%) ── */}
          <Card className="flex-[3] min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Declaration Queue
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {queueError ? (
                <Alert variant="destructive" className="m-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex items-center gap-2">
                    {(queueErr as any)?.message || 'Failed to load declaration queue.'}
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => refetchQueue()}>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : queueLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading queue…</span>
                </div>
              ) : (queue ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No declarations in queue.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Individual</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>PQ State</TableHead>

                        <TableHead>Declaration</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(queue ?? []).map((row: any) => {
                        const indiv = row.fp_individuals as any;
                        const ds = declStatus(row.status);
                        const pq = (row.pq_state ?? 'draft') as PqState;
                        const pqMeta = PQ_STATE_META[pq] ?? PQ_STATE_META.draft;

                        return (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium text-sm">
                              {indiv?.full_name ?? '—'}
                              {indiv?.national_id && (
                                <span className="block text-xs text-muted-foreground font-mono">
                                  {indiv.national_id}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs capitalize">
                              {row.assessment_type ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={ds.variant} className="text-xs">
                                {ds.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${pqMeta.className}`}>
                                {pqMeta.label}
                              </Badge>
                              {pq === 'amendment_required' && row.pq_amendment_reason && (
                                <span className="block text-xs text-muted-foreground mt-0.5 max-w-[220px] truncate">
                                  {row.pq_amendment_reason}
                                </span>
                              )}
                            </TableCell>

                            <TableCell>
                              {row.declaration_data ? (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                  <CheckCheck className="h-3 w-3" />
                                  {(row.declaration_data as any).channel ?? 'Set'}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Not requested</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground tabular-nums">
                              {fmtDate(row.created_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {(() => {
                                  const isThisRowSending = sendReminder.isPending && sendReminder.variables?.assessmentId === row.id;
                                  return (
                                    <Button data-rbac="fit_and_proper.edit"
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      disabled={sendReminder.isPending || !canRequestDeclaration(row.status)}
                                      onClick={() => sendReminder.mutate({ assessmentId: row.id, individualId: row.individual_id })}
                                    >
                                      {isThisRowSending
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <Bell className="h-3 w-3" />}
                                      <span className="ml-1">Remind</span>
                                    </Button>
                                  );
                                })()}
                                <AssessmentDetailDialog row={row} />
                                {pq === 'submitted' && (
                                  <FpPqAmendmentDialog
                                    assessmentId={row.id}
                                    invalidateKeys={[['fpa_declaration_queue'], ['fpa_declaration_stats']]}
                                  />
                                )}

                                <HistoryButton
                                  entityType="fp_assessment"
                                  entityId={row.id}
                                  title="Declaration history"
                                  size="sm"
                                  variant="ghost"
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── right: notification log (40%) ── */}
          <Card className="flex-[2] min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Notification Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              {notifError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex items-center gap-2">
                    Failed to load notification log.
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => refetchNotif()}>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : notifLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading…</span>
                </div>
              ) : displayNotifs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No notifications found.
                </p>
              ) : (
                <ol className="space-y-0">
                  {displayNotifs.map((entry: any, idx: number) => {
                    const id = entry.entry_id ?? entry.id;
                    const action = entry.action_type ?? '';
                    const colorClass = ACTION_COLORS[action] ?? 'bg-muted text-muted-foreground border-border';
                    const ts = entry.timestamp;
                    const isLast = idx === displayNotifs.length - 1;

                    return (
                      <li key={id} className="flex gap-3">
                        {/* timeline spine */}
                        <div className="flex flex-col items-center">
                          <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
                            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          {!isLast && <div className="w-px flex-1 bg-border my-1" />}
                        </div>

                        {/* content */}
                        <div className={`mb-4 flex-1 ${isLast ? '' : ''}`}>
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <Badge
                              variant="outline"
                              className={`text-xs px-1.5 py-0 ${colorClass}`}
                            >
                              {action.replace(/_/g, ' ')}
                            </Badge>
                            {entry.user_role && (
                              <span className="text-xs text-muted-foreground">
                                · {entry.user_role}
                              </span>
                            )}
                          </div>
                          {entry.justification && (
                            <p className="text-xs text-foreground leading-snug mt-0.5">
                              {entry.justification}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                            {fmtDate(ts)} at {fmtTime(ts)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
