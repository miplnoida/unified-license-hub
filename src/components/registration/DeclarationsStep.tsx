import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, ExternalLink, Mail, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
  declarations?: DeclarationConfig[];
  termsUrl?: string;
  privacyUrl?: string;
  dataProtectionUrl?: string;
  requireOtp?: boolean;
  requireCaptcha?: boolean;
}

export function DeclarationsStep({ form, errors, setField, declarations, termsUrl, privacyUrl, dataProtectionUrl, requireOtp = true, requireCaptcha = true }: Props) {
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const startCooldown = () => {
    setCooldown(60);
    const interval = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async () => {
    if (!form.email) {
      toast.error('Please provide an email address in Step 2 first');
      return;
    }
    setOtpSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-registration-otp', {
        body: { email: form.email, channel: 'email' },
      });

      if (error) {
        toast.error('Failed to send verification code');
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setOtpSent(true);
      startCooldown();
      toast.success('Verification code sent to ' + form.email);
    } catch (err) {
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
        body: { email: form.email, code: otpCode, channel: 'email' },
      });

      if (error) {
        toast.error('Verification failed');
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      if (data?.verified) {
        setField('emailVerified', true);
        toast.success('Email verified successfully!');
      }
    } catch (err) {
      toast.error('Verification failed');
    } finally {
      setOtpVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Email OTP Verification */}
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
              <p className="text-sm text-green-600 dark:text-green-500">{form.email}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>Verification will be sent to: <strong className="text-foreground">{form.email || '(no email provided)'}</strong></span>
            </div>

            {!otpSent ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleSendOtp}
                disabled={otpSending || !form.email}
              >
                {otpSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                Send Verification Code
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2 max-w-sm">
                  <Input
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    className="font-mono text-center tracking-widest text-lg"
                  />
                  <Button type="button" onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6}>
                    {otpVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSendOtp}
                  disabled={cooldown > 0 || otpSending}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
                </Button>
              </div>
            )}
            {errors.emailVerified && <p className="text-sm text-destructive">{errors.emailVerified}</p>}
          </div>
        )}
      </div>

      {/* Terms & Conditions */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground">Declarations</h3>
        <p className="text-sm text-muted-foreground">
          Please review and accept the following before submitting your registration.
        </p>

        <div className="mt-4 space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-border p-4">
            <Checkbox
              id="termsAccepted"
              checked={form.termsAccepted}
              onCheckedChange={(v) => setField('termsAccepted', v === true)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="termsAccepted" className="text-sm cursor-pointer leading-relaxed">
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  Terms & Conditions <ExternalLink className="h-3 w-3" />
                </a>
              </Label>
              {errors.termsAccepted && <p className="text-sm text-destructive mt-1">{errors.termsAccepted}</p>}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border p-4">
            <Checkbox
              id="privacyAccepted"
              checked={form.privacyAccepted}
              onCheckedChange={(v) => setField('privacyAccepted', v === true)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="privacyAccepted" className="text-sm cursor-pointer leading-relaxed">
                I agree to the{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  Privacy Policy <ExternalLink className="h-3 w-3" />
                </a>
              </Label>
              {errors.privacyAccepted && <p className="text-sm text-destructive mt-1">{errors.privacyAccepted}</p>}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border p-4">
            <Checkbox
              id="dataProtectionAccepted"
              checked={form.dataProtectionAccepted}
              onCheckedChange={(v) => setField('dataProtectionAccepted', v === true)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="dataProtectionAccepted" className="text-sm cursor-pointer leading-relaxed">
                I agree to the{' '}
                <a href="/data-protection" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  Data Protection Notice <ExternalLink className="h-3 w-3" />
                </a>
              </Label>
              {errors.dataProtectionAccepted && <p className="text-sm text-destructive mt-1">{errors.dataProtectionAccepted}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* CAPTCHA */}
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
    </div>
  );
}
