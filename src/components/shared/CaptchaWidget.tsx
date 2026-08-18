import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useCaptchaRuntime, type CaptchaProvider } from '@/hooks/useCaptchaConfig';

interface Props {
  /** Server-issued verification id, or null when the challenge has not been passed. */
  verificationId: string | null;
  onVerificationChange: (verificationId: string | null) => void;
  error?: string;
  /** Action name reported to reCAPTCHA v3. */
  action?: string;
}

const SCRIPTS: Record<CaptchaProvider, { src: string; global: string }> = {
  recaptcha_v2: { src: 'https://www.google.com/recaptcha/api.js?render=explicit', global: 'grecaptcha' },
  recaptcha_v3: { src: '', global: 'grecaptcha' },
  hcaptcha: { src: 'https://js.hcaptcha.com/1/api.js?render=explicit', global: 'hcaptcha' },
  turnstile: { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', global: 'turnstile' },
};

const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const cached = scriptPromises.get(src);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const target = existing ?? document.createElement('script');
    if (existing?.dataset.loaded === 'true') return resolve();
    target.addEventListener('load', () => {
      target.dataset.loaded = 'true';
      resolve();
    });
    target.addEventListener('error', () => {
      scriptPromises.delete(src);
      reject(new Error('Failed to load CAPTCHA script'));
    });
    if (!existing) {
      target.src = src;
      target.async = true;
      target.defer = true;
      document.head.appendChild(target);
    }
  });

  scriptPromises.set(src, promise);
  return promise;
}

/** Providers attach `.render` a tick after the script `load` event — wait for it. */
async function waitForRender(globalName: string, timeoutMs = 6000): Promise<Record<string, any> | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const api = (window as unknown as Record<string, any>)[globalName];
    if (typeof api?.render === 'function') return api;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 50));
  }
}


/**
 * Provider-aware CAPTCHA. There is no checkbox fallback: a plain checkbox is never
 * proof of a passed challenge.
 *
 *  - CAPTCHA globally disabled          → nothing rendered, nothing required
 *  - enabled + active configuration     → real provider widget, token verified server-side
 *  - enabled + no active configuration  → public-safe error, submission stays blocked
 *
 * The provider token is exchanged by `manage-captcha` (which holds the secret key)
 * for a single-use verification id. Only that id is accepted by the submission path.
 */
export function CaptchaWidget({ verificationId, onVerificationChange, error, action = 'registration' }: Props) {
  const { data, isLoading } = useCaptchaRuntime();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<unknown>(null);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const config = data?.enabled ? data.config : null;
  const misconfigured = !!data?.misconfigured;

  const verifyToken = useCallback(async (token: string) => {
    setStatus('verifying');
    setMessage(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('manage-captcha', {
        body: { action: 'verify', token },
      });
      if (fnError || !result?.ok || !result?.verification_id) {
        setStatus('error');
        setMessage(result?.error ?? 'CAPTCHA verification failed. Please try again.');
        onVerificationChange(null);
        return;
      }
      setStatus('idle');
      onVerificationChange(result.verification_id as string);
    } catch {
      setStatus('error');
      setMessage('CAPTCHA verification failed. Please try again.');
      onVerificationChange(null);
    }
  }, [onVerificationChange]);

  const runV3 = useCallback(async (siteKey: string) => {
    try {
      await loadScript(`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`);
      const api = (window as unknown as Record<string, any>).grecaptcha;
      if (!api?.ready || !api?.execute) throw new Error('unavailable');
      setStatus('verifying');
      await new Promise<void>((resolve) => api.ready(() => resolve()));
      const token: string = await api.execute(siteKey, { action });
      await verifyToken(token);
    } catch {
      setStatus('error');
      setMessage('Security verification could not be loaded. Please retry.');
      onVerificationChange(null);
    }
  }, [action, verifyToken, onVerificationChange]);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;

    // A fresh attempt starts clean: stale errors must never sit under a working widget.
    setMessage(null);
    setStatus('idle');

    if (config.provider === 'recaptcha_v3') {
      void runV3(config.site_key);
      return () => { cancelled = true; };
    }

    if (!containerRef.current) return;
    const meta = SCRIPTS[config.provider];

    loadScript(meta.src)
      .then(async () => {
        if (cancelled) return;
        const api = await waitForRender(meta.global);
        if (cancelled || !containerRef.current) return;
        if (!api) {
          setStatus('error');
          setMessage('Security verification could not be initialised. Please retry.');
          return;
        }
        if (widgetIdRef.current !== null) return;

        const render = () => {
          if (cancelled || !containerRef.current || widgetIdRef.current !== null) return;
          containerRef.current.innerHTML = '';
          widgetIdRef.current = api.render(containerRef.current, {
            sitekey: config.site_key,
            callback: (token: string) => void verifyToken(token),
            'expired-callback': () => onVerificationChange(null),
            'error-callback': () => {
              setStatus('error');
              setMessage('CAPTCHA challenge failed. Please retry.');
              onVerificationChange(null);
            },
          });
          setMessage(null);
          setStatus('idle');
        };

        if (config.provider === 'recaptcha_v2' && typeof api.ready === 'function') {
          api.ready(render);
        } else {
          render();
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');

        setMessage('Security verification could not be loaded. Check your connection and retry.');
      });

    return () => { cancelled = true; };
  }, [config, verifyToken, onVerificationChange, runV3]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading security verification…
      </div>
    );
  }

  // CAPTCHA switched off entirely — nothing to render, nothing to satisfy.
  if (!data?.enabled && !misconfigured) return null;

  // Enabled but nothing configured: never fall back to a checkbox.
  if (misconfigured || !config) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Security verification is temporarily unavailable. Please try again later.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        {config.provider === 'recaptcha_v3' ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {status === 'verifying' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Running security verification…</>
            ) : verificationId ? (
              <span className="flex items-center gap-2 text-success">
                <ShieldCheck className="h-4 w-4" /> Verification complete.
              </span>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => void runV3(config.site_key)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Retry security verification
              </Button>
            )}
          </div>
        ) : (
          <>
            <div ref={containerRef} />
            {status === 'verifying' && (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
              </p>
            )}
            {verificationId && status === 'idle' && (
              <p className="mt-2 flex items-center gap-2 text-sm text-success">
                <ShieldCheck className="h-4 w-4" /> Verification complete.
              </p>
            )}
          </>
        )}
      </div>
      {(message || error) && <p className="text-sm text-destructive">{message ?? error}</p>}
    </div>
  );
}
