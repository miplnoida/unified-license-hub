import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Mail, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RichLabel } from '@/components/shared/RichLabel';
import type { RegistrationFormData } from '@/hooks/useRegistrationForm';

interface DeclarationConfig {
  label: string;
  required: boolean;
  linkUrl?: string;
  linkLabel?: string;
}

interface Props {
  form: RegistrationFormData;
  errors: Record<string, string>;
  setField: (field: string, value: string | boolean) => void;
  /** Resolved verification email from parent (covers static + dynamic schemas). */
  verificationEmail?: string;
  declarations?: DeclarationConfig[];
  termsUrl?: string;
  privacyUrl?: string;
  dataProtectionUrl?: string;
  requireOtp?: boolean;
  requireCaptcha?: boolean;
  updateMode?: boolean;
}

/** Converts a declaration label into a stable field key */
function declFieldKey(label: string, idx: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return slug || `declaration_${idx}`;
}

function isValidUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function DeclarationsStep({
  form,
  errors,
  setField,
  verificationEmail,
  declarations,
  termsUrl,
  privacyUrl,
  dataProtectionUrl,
  requireOtp = true,
  requireCaptcha = true,
  updateMode = false,
}: Props) {
  // Build effective declarations: use config if available, else hardcoded fallbacks
  const effectiveDeclarations: DeclarationConfig[] =
    declarations && declarations.length > 0
      ? declarations
      : [
          {
            label: 'I agree to the Terms & Conditions',
            required: true,
            linkLabel: 'Terms & Conditions',
            linkUrl: termsUrl || '/terms',
          },
          {
            label: 'I agree to the Privacy Policy',
            required: true,
            linkLabel: 'Privacy Policy',
            linkUrl: privacyUrl || '/privacy',
          },
          {
            label: 'I agree to the Data Protection Notice',
            required: true,
            linkLabel: 'Data Protection Notice',
            linkUrl: dataProtectionUrl || '/data-protection',
          },
        ];

  return (
    <div className="space-y-6">
      {/* Email OTP Verification */}
      {requireOtp && !updateMode && <OtpVerificationSection form={form} errors={errors} setField={setField} verificationEmail={verificationEmail} />}

      {/* Dynamic Declarations */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground">Declarations</h3>
        <p className="text-sm text-muted-foreground">
          Please review and accept the following before submitting your registration.
        </p>

        <div className="mt-4 space-y-4">
          {effectiveDeclarations.map((decl, idx) => {
            const fieldKey = declFieldKey(decl.label, idx);
            const validUrl = isValidUrl(decl.linkUrl);
            const links =
              decl.linkLabel && validUrl
                ? [{ text: decl.linkLabel, url: decl.linkUrl as string, newTab: true }]
                : undefined;

            return (
              <div key={idx} className="flex items-start gap-3 rounded-lg border border-border p-4">
                <Checkbox
                  id={`decl-${idx}`}
                  checked={!!(form as unknown as Record<string, unknown>)[fieldKey]}
                  onCheckedChange={(v) => setField(fieldKey, v === true)}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor={`decl-${idx}`} className="text-sm cursor-pointer leading-relaxed">
                    <RichLabel label={decl.label} links={links} />
                  </Label>
                  {errors[fieldKey] && (
                    <p className="text-sm text-destructive mt-1">{errors[fieldKey]}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CAPTCHA */}
      {requireCaptcha && (
        <div className="form-section">
          <h3 className="text-lg font-semibold text-foreground">Security Verification</h3>
          <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4 mt-2">
            <Checkbox
              id="captcha"
              checked={form.captchaChecked}
              onCheckedChange={(v) => setField('captchaChecked', v === true)}
            />
            <Label htmlFor="captcha" className="text-sm font-normal cursor-pointer">
              I'm not a robot
            </Label>
            <div className="ml-auto flex items-center gap-2 text-muted-foreground">
              <Shield className="h-5 w-5" />
              <span className="text-xs">reCAPTCHA</span>
            </div>
          </div>
          {errors.captcha && <p className="text-sm text-destructive mt-1">{errors.captcha}</p>}
          <p className="text-xs text-muted-foreground mt-2">
            This is a placeholder captcha. A real CAPTCHA integration will be added in production.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── OTP Verification Sub-component ───

function OtpVerificationSection({
  form,
  errors,
  setField,
  verificationEmail,
}: {
  form: RegistrationFormData;
  errors: Record<string, string>;
  setField: (field: string, value: string | boolean) => void;
  verificationEmail?: string;
}) {
  // Resolved email: prefer parent-provided value (covers dynamic schemas), fall back to form.email.
  const resolvedEmail = (verificationEmail || form.email || '').trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedEmail);
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [sentToEmail, setSentToEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // If the user changes the email after sending an OTP, reset OTP-sent state.
  if (otpSent && sentToEmail && resolvedEmail !== sentToEmail) {
    queueMicrotask(() => {
      setOtpSent(false);
      setOtpCode('');
      setSentToEmail('');
    });
  }

  const startCooldown = () => {
    setCooldown(60);
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async () => {
    if (!resolvedEmail) {
      toast.error('Please provide an email address first');
      return;
    }
    if (!emailValid) {
      toast.error('The email address looks invalid. Please correct it in the previous step.');
      return;
    }
    setOtpSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-registration-otp', {
        body: { email: resolvedEmail, channel: 'email' },
      });
      if (error) { toast.error('Failed to send verification code'); return; }
      if (data?.error) { toast.error(data.error); return; }
      setOtpSent(true);
      setSentToEmail(resolvedEmail);
      startCooldown();
      toast.success('Verification code sent to ' + resolvedEmail);
    } catch {
      toast.error('Failed to send verification code');
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }
    setOtpVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-registration-otp', {
        body: { email: resolvedEmail, code: otpCode, channel: 'email' },
      });
      if (error) { toast.error('Verification failed'); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.verified) {
        setField('emailVerified', true);
        toast.success('Email verified successfully!');
      }
    } catch {
      toast.error('Verification failed');
    } finally {
      setOtpVerifying(false);
    }
  };

  return (
    <div className="form-section">
      <h3 className="text-lg font-semibold text-foreground">Email Verification</h3>
      <p className="text-sm text-muted-foreground">
        Verify your email address to proceed with registration.
      </p>

      {form.emailVerified ? (
        <div className="flex items-center gap-3 mt-4 p-4 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <div>
            <p className="font-medium text-green-800 dark:text-green-400">Email Verified</p>
            <p className="text-sm text-green-600 dark:text-green-500">{resolvedEmail || form.email}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span>
              Verification will be sent to:{' '}
              <strong className="text-foreground">{resolvedEmail || '(no email provided)'}</strong>
            </span>
          </div>

          {!otpSent ? (
            <Button type="button" variant="outline" onClick={handleSendOtp} disabled={otpSending || !resolvedEmail || !emailValid || cooldown > 0}>
              {otpSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Send Verification Code
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2 max-w-sm">
                <Input
                  placeholder="Enter 6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  className="font-mono text-center tracking-widest text-lg"
                />
                <Button type="button" onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6}>
                  {otpVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                </Button>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={handleSendOtp} disabled={cooldown > 0 || otpSending}>
                <RefreshCw className="h-3 w-3 mr-1" />
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
              </Button>
            </div>
          )}
          {errors.emailVerified && <p className="text-sm text-destructive">{errors.emailVerified}</p>}
        </div>
      )}
    </div>
  );
}
