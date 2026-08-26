/**
 * MC-01 seven-step public complaint wizard.
 *
 * Binds to the live public intake contract exposed by the
 * `public-complaint-intake` edge function. Complaint content is held in
 * page-session React state only — never persisted to localStorage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CaptchaWidget } from '@/components/shared/CaptchaWidget';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Send } from 'lucide-react';
import { StepAboutYou, StepContactSupport } from './StepsPeople';
import { StepProductService, StepRespondents } from './StepsSubject';
import { StepOutcome, StepPriorSteps, StepWhatHappened } from './StepsNarrative';
import {
  DEFAULT_CONFIG,
  STEP_TITLES,
  TOTAL_STEPS,
  buildPayload,
  createInitialState,
  mapBackendFieldErrors,
  validateClientFile,
  validateStep,
} from './logic';
import type {
  EntityRow,
  IntakeConfig,
  StagedFile,
  SubmissionResult,
  Taxonomy,
  TaxonomyRow,
  WizardState,
} from './types';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-complaint-intake`;

const EMPTY_TAXONOMY: Taxonomy = { products: [], channels: [], sectors: [], channel_options: [] };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

let fileSeq = 0;

export interface PublicComplaintWizardProps {
  /** Injected in tests; defaults to the live edge function. */
  endpoint?: string;
  initialConfig?: IntakeConfig;
}

