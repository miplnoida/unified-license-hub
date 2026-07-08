import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Loader2, CheckCircle2, AlertTriangle, Lock, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'loading' | 'identity' | 'declaration' | 'success' | 'error';
type YesNo = 'yes' | 'no' | '';

interface InvitationPublic {
  id: string;
  assessment_id: string;
  status: string;
  expires_at: string;
  failed_identity_attempts: number;
  individual_name: string;
}

interface QuestionAnswer {
  answer: YesNo;
  explanation: string;
}

type Questionnaire = Record<string, QuestionAnswer>;

// ── Questionnaire definition ───────────────────────────────────────────────────

interface QuestionDef {
  key: string;
  section: string;
  text: string;
  explanationLabel?: string;
}

const SECTIONS = [
  'Criminal History',
  'Regulatory History',
  'Financial History',
  'Civil / Legal',
  'Other Positions',
] as const;

const QUESTIONS: QuestionDef[] = [
  // Criminal History
  {
    key: 'criminal_conviction',
    section: 'Criminal History',
    text: 'Have you ever been convicted of a criminal offence (other than minor traffic violations)?',
    explanationLabel: 'Provide details of the conviction(s), date(s), and jurisdiction(s).',
  },
  {
    key: 'criminal_pending',
    section: 'Criminal History',
    text: 'Are there any criminal proceedings currently pending against you?',
    explanationLabel: 'Describe the nature of the proceedings and the jurisdiction.',
  },

  // Regulatory History
  {
    key: 'license_refused',
    section: 'Regulatory History',
    text: 'Have you ever been refused a licence, authorisation, registration, or approval by any regulatory or government body?',
    explanationLabel: 'Provide details: which body, when, and the reasons given.',
  },
  {
    key: 'license_revoked',
    section: 'Regulatory History',
    text: 'Have you ever had a licence, authorisation, or approval revoked, suspended, or had conditions imposed on it?',
    explanationLabel: 'Provide details: which body, when, and the grounds.',
  },
  {
    key: 'disciplinary_proceedings',
    section: 'Regulatory History',
    text: 'Have you ever been the subject of disciplinary proceedings by a regulatory, professional, or government body?',
    explanationLabel: 'Describe the proceedings, outcome, and any sanctions imposed.',
  },

  // Financial History
  {
    key: 'bankruptcy',
    section: 'Financial History',
    text: 'Have you ever been declared bankrupt, or entered into any individual insolvency or formal debt restructuring arrangement?',
    explanationLabel: 'Provide details including jurisdiction, date, and current status.',
  },
  {
    key: 'insolvent_director',
    section: 'Financial History',
    text: 'Have you ever been a director, officer, or significant owner of a company that was declared insolvent, went into administration, or was wound up?',
    explanationLabel: 'Provide the company name, jurisdiction, date, and your role.',
  },

  // Civil / Legal
  {
    key: 'director_disqualified',
    section: 'Civil / Legal',
    text: 'Have you ever been disqualified from acting as a director, officer, or trustee of any company or organisation?',
    explanationLabel: 'Describe the disqualification order, jurisdiction, and period.',
  },
  {
    key: 'civil_judgment',
    section: 'Civil / Legal',
    text: 'Are there any outstanding civil judgments, enforcement orders, or similar legal proceedings against you that have not been fully satisfied?',
    explanationLabel: 'Provide the nature of the claim, jurisdiction, amount, and current status.',
  },

  // Other Positions
  {
    key: 'other_regulated_roles',
    section: 'Other Positions',
    text: 'Do you currently hold a similar or equivalent position (director, key person, controller, etc.) in any other regulated entity?',
    explanationLabel: 'List each entity, your role, and the relevant regulator.',
  },
];

// Group questions by section for rendering
function groupBySection(qs: QuestionDef[]) {
  const map = new Map<string, QuestionDef[]>();
  for (const q of qs) {
    if (!map.has(q.section)) map.set(q.section, []);
    map.get(q.section)!.push(q);
  }
  return map;
}

// Build empty questionnaire state
function emptyQuestionnaire(): Questionnaire {
  const q: Questionnaire = {};
  for (const def of QUESTIONS) {
    q[def.key] = { answer: '', explanation: '' };
  }
  return q;
}

// ── Identity step helpers ─────────────────────────────────────────────────────

async function generateToken(): Promise<{ raw: string; hash: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const raw = Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { raw, hash };
}

// ── Section accordion ─────────────────────────────────────────────────────────

