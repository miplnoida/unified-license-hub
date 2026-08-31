import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { fpDeclarationInvitationCreate, fpDeclarationInvitationResend } from '@/lib/fpGovernedOps';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logFpAction } from '@/lib/fpAudit';
import { getAssessmentEntityName } from '@/lib/fpDeclarationInvitation';
import { canRequestDeclaration } from '@/lib/fpaAssessmentStatus';
import { Loader2, Plus, Copy, Check, RefreshCw } from 'lucide-react';
import { publicAppUrl } from '@/lib/publicAppUrl';

// ── Status badge config ────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  PENDING:   'bg-slate-100 text-slate-700',
  SENT:      'bg-blue-100 text-blue-800',
  OPENED:    'bg-amber-100 text-amber-800',
  SUBMITTED: 'bg-green-100 text-green-800',
  EXPIRED:   'bg-red-100 text-red-800',
  RESENT:    'bg-purple-100 text-purple-800',
};

const STATUS_OPTIONS = ['All', 'PENDING', 'SENT', 'OPENED', 'SUBMITTED', 'EXPIRED', 'RESENT'] as const;
const CHANNEL_OPTIONS = ['EMAIL', 'SMS', 'BOTH'] as const;

// ── Utility: SubtleCrypto SHA-256 hex ─────────────────────────────────────
async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Utility: format date ───────────────────────────────────────────────────
function fmtDate(val: string | null): string {
  if (!val) return '—';
  return new Date(val).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function isExpired(val: string | null): boolean {
  if (!val) return false;
  return new Date(val) < new Date();
}

export default function FpaInvitationTracker() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // ── Send Invitation dialog ─────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIndividualId, setSelectedIndividualId] = useState('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [channel, setChannel] = useState<'EMAIL' | 'SMS' | 'BOTH'>('EMAIL');
  const [invDob, setInvDob] = useState('');
  const [invLast4, setInvLast4] = useState('');

  // Generated URL state
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Main data query ────────────────────────────────────────────────────────
  const { data: rows, isLoading } = useQuery({
    queryKey: ['declaration_invitations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('declaration_invitations')
        .select('*, fp_individuals(id, full_name, email, national_id), fp_assessments(id, assessment_type, status)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Individuals for the dialog dropdown ───────────────────────────────────
  const { data: individuals } = useQuery({
    queryKey: ['fp_individuals_dropdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individuals')
        .select('id, full_name, email')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string; email: string | null }[];
    },
  });

  // ── Assessments for the selected individual ────────────────────────────────
  const { data: assessments } = useQuery({
    queryKey: ['fp_assessments_for_individual', selectedIndividualId],
    enabled: !!selectedIndividualId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('id, assessment_type, status')
        .eq('individual_id', selectedIndividualId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; assessment_type: string; status: string }[];
    },
  });

  // ── Send invitation mutation ───────────────────────────────────────────────
  const sendInvitation = useMutation({
    mutationFn: async () => {
      if (!selectedIndividualId) throw new Error('Select an individual');
      if (!selectedAssessmentId) throw new Error('Select an assessment');
      if (!invDob) throw new Error('Date of birth is required');
      if (invLast4.length !== 4) throw new Error('Last 4 digits of national ID or passport number required');
      if (!user?.id) throw new Error('Not authenticated');

      // a. Generate raw token
      const rawToken = crypto.randomUUID();

      // b. token_hash = SHA-256 of rawToken
      const token_hash = await sha256hex(rawToken);

      // c. verification_hash = SHA-256 of "dob|LAST4ID"
      const verification_hash = await sha256hex(`${invDob}|${invLast4.toUpperCase()}`);

      // d. Look up individual's email
      const individual = individuals?.find((i) => i.id === selectedIndividualId);

      // e. Insert
      const created = await fpDeclarationInvitationCreate({
        assessmentId: selectedAssessmentId,
        individualId: selectedIndividualId,
        tokenHash: token_hash,
        verificationHash: verification_hash,
        channel: channel as any,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        recipientEmail: individual?.email ?? null,
      });

      // f. Build invitation URL
      const invUrl = await publicAppUrl(`/declaration/${rawToken}`);

      // g. Audit log
      await logFpAction('fp.invitation.created', 'declaration_invitation', created.invitation_id, {
        after: {
          individual_id: selectedIndividualId,
          assessment_id: selectedAssessmentId,
          channel,
        },
        context: {
          individualId: selectedIndividualId,
          assessmentId: selectedAssessmentId,
        },
      });

      return { invUrl, newId: created.invitation_id };
    },
    onSuccess: ({ invUrl }) => {
      setGeneratedUrl(invUrl);
      qc.invalidateQueries({ queryKey: ['declaration_invitations'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to send invitation'),
  });

  // ── Resend mutation ────────────────────────────────────────────────────────
  // Only the SHA-256 hash of the original token was ever stored, so the old
  // portal link can't be recovered or literally re-sent — a real resend
  // mints a fresh token/invitation (reusing the same verification_hash and
  // channel), expires the old one, and actually emails the new link instead
  // of just flipping a status flag with no message going anywhere.
  const resend = useMutation({
    mutationFn: async (row: any) => {
      const recipientEmail: string = row.fp_individuals?.email || row.recipient_email || '';
      const { raw: rawToken, hash: tokenHash } = await (async () => {
        const rt = crypto.randomUUID();
        return { raw: rt, hash: await sha256hex(rt) };
      })();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await fpDeclarationInvitationResend({
        invitationId: row.id,
        tokenHash,
        expiresAt,
        recipientEmail: recipientEmail || null,
      });

      let emailSent = false;
      if (recipientEmail) {
        const portalLink = await publicAppUrl(`/declaration/${rawToken}`);
        const individualName = row.fp_individuals?.full_name || 'Applicant';
        const entityName = await getAssessmentEntityName(row.assessment_id);
        const entityLine = entityName ? ` in connection with your role at ${entityName}` : '';
        try {
          const { data: emailResult } = await supabase.functions.invoke('send-notification', {
            body: {
              type: 'email',
              to: recipientEmail,
              subject: 'Reminder: Fit & Proper Declaration — Action Required',
              body: `Dear ${individualName},\n\nThis is a reminder that your Fit & Proper Personal Questionnaire Declaration${entityLine} is still outstanding.\n\nPlease use the link below to access the secure declaration form:\n${portalLink}\n\nWhen prompted, verify your identity using your date of birth and the last 4 digits of your national ID or passport number.\n\nThis link expires in 7 days.\n\nRegards,\nThe Compliance Team`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a"><h2 style="margin-top:0;color:#111827">Reminder: Fit &amp; Proper Declaration</h2><p>Dear <strong>${individualName}</strong>,</p><p>This is a reminder that your <strong>Fit &amp; Proper Personal Questionnaire Declaration</strong>${entityName ? ` in connection with your role at <strong>${entityName}</strong>` : ''} is still outstanding.</p><p style="text-align:center;margin:32px 0"><a href="${portalLink}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Complete Declaration Form</a></p><p style="font-size:13px;color:#6b7280">Or copy this link into your browser:<br><span style="word-break:break-all;color:#2563eb">${portalLink}</span></p><p style="color:#dc2626;font-size:13px">⚠ This link expires in 7 days.</p></div>`,
            },
          });
          emailSent = emailResult?.success === true;
        } catch {
          // Email send threw — the new invitation row is still valid.
        }
      }

      await logFpAction('fp.invitation.resent', 'declaration_invitation', row.id, {
        before: { status: row.status },
        after: { status: 'EXPIRED', new_invitation_email_sent: emailSent },
        context: {
          individualId: row.individual_id,
          assessmentId: row.assessment_id,
        },
      });

      return { emailSent, recipientEmail };
    },
    onSuccess: ({ emailSent, recipientEmail }) => {
      if (recipientEmail && emailSent) {
        toast.success(`Reminder sent to ${recipientEmail}`);
      } else if (recipientEmail) {
        toast.warning('New invitation issued but email could not be sent — SMTP may not be configured.');
      } else {
        toast.warning('New invitation issued, but this individual has no email on file.');
      }
      qc.invalidateQueries({ queryKey: ['declaration_invitations'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Resend failed'),
  });

  // ── Client-side filtering ──────────────────────────────────────────────────
  const filtered = (rows ?? []).filter((r: any) => {
    const name: string = r.fp_individuals?.full_name ?? '';
    const matchesSearch = !search.trim() || name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ── Dialog reset ───────────────────────────────────────────────────────────
  function resetDialog() {
    setSelectedIndividualId('');
    setSelectedAssessmentId('');
    setChannel('EMAIL');
    setInvDob('');
    setInvLast4('');
    setGeneratedUrl(null);
    setCopied(false);
  }

  async function handleCopy() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Declaration Invitations"
          description="Track and manage personal questionnaire declaration invitations sent to individuals."
          backHref="/fpa/individuals"
          backLabel="Register"
          actions={
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) resetDialog();
              }}
            >
              <DialogTrigger asChild>
                <Button data-rbac="fit_and_proper.create">
                  <Plus className="h-4 w-4 mr-2" /> Send Invitation
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Send Declaration Invitation</DialogTitle>
                </DialogHeader>

                {!generatedUrl ? (
                  <div className="space-y-4">
                    {/* Individual */}
                    <div className="space-y-1">
                      <Label>Individual *</Label>
                      <Select
                        value={selectedIndividualId}
                        onValueChange={(v) => {
                          setSelectedIndividualId(v);
                          setSelectedAssessmentId('');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select individual…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(individuals ?? []).map((ind) => (
                            <SelectItem key={ind.id} value={ind.id}>
                              {ind.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Assessment */}
                    <div className="space-y-1">
                      <Label>Assessment *</Label>
                      <Select
                        value={selectedAssessmentId}
                        onValueChange={setSelectedAssessmentId}
                        disabled={!selectedIndividualId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select assessment…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(assessments ?? []).filter((a) => canRequestDeclaration(a.status)).map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.assessment_type} — {a.status}
                            </SelectItem>
                          ))}
                          {selectedIndividualId && (assessments ?? []).filter((a) => canRequestDeclaration(a.status)).length === 0 && (
                            <SelectItem value="__none__" disabled>
                              No assessments awaiting declaration
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Channel */}
                    <div className="space-y-1">
                      <Label>Channel *</Label>
                      <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CHANNEL_OPTIONS.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Identity verification fields */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="inv-dob">Date of birth *</Label>
                        <Input
                          id="inv-dob"
                          type="date"
                          value={invDob}
                          onChange={(e) => setInvDob(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="inv-last4">Last 4 national ID / passport *</Label>
                        <Input
                          id="inv-last4"
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="e.g. 1234"
                          value={invLast4}
                          onChange={(e) => setInvLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Show generated URL */
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Invitation created. Share this link with the individual:
                    </p>
                    <div className="flex items-center gap-2">
                      <Input value={generatedUrl} readOnly className="font-mono text-xs" />
                      <Button variant="outline" size="icon" onClick={handleCopy} title="Copy link">
                        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      This URL contains the raw token and will not be shown again. Copy it now and send it securely.
                    </p>
                  </div>
                )}

                <DialogFooter>
                  <Button variant="ghost" onClick={() => { setDialogOpen(false); resetDialog(); }}>
                    {generatedUrl ? 'Close' : 'Cancel'}
                  </Button>
                  {!generatedUrl && (
                    <Button data-rbac="fit_and_proper.create"
                      onClick={() => sendInvitation.mutate()}
                      disabled={
                        sendInvitation.isPending ||
                        !selectedIndividualId ||
                        !selectedAssessmentId ||
                        !invDob ||
                        invLast4.length !== 4
                      }
                    >
                      {sendInvitation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Generate Invitation
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Filter toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <Input
                placeholder="Search by individual name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No invitations found.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Individual</TableHead>
                      <TableHead>Assessment</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Opened At</TableHead>
                      <TableHead>Submitted At</TableHead>
                      <TableHead>Expires At</TableHead>
                      <TableHead>Failed</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r: any) => {
                      const expired = isExpired(r.expires_at);
                      return (
                        <TableRow key={r.id}>
                          {/* Individual */}
                          <TableCell className="font-medium whitespace-nowrap">
                            <Link
                              to={`/fpa/individuals/${r.individual_id}`}
                              className="hover:underline text-primary"
                            >
                              {r.fp_individuals?.full_name ?? r.individual_id}
                            </Link>
                          </TableCell>

                          {/* Assessment type */}
                          <TableCell className="text-xs whitespace-nowrap">
                            {r.fp_assessments?.assessment_type ?? '—'}
                          </TableCell>

                          {/* Channel */}
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {r.channel}
                            </Badge>
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs ${STATUS_BADGE[r.status] ?? 'bg-slate-100 text-slate-700'}`}
                            >
                              {r.status}
                            </Badge>
                          </TableCell>

                          {/* Sent At */}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(r.sent_at)}
                          </TableCell>

                          {/* Opened At */}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(r.opened_at)}
                          </TableCell>

                          {/* Submitted At */}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(r.submitted_at)}
                          </TableCell>

                          {/* Expires At */}
                          <TableCell
                            className={`text-xs whitespace-nowrap ${expired ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}
                          >
                            {fmtDate(r.expires_at)}
                          </TableCell>

                          {/* Failed attempts */}
                          <TableCell
                            className={`text-xs text-center ${r.failed_identity_attempts > 0 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}
                          >
                            {r.failed_identity_attempts ?? 0}
                          </TableCell>

                          {/* Actions */}
                          <TableCell>
                            {r.status !== 'SUBMITTED' && (
                              <Button data-rbac="fit_and_proper.create"
                                size="sm"
                                variant="ghost"
                                disabled={resend.isPending}
                                onClick={() => resend.mutate(r)}
                                title="Resend"
                              >
                                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Resend
                              </Button>
                            )}
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
      </div>
    </DashboardLayout>
  );
}