export function PublicComplaintWizard({ endpoint = FN_URL, initialConfig }: PublicComplaintWizardProps) {
  const [config, setConfig] = useState<IntakeConfig>(initialConfig ?? DEFAULT_CONFIG);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>(EMPTY_TAXONOMY);
  const [types, setTypes] = useState<TaxonomyRow[]>([]);
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(createInitialState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [captchaVerificationId, setCaptchaVerificationId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const idempotencyKey = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()),
  );
  const topRef = useRef<HTMLDivElement>(null);

  // Reference data — configuration drives every option shown to the consumer.
  useEffect(() => {
    let live = true;
    (async () => {
      const get = async (action: string) => {
        try {
          const res = await fetch(`${endpoint}?action=${action}`);
          return await res.json();
        } catch {
          return null;
        }
      };
      const [cfg, tax, typ] = await Promise.all([get('config'), get('taxonomy'), get('types')]);
      if (!live) return;
      if (cfg && !initialConfig) {
        setConfig({
          ...DEFAULT_CONFIG,
          ...cfg,
          captcha: { required: !!cfg.captcha?.required, misconfigured: !!cfg.captcha?.misconfigured },
        });
      }
      if (tax) setTaxonomy({ ...EMPTY_TAXONOMY, ...tax });
      if (typ?.rows) setTypes(typ.rows);
    })();
    return () => {
      live = false;
    };
  }, [endpoint, initialConfig]);

  const patch = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const searchEntities = useCallback(
    async (query: string): Promise<EntityRow[]> => {
      try {
        const res = await fetch(`${endpoint}?action=entities&q=${encodeURIComponent(query)}`);
        const body = await res.json();
        return (body?.rows ?? []) as EntityRow[];
      } catch {
        return [];
      }
    },
    [endpoint],
  );

  const focusFirstError = (keys: string[]) => {
    if (typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      for (const key of keys) {
        const host = document.querySelector(`[data-field="${key}"]`) as HTMLElement | null;
        const field = (document.getElementById(key) ?? host) as HTMLElement | null;
        if (field) {
          field.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (typeof (field as HTMLInputElement).focus === 'function') (field as HTMLInputElement).focus();
          return;
        }
      }
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const goTo = (next: number) => {
    setStep(next);
    setFormError(null);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const handleContinue = () => {
    const stepErrors = validateStep(step, state, config);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length) {
      focusFirstError(Object.keys(stepErrors));
      return;
    }
    if (step < TOTAL_STEPS) goTo(step + 1);
  };

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const accepted: StagedFile[] = [];
    const problems: string[] = [];
    for (const file of Array.from(list)) {
      const problem = validateClientFile(file, state.attachments.length + accepted.length, config);
      if (problem) {
        problems.push(problem);
        continue;
      }
      fileSeq += 1;
      accepted.push({
        key: `f${fileSeq}`,
        name: file.name,
        content_type: file.type || 'application/octet-stream',
        size: file.size,
        data: await readAsDataUrl(file),
      });
    }
    if (accepted.length) patch({ attachments: [...state.attachments, ...accepted] });
    setNotices(problems);
  };

  const submit = async () => {
    if (submitting) return;
    const stepErrors = validateStep(TOTAL_STEPS, state, config);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length) {
      focusFirstError(Object.keys(stepErrors));
      return;
    }
    if (config.captcha.misconfigured) {
      setFormError('Security verification is temporarily unavailable. Please try again later.');
      return;
    }
    if (config.captcha.required && !captchaVerificationId) {
      setFormError('Please complete the security check before submitting.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setNotices([]);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildPayload(state, config, {
            captchaVerificationId,
            idempotencyKey: idempotencyKey.current,
          }),
        ),
      });
      const body = await res.json().catch(() => null);

      if (body?.ok && body.reference) {
        setResult({
          reference: body.reference,
          tracking_access_code: body.tracking_access_code ?? null,
          submitted_at: body.submitted_at ?? new Date().toISOString(),
          duplicate: body.duplicate === true,
          attachment_warnings: body.attachment_warnings ?? [],
        });
        return;
      }

      // A rejected submission must never wipe what the consumer entered.
      if (body?.fields) {
        const { errors: mapped, firstStep } = mapBackendFieldErrors(body.fields);
        setErrors(mapped);
        goTo(firstStep);
        setFormError('Please check the highlighted answers and try again.');
        focusFirstError(Object.keys(mapped));
      } else {
        setFormError(
          body?.message ?? 'We could not lodge your complaint just now. Please try again shortly.',
        );
      }
      if (config.captcha.required) setCaptchaVerificationId(null);
    } catch {
      setFormError('We could not reach the complaints service. Please try again.');
      if (config.captcha.required) setCaptchaVerificationId(null);
    } finally {
      setSubmitting(false);
    }
  };

  const progress = useMemo(() => Math.round(((step - 1) / TOTAL_STEPS) * 100), [step]);

  if (result) {
    return (
      <Card className="space-y-5 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">Complaint lodged successfully</h1>
        </div>
        {result.duplicate && (
          <Alert>
            <AlertDescription className="text-sm">
              We had already received this submission, so we have not created a second complaint. Your
              existing reference is shown below.
            </AlertDescription>
          </Alert>
        )}
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Complaint reference</dt>
            <dd className="font-mono text-lg font-semibold">{result.reference}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Tracking access code</dt>
            <dd className="font-mono text-lg font-semibold">{result.tracking_access_code ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Submitted</dt>
            <dd className="text-sm">
              {new Date(result.submitted_at).toLocaleString(undefined, {
                day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
            </dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          Keep both the complaint reference and the tracking access code somewhere safe — together they
          are the only way to see progress on your complaint. We will not show the access code again.
        </p>
        <p className="text-sm text-muted-foreground">
          We will now assess whether this matter is within our role and what happens next.
        </p>
        {result.attachment_warnings.length > 0 && (
          <Alert>
            <AlertDescription className="text-xs">
              Your complaint was submitted, but we could not accept the following file(s):
              <ul className="mt-1 list-disc pl-4">
                {result.attachment_warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
              You can send them to us later using your complaint reference.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link
              to={`/track/complaint?reference=${encodeURIComponent(result.reference ?? '')}`}
            >
              Track this complaint
            </Link>
          </Button>
          <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
        </div>
      </Card>
    );
  }

  return (
    <div ref={topRef} className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">
            Step {step} of {TOTAL_STEPS}: {STEP_TITLES[step - 1]}
          </p>
          <p className="text-xs text-muted-foreground">{progress}% complete</p>
        </div>
        <Progress value={progress} aria-label={`Step ${step} of ${TOTAL_STEPS}`} />
        <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {STEP_TITLES.map((title, i) => (
            <li key={title} className={i + 1 === step ? 'font-medium text-foreground' : undefined}>
              {i + 1}. {title}
            </li>
          ))}
        </ol>
      </div>

      {formError && (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">{formError}</AlertDescription>
        </Alert>
      )}
      {notices.length > 0 && (
        <Alert>
          <AlertDescription className="text-xs">
            <ul className="list-disc pl-4">{notices.map((n) => <li key={n}>{n}</li>)}</ul>
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-5 sm:p-6">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            // Intermediate steps never submit the complaint.
            if (step < TOTAL_STEPS) handleContinue();
            else void submit();
          }}
        >
          {step === 1 && <StepAboutYou s={state} patch={patch} errors={errors} config={config} />}
          {step === 2 && <StepContactSupport s={state} patch={patch} errors={errors} config={config} />}
          {step === 3 && (
            <StepRespondents s={state} patch={patch} errors={errors} searchEntities={searchEntities} />
          )}
          {step === 4 && (
            <StepProductService
              s={state} patch={patch} errors={errors} taxonomy={taxonomy} config={config} types={types}
            />
          )}
          {step === 5 && <StepWhatHappened s={state} patch={patch} errors={errors} config={config} />}
          {step === 6 && (
            <StepPriorSteps
              s={state} patch={patch} errors={errors} config={config}
              onAddFiles={(list) => void addFiles(list)}
            />
          )}
          {step === 7 && (
            <>
              <StepOutcome
                s={state} patch={patch} errors={errors} config={config} taxonomy={taxonomy}
                onEditStep={goTo}
              />
              {config.captcha.required && (
                <div className="mt-6">
                  <CaptchaWidget
                    action="public_complaint"
                    verificationId={captchaVerificationId}
                    onVerificationChange={setCaptchaVerificationId}
                  />
                </div>
              )}
            </>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <Button
              type="button"
              variant="outline"
              disabled={step === 1 || submitting}
              onClick={() => goTo(Math.max(1, step - 1))}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            {step < TOTAL_STEPS ? (
              <Button type="submit">
                Continue <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={submitting || config.captcha.misconfigured}>
                {submitting ? (
                  <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Submitting…</>
                ) : (
                  <><Send className="mr-1 h-4 w-4" /> Submit complaint</>
                )}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

export default PublicComplaintWizard;
