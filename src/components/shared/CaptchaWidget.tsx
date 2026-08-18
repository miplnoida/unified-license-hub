import { useCallback, useEffect, useRef, useState } from 'react';
import { Shield, ShieldCheck, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useCaptchaRuntime, type CaptchaProvider } from '@/hooks/useCaptchaConfig';

interface Props {
  /** True once the user has passed the challenge (server-verified when configured). */
  verified: boolean;
  onVerifiedChange: (verified: boolean) => void;
  error?: string;
}

const SCRIPTS: Record<CaptchaProvider, { src: string; global: string }> = {
  recaptcha_v2: { src: 'https://www.google.com/recaptcha/api.js?render=explicit', global: 'grecaptcha' },
  recaptcha_v3: { src: 'https://www.google.com/recaptcha/api.js?render=explicit', global: 'grecaptcha' },
  hcaptcha: { src: 'https://js.hcaptcha.com/1/api.js?render=explicit', global: 'hcaptcha' },
  turnstile: { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', global: 'turnstile' },
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load CAPTCHA script')));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error('Failed to load CAPTCHA script')));
    document.head.appendChild(script);
  });
}

/**
 * Provider-aware CAPTCHA. Renders the configured provider widget when CAPTCHA is
 * enabled in Settings > Security Verification; otherwise falls back to the simple
 * acknowledgement checkbox so public forms keep working.
 *
 * The token returned by the provider is always verified server-side by the
 * `manage-captcha` function (which holds the secret key) before the form is
 * allowed to continue.
 */
export function CaptchaWidget({ verified, onVerifiedChange, error }: Props) {
  const { data, isLoading } = useCaptchaRuntime();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<unknown>(null);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const verifyToken = useCallback(async (token: string) => {
    setStatus('verifying');
    setMessage(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('manage-captcha', {
        body: { action: 'verify', token },
      });
      if (fnError || !result?.ok) {
        setStatus('error');
        setMessage(result?.error ?? 'CAPTCHA verification failed. Please try again.');
        onVerifiedChange(false);
        return;
      }
      setStatus('idle');
      onVerifiedChange(true);
    } catch {
      setStatus('error');
      setMessage('CAPTCHA verification failed. Please try again.');
      onVerifiedChange(false);
    }
  }, [onVerifiedChange]);

  const config = data?.enabled ? data.config : null;

  useEffect(() => {
    if (!config || !containerRef.current) return;
    let cancelled = false;
    const meta = SCRIPTS[config.provider];

    loadScript(meta.src)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const api = (window as unknown as Record<string, any>)[meta.global];
        if (!api?.render) {
          setStatus('error');
          setMessage('CAPTCHA could not be initialised.');
          return;
        }
        if (widgetIdRef.current !== null) return;
        containerRef.current.innerHTML = '';
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: config.site_key,
          callback: (token: string) => void verifyToken(token),
          'expired-callback': () => onVerifiedChange(false),
          'error-callback': () => {
            setStatus('error');
            setMessage('CAPTCHA challenge failed. Please retry.');
            onVerifiedChange(false);
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        setMessage('CAPTCHA could not be loaded. Check your connection and retry.');
      });

    return () => {
      cancelled = true;
    };
  }, [config, verifyToken, onVerifiedChange]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading security verification…
      </div>
    );
  }

  if (!config) {
    return (
      <div>
        <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4">
          <Checkbox
            id="captcha"
            checked={verified}
            onCheckedChange={(v) => onVerifiedChange(v === true)}
          />
          <Label htmlFor="captcha" className="text-sm font-normal cursor-pointer">
            I'm not a robot
          </Label>
          <div className="ml-auto flex items-center gap-2 text-muted-foreground">
            <Shield className="h-5 w-5" />
            <span className="text-xs">Verification</span>
          </div>
        </div>
        {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div ref={containerRef} />
        {status === 'verifying' && (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
          </p>
        )}
        {verified && status === 'idle' && (
          <p className="mt-2 flex items-center gap-2 text-sm text-success">
            <ShieldCheck className="h-4 w-4" /> Verification complete.
          </p>
        )}
      </div>
      {(message || error) && (
        <p className="text-sm text-destructive">{message ?? error}</p>
      )}
    </div>
  );
}
