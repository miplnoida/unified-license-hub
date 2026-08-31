import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { fpDeclarationInvitationCreate } from '@/lib/fpGovernedOps';
import { toast } from 'sonner';
import { Send, Loader2, CheckCheck, Copy, AlertCircle } from 'lucide-react';
import { generateToken, computeVerificationHash, computeIdentityHashes, getAssessmentEntityName } from '@/lib/fpDeclarationInvitation';

/**
 * The single "Request Declaration" flow for the F&P module — creates an
 * identity-gated invitation the individual uses to complete their own
 * declaration on the public portal, rather than staff filling it in on
 * their behalf. A Fit & Proper declaration is a self-attestation, so this
 * is the only path a draft assessment should move forward through.
 *
 * Shared between Assessment Initiation (/fpa/initiation) and an individual's
 * Assessment Detail view (/fpa/individuals/:id) — one implementation, two
 * trigger points.
 */
export function RequestDeclarationDialog({
  open,
  onOpenChange,
  individualId,
  individualName,
  assessmentId,
  assessmentLabel,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  individualId: string;
  individualName: string;
  assessmentId: string;
  assessmentLabel: string;
  onSent?: () => void;
}) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [note, setNote] = useState('');
  const [portalLink, setPortalLink] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  // The portal accepts either identity document's last 4 digits — verifHash
  // is whichever document is on file, verifHashAlt the second one when both
  // are (so the individual isn't locked out for using the "other" document).
  const [verifHash, setVerifHash] = useState('');
  const [verifHashAlt, setVerifHashAlt] = useState('');
  const [verifSource, setVerifSource] = useState<'auto' | 'manual' | null>(null);
  const [manualDob, setManualDob] = useState('');
  const [manualLast4, setManualLast4] = useState('');

  // Reset all local state whenever a new assessment/individual is targeted.
  useEffect(() => {
    if (!open) return;
    setRecipientEmail('');
    setNote('');
    setPortalLink('');
    setSubmitted(false);
    setCopied(false);
    setVerifHash('');
    setVerifHashAlt('');
    setVerifSource(null);
    setManualDob('');
    setManualLast4('');
  }, [open, assessmentId]);

  const { data: individualData } = useQuery<{
    id: string;
    date_of_birth: string | null;
    national_id: string | null;
    passport_number: string | null;
  } | null>({
    queryKey: ['fp_individual_detail_decl', individualId],
    enabled: !!individualId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individuals')
        .select('id, date_of_birth, national_id, passport_number')
        .eq('id', individualId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; date_of_birth: string | null; national_id: string | null; passport_number: string | null } | null;
    },
  });

  // Entity (licensee) this assessment concerns, if any — surfaced to staff
  // and mentioned in the invitation email so the individual knows which
  // appointment/entity the request relates to.
  const { data: entityName } = useQuery<string | null>({
    queryKey: ['fp_decl_entity_name', assessmentId],
    enabled: !!assessmentId && open,
    queryFn: () => getAssessmentEntityName(assessmentId),
  });

  useEffect(() => {
    if (!individualData || !open) return;
    (async () => {
      const { primary, alt } = await computeIdentityHashes(
        individualData.date_of_birth,
        individualData.national_id,
        individualData.passport_number,
      );
      if (primary) {
        setVerifHash(primary);
        setVerifHashAlt(alt);
        setVerifSource('auto');
      } else {
        setVerifSource('manual');
      }
    })();
  }, [individualData, open]);

  async function handleManualVerifChange(dob: string, last4: string) {
    setManualDob(dob);
    setManualLast4(last4);
    if (dob && last4.length === 4) {
      const hash = await computeVerificationHash(dob, last4);
      setVerifHash(hash);
      setVerifHashAlt('');
    } else {
      setVerifHash('');
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(portalLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const requestDeclarationMutation = useMutation({
    mutationFn: async () => {
      if (!assessmentId) throw new Error('Assessment not selected');
      if (!individualId) throw new Error('Individual not selected');
      if (!verifHash) throw new Error('Verification hash not ready. Ensure the individual has a date of birth and a national ID or passport number on file, or enter them manually.');

      const { raw: rawToken, hash: tokenHash } = await generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await fpDeclarationInvitationCreate({
        assessmentId,
        individualId,
        tokenHash,
        verificationHash: verifHash,
        verificationHashAlt: verifHashAlt || null,
        channel: 'EMAIL',
        expiresAt,
        recipientEmail: recipientEmail.trim() || null,
        note: note.trim() || null,
      });

      // Send the invitation email with the secure portal link
      const link = `${window.location.origin}/declaration/${rawToken}`;
      let emailSent = false;
      if (recipientEmail.trim()) {
        const entityLine = entityName ? ` in connection with your role at ${entityName}` : '';
        const emailSubject = 'Fit & Proper Declaration — Action Required';
        const emailText = [
          `Dear ${individualName || 'Applicant'},`,
          '',
          `You have been invited to complete a Fit & Proper Personal Questionnaire Declaration${entityLine}.`,
          '',
          'Please use the link below to access the secure declaration form:',
          link,
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
            <p>Dear <strong>${individualName || 'Applicant'}</strong>,</p>
            <p>You have been invited to complete a <strong>Fit &amp; Proper Personal Questionnaire Declaration</strong>${entityName ? ` in connection with your role at <strong>${entityName}</strong>` : ''}.</p>
            <p>Click the button below to access the secure declaration form:</p>
            <p style="text-align:center;margin:32px 0">
              <a href="${link}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
                Complete Declaration Form
              </a>
            </p>
            <p style="font-size:13px;color:#6b7280">Or copy this link into your browser:<br>
              <span style="word-break:break-all;color:#2563eb">${link}</span>
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
    onSuccess: ({ rawToken, emailSent, recipientEmail: sentTo }) => {
      if (sentTo && !emailSent) {
        toast.warning('Invitation created but email could not be sent — SMTP may not be configured. Share the portal link below manually.');
      } else {
        toast.success(sentTo ? `Declaration request sent to ${sentTo}` : 'Declaration invitation created');
      }
      const link = `${window.location.origin}/declaration/${rawToken}`;
      setPortalLink(link);
      setSubmitted(true);
      onSent?.();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to send declaration request'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-muted-foreground" />
            Request Declaration
          </DialogTitle>
        </DialogHeader>

        {!submitted ? (
          <div className="space-y-4 py-1">
            {/* Individual — read-only */}
            <div className="space-y-1.5">
              <Label>Individual</Label>
              <div className="flex items-center h-9 rounded-md border bg-muted/40 px-3 text-sm font-medium">
                {individualName || '—'}
              </div>
            </div>

            {/* Assessment — read-only */}
            <div className="space-y-1.5">
              <Label>Assessment</Label>
              <div className="flex items-center h-9 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                {assessmentLabel || '—'}
              </div>
            </div>

            {/* Entity — read-only, also mentioned in the invitation email */}
            <div className="space-y-1.5">
              <Label>Entity</Label>
              <div className="flex items-center h-9 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                {entityName ?? '—'}
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
            {verifSource === 'auto' && (
              <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                <CheckCheck className="h-3.5 w-3.5 shrink-0" />
                Identity gate ready — DOB and {verifHashAlt ? 'national ID and passport number' : 'national ID or passport number'} loaded from profile.
              </div>
            )}
            {verifSource === 'manual' && (
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
            {verifSource === null && (
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
              <Button data-rbac="fit_and_proper.edit" variant="ghost" onClick={() => onOpenChange(false)}>
                Skip for now
              </Button>
              <Button data-rbac="fit_and_proper.edit"
                onClick={() => requestDeclarationMutation.mutate()}
                disabled={requestDeclarationMutation.isPending || !verifHash}
              >
                {requestDeclarationMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Send className="h-4 w-4 mr-2" />
                Send Request
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RequestDeclarationDialog;
