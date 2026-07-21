import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { canRequestDeclaration } from '@/lib/fpaAssessmentStatus';
import { logFpAction } from '@/lib/fpAudit';
import {
  FileText,
  RefreshCw,
  Zap,
  CalendarDays,
  Loader2,
  ArrowRight,
  ClipboardList,
  Send,
  CheckCheck,
  Copy,
  AlertCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers (shared with FpaDeclarations logic)
// ---------------------------------------------------------------------------

async function generateToken(): Promise<{ raw: string; hash: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const raw = Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { raw, hash };
}

async function computeVerificationHash(dob: string, last4: string): Promise<string> {
  const input = `${dob}|${last4.toUpperCase()}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PathwayType = 'initial' | 'ongoing_monitoring' | 'triggered' | 'cycle';

interface Pathway {
  type: PathwayType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: {
    border: string;
    iconBg: string;
    iconColor: string;
    badgeBg: string;
    badgeText: string;
    btn: string;
  };
}

interface Individual {
  id: string;
  full_name: string;
  national_id: string | null;
  passport_number: string | null;
}

interface AssessmentRow {
  id: string;
  individual_id: string | null;
  assessment_type: string;
  status: string;
  created_at: string;
  fp_individuals: { id: string; full_name: string } | null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PATHWAYS: Pathway[] = [
  {
    type: 'initial',
    label: 'New Licence Application',
    description:
      'Triggered when a new licence application is submitted. Links to application ID.',
    icon: FileText,
    color: {
      border: 'border-blue-200 hover:border-blue-400',
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-800',
      btn: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  },
  {
    type: 'ongoing_monitoring',
    label: 'Ongoing Monitoring',
    description: 'Periodic reassessment of existing regulated persons.',
    icon: RefreshCw,
    color: {
      border: 'border-emerald-200 hover:border-emerald-400',
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-800',
      btn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    },
  },
  {
    type: 'triggered',
    label: 'Ad-hoc / Triggered',
    description:
      'Event-triggered assessment: complaint, media alert, or regulator referral.',
    icon: Zap,
    color: {
      border: 'border-orange-200 hover:border-orange-400',
      iconBg: 'bg-orange-50',
      iconColor: 'text-orange-600',
      badgeBg: 'bg-orange-100',
      badgeText: 'text-orange-800',
      btn: 'bg-orange-500 hover:bg-orange-600 text-white',
    },
  },
  {
    type: 'cycle',
    label: 'Cycle-Based',
    description: 'Scheduled cycle reassessment per regulatory timetable.',
    icon: CalendarDays,
    color: {
      border: 'border-purple-200 hover:border-purple-400',
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      badgeBg: 'bg-purple-100',
      badgeText: 'text-purple-800',
      btn: 'bg-purple-600 hover:bg-purple-700 text-white',
    },
  },
];

const TYPE_BADGE: Record<string, string> = {
  initial: 'bg-blue-100 text-blue-800',
  ongoing_monitoring: 'bg-emerald-100 text-emerald-800',
  triggered: 'bg-orange-100 text-orange-800',
  cycle: 'bg-purple-100 text-purple-800',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-800',
  screening: 'bg-amber-100 text-amber-800',
  determined: 'bg-green-100 text-green-800',
  closed: 'bg-slate-100 text-slate-600',
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FpaInitiation() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // ── Initiation dialog state ──────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPathway, setSelectedPathway] = useState<Pathway | null>(null);

  // Form state
  const [individualSearch, setIndividualSearch] = useState('');
  const [selectedIndividualId, setSelectedIndividualId] = useState('');
  const [triggerNote, setTriggerNote] = useState('');
  const [linkedAppId, setLinkedAppId] = useState('');
  const [appSearch, setAppSearch] = useState('');
  const [selectedAppNumber, setSelectedAppNumber] = useState('');

  // ── Declaration request dialog state ────────────────────────────────────
  const [declDialogOpen, setDeclDialogOpen] = useState(false);
  const [declAssessmentId, setDeclAssessmentId] = useState('');
  const [declIndividualId, setDeclIndividualId] = useState('');
  const [declIndividualName, setDeclIndividualName] = useState('');
  const [declAssessmentLabel, setDeclAssessmentLabel] = useState('');
  const [declRecipientEmail, setDeclRecipientEmail] = useState('');
  const [declNote, setDeclNote] = useState('');
  const [declPortalLink, setDeclPortalLink] = useState('');
  const [declSubmitted, setDeclSubmitted] = useState(false);
  const [declCopied, setDeclCopied] = useState(false);
  const [declVerifHash, setDeclVerifHash] = useState('');
  const [declVerifSource, setDeclVerifSource] = useState<'auto' | 'manual' | null>(null);
  const [declManualDob, setDeclManualDob] = useState('');
  const [declManualLast4, setDeclManualLast4] = useState('');

  // ── Application ID search ────────────────────────────────────────────────
  const {
    data: appList = [],
    isFetching: searchingApps,
  } = useQuery<{ id: string; application_number: string; license_type: string; status: string }[]>({
    queryKey: ['applications_search', appSearch],
    enabled: appSearch.trim().length >= 2 && !selectedAppNumber,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('id, application_number, license_type, status')
        .ilike('application_number', `%${appSearch.trim()}%`)
        .not('status', 'in', '(approved,rejected,draft,cancelled)')
        .limit(10);
      if (error) throw error;
      return (data ?? []) as { id: string; application_number: string; license_type: string; status: string }[];
    },
  });

  function handleAppSelect(appNum: string) {
    setAppSearch(appNum);
    setSelectedAppNumber(appNum);
    setLinkedAppId(appNum);
  }

  // ── Individual search ────────────────────────────────────────────────────
  const {
    data: individualList = [],
    isFetching: searchingIndividuals,
    isError: searchError,
  } = useQuery<Individual[]>({
    queryKey: ['fp_individuals_search', individualSearch],
    enabled: individualSearch.trim().length >= 2,
    queryFn: async () => {
      // Match on national_id/passport_number as well as name — the dedup
      // this search exists to support (don't create a second fp_individuals
      // row for someone already on file) can miss an existing record whose
      // name is spelled differently but whose identity document matches.
      // Strip commas: PostgREST's .or() uses them as the condition delimiter,
      // so a literal comma in the search text would otherwise break parsing.
      const term = individualSearch.trim().replace(/,/g, '');
      const { data, error } = await supabase
        .from('fp_individuals')
        .select('id, full_name, national_id, passport_number')
        .or(`full_name.ilike.%${term}%,national_id.ilike.%${term}%,passport_number.ilike.%${term}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Individual[];
    },
  });

  // ── Recent assessments ───────────────────────────────────────────────────
  const {
    data: recentAssessments = [],
    isLoading: loadingAssessments,
    isError: assessmentsError,
  } = useQuery<AssessmentRow[]>({
    queryKey: ['fp_recent_assessments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('id, individual_id, assessment_type, status, created_at, fp_individuals(id, full_name)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as AssessmentRow[];
    },
  });

  // ── Selected individual's current role (to attach role_id to the new
  // assessment — previously the insert never set it, leaving "which
  // appointment triggered this assessment" modeled in the schema but never
  // populated). Only auto-attaches when the individual has exactly one
  // current role on file; with more than one it's ambiguous which role the
  // assessment concerns, so it's left unset rather than guessed.
  const { data: selectedIndividualRoles = [] } = useQuery<
    Array<{ id: string; licensee_id: string | null; role_type: string | null }>
  >({
    queryKey: ['fp_individual_current_roles', selectedIndividualId],
    enabled: !!selectedIndividualId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individual_roles')
        .select('id, licensee_id, role_type')
        .eq('individual_id', selectedIndividualId)
        .eq('is_current', true);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; licensee_id: string | null; role_type: string | null }>;
    },
  });

  // ── Individual detail for declaration verification hash ──────────────────
  const { data: declIndividualData } = useQuery<{ id: string; date_of_birth: string | null; national_id: string | null } | null>({
    queryKey: ['fp_individual_detail_decl', declIndividualId],
    enabled: !!declIndividualId && declDialogOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individuals')
        .select('id, date_of_birth, national_id')
        .eq('id', declIndividualId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; date_of_birth: string | null; national_id: string | null } | null;
    },
  });

  // Auto-compute verification hash when individual data loads
  useEffect(() => {
    if (!declIndividualData || !declDialogOpen) return;
    const { date_of_birth, national_id } = declIndividualData;
    if (date_of_birth && national_id && national_id.length >= 4) {
      const last4 = national_id.slice(-4);
      computeVerificationHash(date_of_birth, last4).then((hash) => {
        setDeclVerifHash(hash);
        setDeclVerifSource('auto');
      });
    } else {
      setDeclVerifSource('manual');
    }
  }, [declIndividualData, declDialogOpen]);

  // ── Assessment detail dialog ─────────────────────────────────────────────
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentRow | null>(null);

  function openAssessmentDetail(row: AssessmentRow) {
    setSelectedAssessment(row);
    setDetailDialogOpen(true);
  }

  // ── Open declaration dialog (pre-filled) ─────────────────────────────────
  function openDeclDialog(individualId: string, individualName: string, assessmentId: string, assessmentLabel: string) {
    setDeclAssessmentId(assessmentId);
    setDeclIndividualId(individualId);
    setDeclIndividualName(individualName);
    setDeclAssessmentLabel(assessmentLabel);
    setDeclRecipientEmail('');
    setDeclNote('');
    setDeclPortalLink('');
    setDeclSubmitted(false);
    setDeclCopied(false);
    setDeclVerifHash('');
    setDeclVerifSource(null);
    setDeclManualDob('');
    setDeclManualLast4('');
    setDeclDialogOpen(true);
  }

  async function handleDeclManualVerifChange(dob: string, last4: string) {
    setDeclManualDob(dob);
    setDeclManualLast4(last4);
    if (dob && last4.length === 4) {
      const hash = await computeVerificationHash(dob, last4);
      setDeclVerifHash(hash);
    } else {
      setDeclVerifHash('');
    }
  }

  function copyDeclLink() {
    navigator.clipboard.writeText(declPortalLink).then(() => {
      setDeclCopied(true);
      setTimeout(() => setDeclCopied(false), 2000);
    });
  }

  // ── Initiation mutation ──────────────────────────────────────────────────
  const initiateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIndividualId) throw new Error('Select an individual');
      if (!selectedPathway) throw new Error('No pathway selected');

      const declarationData: Record<string, string> = {
        trigger_note: triggerNote,
      };
      const appIdValue = linkedAppId || appSearch.trim();
      if (selectedPathway.type === 'initial' && appIdValue) {
        declarationData.linked_application_id = appIdValue;
      }

      const singleRole = selectedIndividualRoles.length === 1 ? selectedIndividualRoles[0] : null;

      const { data, error } = await supabase.from('fp_assessments').insert({
        individual_id: selectedIndividualId,
        assessment_type: selectedPathway.type,
        status: 'draft',
        declaration_data: declarationData,
        created_by: user?.id ?? null,
        role_id: singleRole?.id ?? null,
        licensee_id: singleRole?.licensee_id ?? null,
      }).select('id').single();
      if (error) throw error;
      await logFpAction('fp.assessment.created', 'fp_assessment', data.id, {
        after: {
          assessment_type: selectedPathway.type,
          individual_id: selectedIndividualId,
          ...(appIdValue ? { linked_application_id: appIdValue } : {}),
        },
        context: { individualId: selectedIndividualId, assessmentId: data.id },
      });
      return { assessmentId: data.id };
    },
    onSuccess: ({ assessmentId }) => {
      toast.success('Assessment initiated');
      setDialogOpen(false);
      // Capture before resetForm clears them
      const indivId = selectedIndividualId;
      const indivName = individualSearch;
      const pathwayLabel = selectedPathway ? capitalize(selectedPathway.type) : 'Assessment';
      resetForm();
      qc.invalidateQueries({ queryKey: ['fp_recent_assessments'] });
      // Open declaration request dialog pre-filled with the new assessment
      openDeclDialog(indivId, indivName, assessmentId, `${pathwayLabel} · draft`);
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to initiate assessment');
    },
  });

  // ── Declaration request mutation ─────────────────────────────────────────
  const requestDeclarationMutation = useMutation({
    mutationFn: async () => {
      if (!declAssessmentId) throw new Error('Assessment not selected');
      if (!declIndividualId) throw new Error('Individual not selected');
      if (!declVerifHash) throw new Error('Verification hash not ready. Ensure the individual has a date of birth and national ID on file, or enter them manually.');

      const { raw: rawToken, hash: tokenHash } = await generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error: invError } = await supabase
        .from('declaration_invitations' as any)
        .insert({
          individual_id: declIndividualId,
          assessment_id: declAssessmentId,
          token_hash: tokenHash,
          verification_hash: declVerifHash,
          channel: 'EMAIL',
          recipient_email: declRecipientEmail.trim() || null,
          status: 'PENDING',
          expires_at: expiresAt,
        });
      if (invError) throw invError;

      const { data: existing } = await supabase
        .from('fp_assessments' as any)
        .select('declaration_data')
        .eq('id', declAssessmentId)
        .single();

      const prev = (existing as any)?.declaration_data ?? {};
      const merged = {
        ...prev,
        channel: 'EMAIL',
        requested_at: new Date().toISOString(),
        note: declNote.trim() || null,
      };

      const { error: updateError } = await supabase
        .from('fp_assessments' as any)
        .update({ declaration_data: merged })
        .eq('id', declAssessmentId);
      if (updateError) throw updateError;

      await supabase.rpc('log_compliance_audit' as any, {
        _action_type: 'NOTIFICATION_SENT',
        _object_type: 'fp_assessment',
        _object_id: declAssessmentId,
        _justification: 'Declaration invitation created via EMAIL channel from Assessment Initiation',
      });

      // Send the invitation email with the secure portal link
      const portalLink = `${window.location.origin}/declaration/${rawToken}`;
      let emailSent = false;
      if (declRecipientEmail.trim()) {
        const emailSubject = 'Fit & Proper Declaration — Action Required';
        const emailText = [
          `Dear ${declIndividualName || 'Applicant'},`,
          '',
          'You have been invited to complete a Fit & Proper Personal Questionnaire Declaration.',
          '',
          'Please use the link below to access the secure declaration form:',
          portalLink,
          '',
          'When prompted, verify your identity using your date of birth and the last 4 digits of your national ID.',
          '',
          'This link expires in 7 days. If you did not expect this request, please disregard this message.',
          '',
          'Regards,',
          'The Compliance Team',
        ].join('\n');
        const emailHtml = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
            <h2 style="margin-top:0;color:#111827">Fit &amp; Proper Declaration — Action Required</h2>
            <p>Dear <strong>${declIndividualName || 'Applicant'}</strong>,</p>
            <p>You have been invited to complete a <strong>Fit &amp; Proper Personal Questionnaire Declaration</strong>.</p>
            <p>Click the button below to access the secure declaration form:</p>
            <p style="text-align:center;margin:32px 0">
              <a href="${portalLink}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
                Complete Declaration Form
              </a>
            </p>
            <p style="font-size:13px;color:#6b7280">Or copy this link into your browser:<br>
              <span style="word-break:break-all;color:#2563eb">${portalLink}</span>
            </p>
            <p>When prompted, you will need your <strong>date of birth</strong> and the <strong>last 4 digits of your national ID</strong> to verify your identity.</p>
            <p style="color:#dc2626;font-size:13px">⚠ This link expires in 7 days.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
            <p style="font-size:12px;color:#9ca3af">This is an automated message from the Regulatory Compliance Portal. Do not reply to this email.</p>
          </div>`;

        try {
          const { data: emailResult } = await supabase.functions.invoke('send-notification', {
            body: { type: 'email', to: declRecipientEmail.trim(), subject: emailSubject, body: emailText, html: emailHtml },
          });
          emailSent = emailResult?.success === true;
        } catch {
          // Email send threw — invitation row is still valid; caller gets a warning
        }
      }

      return { rawToken, emailSent, recipientEmail: declRecipientEmail.trim() };
    },
    onSuccess: ({ rawToken, emailSent, recipientEmail }: { rawToken: string; emailSent: boolean; recipientEmail: string }) => {
      if (recipientEmail && !emailSent) {
        toast.warning('Invitation created but email could not be sent — SMTP may not be configured. Share the portal link below manually.');
      } else {
        toast.success(recipientEmail ? `Declaration request sent to ${recipientEmail}` : 'Declaration invitation created');
      }
      qc.invalidateQueries({ queryKey: ['fp_recent_assessments'] });
      const link = `${window.location.origin}/declaration/${rawToken}`;
      setDeclPortalLink(link);
      setDeclSubmitted(true);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to send declaration request'),
  });

  // ── Initiation form helpers ──────────────────────────────────────────────
  function openDialog(pathway: Pathway) {
    setSelectedPathway(pathway);
    resetForm();
    setDialogOpen(true);
  }

  function resetForm() {
    setIndividualSearch('');
    setSelectedIndividualId('');
    setTriggerNote('');
    setLinkedAppId('');
    setAppSearch('');
    setSelectedAppNumber('');
  }

  function handleIndividualSelect(id: string) {
    setSelectedIndividualId(id);
    const found = individualList.find((i) => i.id === id);
    if (found) setIndividualSearch(found.full_name);
  }

  const canSubmit = !!selectedIndividualId && !initiateMutation.isPending;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Assessment Initiation"
          description="Initiate Fit & Proper assessments via 4 pathways — FPA-001"
        />

        {/* Pathway tiles — 2x2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PATHWAYS.map((pathway) => {
            const Icon = pathway.icon;
            return (
              <Card
                key={pathway.type}
                className={`border-2 transition-colors duration-150 cursor-default ${pathway.color.border}`}
              >
                <CardContent className="p-5 flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`rounded-lg p-2.5 flex-shrink-0 ${pathway.color.iconBg}`}>
                      <Icon className={`h-5 w-5 ${pathway.color.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-foreground leading-snug">
                          {pathway.label}
                        </h3>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${pathway.color.badgeBg} ${pathway.color.badgeText}`}>
                          {pathway.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {pathway.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button data-rbac="fit_and_proper.edit"
                      size="sm"
                      className={`gap-1.5 text-xs h-8 ${pathway.color.btn}`}
                      onClick={() => openDialog(pathway)}
                    >
                      Initiate
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Initiate Assessment Dialog ── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedPathway && (
                  <>
                    {(() => {
                      const Icon = selectedPathway.icon;
                      return (
                        <span className={`inline-flex rounded-md p-1.5 ${selectedPathway.color.iconBg}`}>
                          <Icon className={`h-4 w-4 ${selectedPathway.color.iconColor}`} />
                        </span>
                      );
                    })()}
                    Initiate — {selectedPathway.label}
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Individual search */}
              <div className="space-y-1.5">
                <Label htmlFor="individual-search">
                  Individual <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="individual-search"
                  placeholder="Type at least 2 characters to search…"
                  value={individualSearch}
                  onChange={(e) => {
                    setIndividualSearch(e.target.value);
                    if (selectedIndividualId) setSelectedIndividualId('');
                  }}
                  autoComplete="off"
                />
                {searchingIndividuals && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                  </p>
                )}
                {searchError && (
                  <p className="text-xs text-destructive">Search failed. Please try again.</p>
                )}
                {!searchingIndividuals && !searchError && individualSearch.trim().length >= 2 && individualList.length === 0 && (
                  <p className="text-xs text-muted-foreground">No individuals found.</p>
                )}
                {individualList.length > 0 && !selectedIndividualId && (
                  <div className="border rounded-md overflow-hidden max-h-40 overflow-y-auto">
                    {individualList.map((ind) => (
                      <button
                        key={ind.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between gap-2"
                        onClick={() => handleIndividualSelect(ind.id)}
                      >
                        <span className="font-medium">{ind.full_name}</span>
                        {(ind.national_id || ind.passport_number) && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {ind.national_id || ind.passport_number}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {selectedIndividualId && (
                  <p className="text-xs text-emerald-700 font-medium">Selected: {individualSearch}</p>
                )}
              </div>

              {/* Assessment type — read-only */}
              <div className="space-y-1.5">
                <Label>Assessment Type</Label>
                <div className="flex items-center h-9 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                  {selectedPathway ? capitalize(selectedPathway.type) : '—'}
                </div>
              </div>

              {/* Linked application ID — only for initial */}
              {selectedPathway?.type === 'initial' && (
                <div className="space-y-1.5">
                  <Label htmlFor="linked-app-id">Linked Application ID</Label>
                  <Input
                    id="linked-app-id"
                    placeholder="Type 2+ characters to search…"
                    value={appSearch}
                    autoComplete="off"
                    onChange={(e) => {
                      setAppSearch(e.target.value);
                      if (selectedAppNumber) {
                        setSelectedAppNumber('');
                        setLinkedAppId('');
                      }
                    }}
                  />
                  {searchingApps && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                    </p>
                  )}
                  {!searchingApps && appSearch.trim().length >= 2 && !selectedAppNumber && appList.length === 0 && (
                    <p className="text-xs text-muted-foreground">No applications found.</p>
                  )}
                  {appList.length > 0 && !selectedAppNumber && (
                    <div className="border rounded-md overflow-hidden max-h-48 overflow-y-auto">
                      {appList.map((app) => (
                        <button
                          key={app.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex flex-col gap-0.5"
                          onClick={() => handleAppSelect(app.application_number)}
                        >
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {app.application_number}
                          </span>
                          <span className="text-xs text-muted-foreground truncate w-full" style={{ maxWidth: '330px', whiteSpace: 'normal' }}>
                            {app.license_type}
                            {app.status && (
                              <span className={`ml-2 inline-flex items-center rounded px-1 py-0 text-[10px] font-medium ${
                                app.status === 'approved' ? 'bg-green-100 text-green-700' :
                                app.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                                app.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {app.status}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedAppNumber && (
                    <p className="text-xs text-emerald-700 font-medium">Selected: {selectedAppNumber}</p>
                  )}
                </div>
              )}

              {/* Trigger note */}
              <div className="space-y-1.5">
                <Label htmlFor="trigger-note">Trigger Note</Label>
                <Textarea
                  id="trigger-note"
                  placeholder="Reason or reference for this assessment…"
                  value={triggerNote}
                  onChange={(e) => setTriggerNote(e.target.value)}
                  className="resize-none h-24"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button data-rbac="fit_and_proper.edit"
                size="sm"
                disabled={!canSubmit}
                onClick={() => initiateMutation.mutate()}
                className="gap-1.5"
              >
                {initiateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Initiate Assessment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Declaration Request Dialog (pre-filled, email-only) ── */}
        <Dialog open={declDialogOpen} onOpenChange={(o) => {
          setDeclDialogOpen(o);
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                Request Declaration
              </DialogTitle>
            </DialogHeader>

            {!declSubmitted ? (
              <div className="space-y-4 py-1">
                {/* Individual — read-only */}
                <div className="space-y-1.5">
                  <Label>Individual</Label>
                  <div className="flex items-center h-9 rounded-md border bg-muted/40 px-3 text-sm font-medium">
                    {declIndividualName || '—'}
                  </div>
                </div>

                {/* Assessment — read-only */}
                <div className="space-y-1.5">
                  <Label>Assessment</Label>
                  <div className="flex items-center h-9 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                    {declAssessmentLabel || '—'}
                  </div>
                </div>

                {/* Delivery Channel — fixed to Email */}
                <div className="space-y-1.5">
                  <Label>Delivery Channel</Label>
                  <div className="flex items-center h-9 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                    Email
                  </div>
                </div>

                {/* Identity gate status */}
                {declVerifSource === 'auto' && (
                  <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                    <CheckCheck className="h-3.5 w-3.5 shrink-0" />
                    Identity gate ready — DOB and national ID loaded from profile.
                  </div>
                )}
                {declVerifSource === 'manual' && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2.5">
                    <div className="flex items-start gap-2 text-xs text-amber-800">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        This individual is missing a date of birth or national ID on their profile.
                        Enter the values below to set the identity gate the portal will verify against.
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Date of Birth <span className="text-red-500">*</span></Label>
                        <Input
                          type="date"
                          value={declManualDob}
                          onChange={(e) => handleDeclManualVerifChange(e.target.value, declManualLast4)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Last 4 of National ID <span className="text-red-500">*</span></Label>
                        <Input
                          type="text"
                          maxLength={4}
                          placeholder="e.g. 5993"
                          value={declManualLast4}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                            handleDeclManualVerifChange(declManualDob, v);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {declVerifSource === null && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading individual profile…
                  </div>
                )}

                {/* Recipient email */}
                <div className="space-y-1.5">
                  <Label htmlFor="decl-email">Recipient Email</Label>
                  <Input
                    id="decl-email"
                    type="email"
                    placeholder="applicant@example.com"
                    value={declRecipientEmail}
                    onChange={(e) => setDeclRecipientEmail(e.target.value)}
                  />
                </div>

                {/* Note */}
                <div className="space-y-1.5">
                  <Label htmlFor="decl-note">Note (optional)</Label>
                  <Textarea
                    id="decl-note"
                    rows={3}
                    placeholder="Internal note about this declaration request…"
                    value={declNote}
                    onChange={(e) => setDeclNote(e.target.value)}
                    className="resize-none"
                  />
                </div>
              </div>
            ) : (
              /* Post-submit confirmation */
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
                      {declPortalLink}
                    </code>
                    <Button size="icon" variant="outline" onClick={copyDeclLink} className="flex-shrink-0">
                      {declCopied ? <CheckCheck className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              {!declSubmitted ? (
                <>
                  <Button variant="ghost" onClick={() => setDeclDialogOpen(false)}>
                    Skip for now
                  </Button>
                  <Button data-rbac="fit_and_proper.edit"
                    onClick={() => requestDeclarationMutation.mutate()}
                    disabled={requestDeclarationMutation.isPending || !declVerifHash}
                  >
                    {requestDeclarationMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Send className="h-4 w-4 mr-2" />
                    Send Request
                  </Button>
                </>
              ) : (
                <Button onClick={() => setDeclDialogOpen(false)}>
                  Close
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Recent initiations */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              Recent Initiations
              <span className="text-xs font-normal text-muted-foreground ml-1">Last 20 records</span>
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {loadingAssessments ? (
              <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading assessments…
              </div>
            ) : assessmentsError ? (
              <div className="py-12 text-center text-sm text-destructive">
                Failed to load assessments. Please refresh and try again.
              </div>
            ) : recentAssessments.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No assessments have been initiated yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Individual</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="pr-4 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentAssessments.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="pl-4 font-medium">
                          {row.fp_individuals ? (
                            <Link
                              to={`/fpa/individuals/${row.fp_individuals.id}`}
                              className="text-primary hover:underline underline-offset-4"
                            >
                              {row.fp_individuals.full_name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium ${TYPE_BADGE[row.assessment_type] ?? 'bg-slate-100 text-slate-700'}`}
                          >
                            {capitalize(row.assessment_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium ${STATUS_BADGE[row.status] ?? 'bg-slate-100 text-slate-700'}`}
                          >
                            {capitalize(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {fmtDate(row.created_at)}
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => openAssessmentDetail(row)}
                          >
                            View
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Assessment detail dialog ── */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                Assessment Details
              </DialogTitle>
            </DialogHeader>
            {selectedAssessment && (
              <div className="space-y-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Individual</span>
                  <span className="font-medium">{selectedAssessment.fp_individuals?.full_name ?? '—'}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium ${TYPE_BADGE[selectedAssessment.assessment_type] ?? 'bg-slate-100 text-slate-700'}`}
                  >
                    {capitalize(selectedAssessment.assessment_type)}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium ${STATUS_BADGE[selectedAssessment.status] ?? 'bg-slate-100 text-slate-700'}`}
                  >
                    {capitalize(selectedAssessment.status)}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="tabular-nums">{fmtDate(selectedAssessment.created_at)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assessment ID</span>
                  <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                    {selectedAssessment.id}
                  </span>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDetailDialogOpen(false)}>
                Close
              </Button>
              {selectedAssessment && selectedAssessment.individual_id && canRequestDeclaration(selectedAssessment.status) && (
                <Button data-rbac="fit_and_proper.edit"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setDetailDialogOpen(false);
                    openDeclDialog(
                      selectedAssessment.individual_id!,
                      selectedAssessment.fp_individuals?.full_name ?? '',
                      selectedAssessment.id,
                      `${capitalize(selectedAssessment.assessment_type)} · ${capitalize(selectedAssessment.status)}`,
                    );
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Request Declaration
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
