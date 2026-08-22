import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, Mail, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  EMAIL_ALREADY_IN_USE_MESSAGE,
  isValidEmailValue,
  type EmailFieldSettings,
} from '@/lib/emailFieldConfig';
import {
  clearEmailFieldRuntimeState,
  setEmailFieldRuntimeState,
  type EmailUniqueState,
} from '@/lib/emailFieldRuntimeState';
import {
  checkEmailVerifiedOnServer,
  clearEmailVerifiedLocally,
  isEmailVerifiedLocally,
  markEmailVerifiedLocally,
} from '@/lib/registrationEmailVerified';

interface Props {
  /** Key the runtime state is published under (effective field name). */
  fieldKey: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  settings: EmailFieldSettings;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Record's own current email in edit mode — excluded from the uniqueness check. */
  ownEmail?: string | null;
}

/**
 * Inline email input with the admin-configured verification and uniqueness
 * behaviour. Reuses the existing registration OTP functions and the shared
 * verified-email persistence helpers, so a verified address survives step
 * navigation, refresh and re-login. Both settings work independently.
 */
export function EmailFieldControl({
  fieldKey,
  value,
  onChange,
  onBlur,
  settings,
  placeholder,
  disabled,
  invalid,
  ownEmail,
}: Props) {
  const normalized = (value || '').trim().toLowerCase();
  const valid = isValidEmailValue(value);
  const own = (ownEmail || '').trim().toLowerCase();
  const isOwnEmail = !!own && own === normalized;

  const [verified, setVerified] = useState(false);
  const [unique, setUnique] = useState<EmailUniqueState>('idle');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const sentToRef = useRef('');

  // Publish state for the form validators.
  useEffect(() => {
    setEmailFieldRuntimeState(fieldKey, { email: normalized, verified, unique });
  }, [fieldKey, normalized, verified, unique]);

  useEffect(() => () => clearEmailFieldRuntimeState(fieldKey), [fieldKey]);

  // Changing the address resets verification + OTP state entirely.
  const previousEmailRef = useRef(normalized);
  useEffect(() => {
    if (previousEmailRef.current === normalized) return;
    const previous = previousEmailRef.current;
    previousEmailRef.current = normalized;
    if (previous) clearEmailVerifiedLocally(previous);
    setVerified(false);
    setSent(false);
    setCode('');
    setFailure(null);
    sentToRef.current = '';
  }, [normalized]);

  // Restore a previously verified address (session marker, then server).
  useEffect(() => {
    if (!settings.requireVerification || !valid || isOwnEmail) return;
    if (isEmailVerifiedLocally(normalized)) {
      setVerified(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const isVerified = await checkEmailVerifiedOnServer(normalized);
      if (cancelled || !isVerified) return;
      markEmailVerifiedLocally(normalized);
      setVerified(true);
    })();
    return () => { cancelled = true; };
  }, [settings.requireVerification, valid, normalized, isOwnEmail]);

  // Debounced uniqueness check against existing accounts/registrations.
  useEffect(() => {
    if (!settings.requireUniqueness || !valid || isOwnEmail) {
      setUnique('idle');
      return;
    }
    setUnique('checking');
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc(
          'check_primary_user_email_exists' as never,
          { p_email: normalized } as never,
        );
        if (error) { setUnique('idle'); return; }
        setUnique(data === true ? 'taken' : 'available');
      } catch {
        setUnique('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [settings.requireUniqueness, valid, normalized, isOwnEmail]);

  const startCooldown = useCallback(() => {
    setCooldown(60);
    const interval = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const sendCode = async () => {
    if (!valid) { toast.error('Enter a valid email address first'); return; }
    setSending(true);
    setFailure(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-registration-otp', {
        body: { email: normalized, channel: 'email' },
      });
      if (error) { setFailure('Failed to send verification code. Please try again.'); return; }
      if (data?.error) { setFailure(String(data.error)); return; }
      setSent(true);
      sentToRef.current = normalized;
      setCode('');
      startCooldown();
      toast.success(`Verification code sent to ${normalized}`);
    } catch {
      setFailure('Failed to send verification code. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    setVerifying(true);
    setFailure(null);
    try {
      const { data, error } = await supabase.functions.invoke('verify-registration-otp', {
        body: { email: normalized, code, channel: 'email' },
      });
      if (error) { setFailure('Verification failed. Please try again.'); return; }
      if (data?.error) { setFailure(String(data.error)); return; }
      if (data?.verified) {
        markEmailVerifiedLocally(normalized);
        setVerified(true);
        setSent(false);
        setCode('');
        toast.success('Email verified');
      } else {
        setFailure('Verification failed. Please request a new code.');
      }
    } catch {
      setFailure('Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const showVerifyUi = settings.requireVerification && valid && !isOwnEmail;

  return (
    <div className="space-y-2">
      <Input
        type="email"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onBlur?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={invalid || unique === 'taken' ? 'border-destructive' : ''}
      />

      {settings.requireUniqueness && valid && !isOwnEmail && (
        <p
          className={`text-xs ${unique === 'taken' ? 'text-destructive' : 'text-muted-foreground'}`}
          data-testid="email-uniqueness-status"
        >
          {unique === 'checking' && 'Checking email availability…'}
          {unique === 'available' && 'This email address is available.'}
          {unique === 'taken' && EMAIL_ALREADY_IN_USE_MESSAGE}
        </p>
      )}

      {showVerifyUi && (
        verified ? (
          <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Email verified
          </div>
        ) : (
          <div className="space-y-2">
            {!sent ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={sendCode}
                disabled={disabled || sending || cooldown > 0}
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1.5" />}
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Verify Email'}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  A 6-digit code was sent to <strong className="text-foreground">{sentToRef.current}</strong>. It expires in 10 minutes.
                </p>
                <div className="flex gap-2 max-w-xs">
                  <Input
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    maxLength={6}
                    className="font-mono tracking-widest text-center"
                    disabled={disabled}
                  />
                  <Button type="button" size="sm" onClick={verifyCode} disabled={disabled || verifying || code.length !== 6}>
                    {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Verify'}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={sendCode}
                  disabled={disabled || sending || cooldown > 0}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </Button>
              </div>
            )}
            {failure && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5" />
                {failure}
              </p>
            )}
          </div>
        )
      )}
    </div>
  );
}
