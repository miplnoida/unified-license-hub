import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, AlertTriangle, Lock, XCircle } from 'lucide-react';
import DeclarationQuestionnaire from '@/pages/public/declaration/DeclarationQuestionnaire';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'loading' | 'identity' | 'declaration' | 'success' | 'error';

interface InvitationPublic {
  id: string;
  assessment_id: string;
  status: string;
  expires_at: string;
  failed_identity_attempts: number;
  individual_name: string;
}

interface SubmitDeclarationResult {
  success: boolean;
  auto_config_ids?: string[];
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DeclarationLanding() {
  const { token } = useParams<{ token: string }>();

  const [step, setStep] = useState<Step>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [invitation, setInvitation] = useState<InvitationPublic | null>(null);

  // Identity gate state
  const [dob, setDob] = useState('');
  const [last4, setLast4] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [attemptsFailed, setAttemptsFailed] = useState(0);

  // Declaration state
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Load invitation ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setErrorMsg('Invalid or expired link.');
      setStep('error');
      return;
    }

    (async () => {
      const { data, error } = await supabase.rpc('get_declaration_invitation_public', {
        p_token: token,
      });

      if (error) {
        setErrorMsg('Unable to load invitation. Please try again later.');
        setStep('error');
        return;
      }

      const rows = data as InvitationPublic[] | null;
      if (!rows || rows.length === 0) {
        setErrorMsg('Invalid or expired link. This invitation does not exist or has already been used.');
        setStep('error');
        return;
      }

      const inv = rows[0];

      if (inv.status === 'SUBMITTED') {
        setErrorMsg('Declaration already submitted. Thank you — your regulator has already received this declaration.');
        setStep('error');
        return;
      }

      if (new Date(inv.expires_at) < new Date()) {
        setErrorMsg('This invitation has expired. Please contact your regulator for a new invitation.');
        setStep('error');
        return;
      }

      if (inv.failed_identity_attempts >= 5) {
        setErrorMsg('Account locked — too many failed verification attempts. Please contact your regulator.');
        setStep('error');
        return;
      }

      setInvitation(inv);
      setAttemptsFailed(inv.failed_identity_attempts);
      setStep('identity');
    })();
  }, [token]);

  // ── Identity verification ────────────────────────────────────────────────

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !dob || last4.length !== 4) return;

    setVerifying(true);
    try {
      const { data, error } = await supabase.rpc('verify_declaration_identity', {
        p_token: token,
        p_dob: dob,
        p_last4id: last4,
      });

      if (error) throw error;

      const rows = data as { verified: boolean; invitation_id: string | null; assessment_id: string | null }[] | null;
      const result = rows?.[0];

      if (result?.verified) {
        setInvitationId(result.invitation_id);
        setAssessmentId(result.assessment_id);
        setStep('declaration');
      } else {
        const newFailedCount = attemptsFailed + 1;
        setAttemptsFailed(newFailedCount);

        if (newFailedCount >= 5) {
          setErrorMsg('Account locked — too many failed verification attempts. Please contact your regulator.');
          setStep('error');
        } else {
          toast.error('Verification failed. Please check your date of birth and national ID digits.');
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  // ── Submit declaration ───────────────────────────────────────────────────

  async function handleSubmit(payload: Record<string, unknown>) {
    if (!token || !invitationId || !assessmentId) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('submit_declaration_form', {
        p_token: token,
        p_inv_id: invitationId,
        p_assessment_id: assessmentId,
        p_form_data: payload,
      });

      if (error) throw error;

      const result = data as unknown as SubmitDeclarationResult | null;

      if (result?.success) {
        setStep('success');

        // Kick off any screening processes mapped to a "Received Declaration" automation rule.
        // Fire-and-forget — this must never block or affect the declarant's success screen.
        const configIds = result.auto_config_ids ?? [];
        if (configIds.length > 0) {
          supabase.functions.invoke('fp-screening-run', {
            body: { assessment_id: assessmentId, run_type: 'auto', config_ids: configIds, triggered_by: null },
          }).catch((e) => console.warn('[DeclarationLanding] auto screening invoke failed', e));
        }
      } else {
        toast.error('Submission failed — your session may have expired. Please contact your regulator.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {

      case 'loading':
        return (
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Loading your invitation…</p>
          </div>
        );

      case 'error': {
        const isLocked = errorMsg.startsWith('Account locked');
        const isSubmitted = errorMsg.startsWith('Declaration already submitted');
        const Icon = isSubmitted ? CheckCircle2 : isLocked ? Lock : XCircle;
        const iconClass = isSubmitted ? 'text-green-600' : isLocked ? 'text-amber-600' : 'text-destructive';
        return (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <Icon className={`h-10 w-10 ${iconClass}`} />
            <p className="font-medium">
              {isSubmitted ? 'Declaration Already Submitted' : isLocked ? 'Account Locked' : 'Link Invalid or Expired'}
            </p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </div>
        );
      }

      case 'identity':
        return (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="mb-2">
              <p className="text-sm text-muted-foreground">
                Welcome, <span className="font-semibold text-foreground">{invitation?.individual_name}</span>. Please verify your identity to continue.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="dob">Date of birth</Label>
              <input
                id="dob"
                type="date"
                required
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="last4">Last 4 digits of national ID / passport number</Label>
              <input
                id="last4"
                type="text"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                placeholder="e.g. 1234"
                required
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {attemptsFailed > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{attemptsFailed} of 5 attempts used. After 5 failed attempts your access will be locked.</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={verifying || last4.length !== 4 || !dob}>
              {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Verify Identity
            </Button>
          </form>
        );

      case 'declaration':
        return (
          <DeclarationQuestionnaire
            individualName={invitation?.individual_name}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        );

      case 'success':
        return (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-600" />
            <div className="space-y-1">
              <p className="text-lg font-semibold">Declaration Submitted</p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Thank you, <strong>{invitation?.individual_name}</strong>. Your declaration has been received by the regulator. You may close this window.
              </p>
            </div>
          </div>
        );
    }
  }

  const isDeclarationStep = step === 'declaration';

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 py-8">
      <div className={`w-full space-y-6 ${isDeclarationStep ? 'max-w-5xl' : 'max-w-md'}`}>
        <div className="text-center">
          <img src="/placeholder.svg" alt="Logo" className="h-10 w-auto mx-auto mb-4" />
          <h1 className="text-xl font-semibold">Personal Questionnaire Declaration</h1>
        </div>
        <Card>
          <CardContent className="p-6">{renderStep()}</CardContent>
        </Card>
        {isDeclarationStep && (
          <p className="text-center text-xs text-muted-foreground px-4">
            This form is encrypted in transit and handled in accordance with your regulator's privacy policy.
            Your responses will be securely transmitted and retained for regulatory purposes.
          </p>
        )}
      </div>
    </div>
  );
}