function SectionBlock({
  title,
  sectionIndex,
  questions,
  questionnaire,
  onChange,
}: {
  title: string;
  sectionIndex: number;
  questions: QuestionDef[];
  questionnaire: Questionnaire;
  onChange: (key: string, field: keyof QuestionAnswer, value: string) => void;
}) {
  const [open, setOpen] = useState(true);

  const allAnswered = questions.every((q) => {
    const a = questionnaire[q.key];
    if (!a || a.answer === '') return false;
    if (a.answer === 'yes' && !a.explanation.trim()) return false;
    return true;
  });

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-5 w-5 rounded-full bg-slate-700 text-white text-xs font-semibold items-center justify-center flex-shrink-0">
            {sectionIndex + 1}
          </span>
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          {allAnswered && (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
          )}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 py-4 space-y-5 bg-white">
          {questions.map((q, qi) => {
            const ans = questionnaire[q.key];
            return (
              <div key={q.key} className="space-y-2.5">
                <p className="text-sm leading-snug text-slate-800">
                  <span className="font-medium text-slate-500 mr-1.5 tabular-nums">{qi + 1}.</span>
                  {q.text}
                </p>

                <div className="flex gap-4">
                  {(['no', 'yes'] as const).map((val) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={q.key}
                        value={val}
                        checked={ans.answer === val}
                        onChange={() => onChange(q.key, 'answer', val)}
                        className="accent-slate-700 h-4 w-4"
                      />
                      <span className={`text-sm font-medium ${val === 'yes' ? 'text-red-700' : 'text-emerald-700'}`}>
                        {val === 'yes' ? 'Yes' : 'No'}
                      </span>
                    </label>
                  ))}
                </div>

                {ans.answer === 'yes' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">
                      {q.explanationLabel ?? 'Please provide details.'}{' '}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      rows={3}
                      placeholder="Please provide full details…"
                      value={ans.explanation}
                      onChange={(e) => onChange(q.key, 'explanation', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>(emptyQuestionnaire());
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [attested, setAttested] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sectionMap = groupBySection(QUESTIONS);

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

  // ── Questionnaire handlers ───────────────────────────────────────────────

  function handleQuestionChange(key: string, field: keyof QuestionAnswer, value: string) {
    setQuestionnaire((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  // Validate that all questions are answered and yes-answers have explanations
  function validateQuestionnaire(): string | null {
    for (const def of QUESTIONS) {
      const ans = questionnaire[def.key];
      if (!ans || ans.answer === '') {
        return `Please answer all questions. Missing: "${def.text.slice(0, 60)}…"`;
      }
      if (ans.answer === 'yes' && !ans.explanation.trim()) {
        return `Please provide details for: "${def.text.slice(0, 60)}…"`;
      }
    }
    if (!attested) {
      return 'You must confirm the attestation before submitting.';
    }
    return null;
  }

  // ── Submit declaration ───────────────────────────────────────────────────

  async function handleSubmit() {
    const validationError = validateQuestionnaire();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (!token || !invitationId || !assessmentId) return;

    setSubmitting(true);
    try {
      // Build the form data payload to save into fp_assessments.declaration_data
      const formPayload = {
        questionnaire,
        notes: additionalNotes.trim() || null,
        attested: true,
      };

      const { data, error } = await supabase.rpc('submit_declaration_form', {
        p_token: token,
        p_inv_id: invitationId,
        p_assessment_id: assessmentId,
        p_form_data: formPayload,
      });

      if (error) throw error;

      if (data === true) {
        setStep('success');
      } else {
        toast.error('Submission failed — your session may have expired. Please contact your regulator.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived: form completeness for progress indicator ────────────────────

  const answeredCount = QUESTIONS.filter((q) => {
    const a = questionnaire[q.key];
    if (!a || a.answer === '') return false;
    if (a.answer === 'yes' && !a.explanation.trim()) return false;
    return true;
  }).length;

  const formReady = answeredCount === QUESTIONS.length && attested;

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
          <div className="space-y-5">
            {/* Verified banner */}
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Identity verified for: <strong>{invitation?.individual_name}</strong></span>
            </div>

            {/* Progress indicator */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Questions answered</span>
                <span className="tabular-nums font-medium">{answeredCount} / {QUESTIONS.length}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${(answeredCount / QUESTIONS.length) * 100}%` }}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">Personal Questionnaire Declaration</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Please answer all questions below honestly and in full. For any "Yes" answer you must provide
                a detailed explanation. This declaration will be submitted to your regulator.
              </p>
            </div>

            {/* Question sections */}
            <div className="space-y-3">
              {SECTIONS.map((section, idx) => {
                const qs = sectionMap.get(section);
                if (!qs) return null;
                return (
                  <SectionBlock
                    key={section}
                    title={section}
                    sectionIndex={idx}
                    questions={qs}
                    questionnaire={questionnaire}
                    onChange={handleQuestionChange}
                  />
                );
              })}
            </div>

            {/* Additional notes */}
            <div className="space-y-1.5">
              <Label htmlFor="add-notes" className="text-sm">Additional Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="add-notes"
                placeholder="Any additional information you wish to provide to the regulator…"
                rows={3}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                className="text-sm"
              />
            </div>

            <Separator />

            {/* Attestation */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Declaration & Attestation</p>
              <p className="text-sm text-slate-700 leading-relaxed">
                I, <strong>{invitation?.individual_name}</strong>, declare that the information I have provided in this
                Personal Questionnaire is true, complete, and accurate to the best of my knowledge and belief. I understand
                that providing false or misleading information may constitute a criminal offence and may result in the
                refusal, revocation, or suspension of any licence, authorisation, or approval.
              </p>
              <div className="flex items-start gap-3 pt-1">
                <Checkbox
                  id="attest"
                  checked={attested}
                  onCheckedChange={(v) => setAttested(!!v)}
                  className="mt-0.5"
                />
                <Label htmlFor="attest" className="cursor-pointer text-sm text-slate-800 leading-snug font-medium">
                  I confirm that the above declaration is true and accurate, and I consent to this information being shared with the relevant regulatory authority.
                </Label>
              </div>
            </div>

            {!formReady && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {answeredCount < QUESTIONS.length
                    ? `${QUESTIONS.length - answeredCount} question(s) still need an answer. Expand each section above to complete them.`
                    : 'Please confirm the attestation above before submitting.'}
                </span>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={submitting || !formReady}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit Declaration'
              )}
            </Button>
          </div>
        );

      case 'success':
        return (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-600" />
            <div className="space-y-1">
              <p className="text-lg font-semibold">Declaration Submitted</p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Thank you, <strong>{invitation?.individual_name}</strong>. Your Personal Questionnaire has been received by the regulator. You may close this window.
              </p>
            </div>
          </div>
        );
    }
  }

  const isDeclarationStep = step === 'declaration';

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 py-8">
      <div className={`w-full space-y-6 ${isDeclarationStep ? 'max-w-2xl' : 'max-w-md'}`}>
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
