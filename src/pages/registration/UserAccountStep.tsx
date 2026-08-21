/**
 * `/register/account` — shared USER ACCOUNT prerequisite for both public
 * registration journeys. Account creation is NOT a registration journey.
 *
 * Chain: /register (journey choice) → either FORM_FIRST /register/applicant
 * or ENTITY_FIRST /register/entity. When a journey needs an account first,
 * the user lands here and is returned to the journey they selected (carried in
 * `?journey=` / `?next=`, defaulting to entity identification), keeping the
 * intended application and query parameters intact.
 *
 * Reuses the existing OTP edge functions (`send-registration-otp`,
 * `verify-registration-otp`) and verification persistence helpers — no new
 * auth mechanism is introduced.
 */
import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Info, Loader2, Mail, RefreshCw, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  checkEmailVerifiedOnServer,
  isEmailVerifiedLocally,
  markEmailVerifiedLocally,
  normalizeVerificationEmail,
} from '@/lib/registrationEmailVerified';
import { readIntentFromSearch, withIntentParam } from '@/lib/applicationIntent';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function UserAccountStep() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signup } = useAuth();
  const intent = readIntentFromSearch(location.search);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [creating, setCreating] = useState(false);

  const resolvedEmail = normalizeVerificationEmail(email);
  const emailValid = EMAIL_RE.test(resolvedEmail);

  // The selected journey must survive account creation: never force the user
  // into ENTITY_FIRST when they chose FORM_FIRST.
  const journeyKey = new URLSearchParams(location.search).get('journey') || '';
  const nextParam = new URLSearchParams(location.search).get('next') || '';
  const resumeRoute =
    (nextParam.startsWith('/register/') && nextParam) ||
    (journeyKey === 'FORM_FIRST' ? '/register/applicant' : '/register/entity');

  const goToJourneyStep = () => {
    const target = journeyKey
      ? `${resumeRoute}${resumeRoute.includes('?') ? '&' : '?'}journey=${encodeURIComponent(journeyKey)}`
      : resumeRoute;
    navigate(withIntentParam(target, intent));
  };

  const handleSendOtp = async () => {
    if (!emailValid) { toast.error('Enter a valid email address first'); return; }
    setOtpSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-registration-otp', {
        body: { email: resolvedEmail, channel: 'email' },
      });
      if (error || data?.error) { toast.error(data?.error || 'Failed to send verification code'); return; }
      setOtpSent(true);
      toast.success(`Verification code sent to ${resolvedEmail}`);
    } catch {
      toast.error('Failed to send verification code');
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    setOtpVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-registration-otp', {
        body: { email: resolvedEmail, code: otpCode, channel: 'email' },
      });
      if (error || data?.error) { toast.error(data?.error || 'Verification failed'); return; }
      if (data?.verified) {
        markEmailVerifiedLocally(resolvedEmail);
        setEmailVerified(true);
        toast.success('Email verified');
      }
    } catch {
      toast.error('Verification failed');
    } finally {
      setOtpVerifying(false);
    }
  };

  // Local/server hydration: if this email was already verified in this
  // session (or on the server), do not force re-entry of the OTP.
  useState(() => {
    if (emailValid && isEmailVerifiedLocally(resolvedEmail)) setEmailVerified(true);
  });

  const createAccount = async () => {
    if (!emailValid) { toast.error('Enter a valid email address'); return; }
    if (!emailVerified) {
      const verifiedOnServer = await checkEmailVerifiedOnServer(resolvedEmail);
      if (!verifiedOnServer) { toast.error('Please verify your email first'); return; }
      setEmailVerified(true);
    }
    if (!firstName.trim() || !lastName.trim()) { toast.error('Enter your first and last name'); return; }
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }

    setCreating(true);
    try {
      const { error } = await signup(resolvedEmail, password, `${firstName.trim()} ${lastName.trim()}`, 'pre_licensee');
      if (error) { toast.error(error); return; }
      toast.success(
        resumeRoute === '/register/applicant'
          ? 'Account created. Continuing with your registration.'
          : 'Account created. Next, tell us which entity you act for.',
      );
      goToJourneyStep();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-xl space-y-4 px-4 py-10 sm:px-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <UserPlus className="h-4 w-4" /> User account
          </div>
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-sm text-muted-foreground">
            This creates only your personal user account. Once verified, you will continue with the registration option
            you selected — your account and the organisation’s records are kept separate.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your details</CardTitle>
            <CardDescription>Used to contact you about your account, not published anywhere.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={emailVerified} />
              </div>
              <div>
                <Label className="text-xs">Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={emailVerified} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Email address</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={emailVerified} placeholder="you@example.com" />
            </div>

            {emailVerified ? (
              <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div className="text-sm">
                  <p className="font-medium text-green-800 dark:text-green-400">Email verified</p>
                  <p className="text-green-600 dark:text-green-500">{resolvedEmail}</p>
                </div>
              </div>
            ) : !otpSent ? (
              <Button type="button" variant="outline" onClick={handleSendOtp} disabled={otpSending || !emailValid}>
                {otpSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Send verification code
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to {resolvedEmail}.</p>
                <div className="flex max-w-sm gap-2">
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    className="text-center font-mono tracking-widest"
                    placeholder="000000"
                  />
                  <Button type="button" onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6}>
                    {otpVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                  </Button>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={handleSendOtp} disabled={otpSending}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Resend code
                </Button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Confirm password</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
            </div>

            <Button className="w-full" onClick={createAccount} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create account and continue
            </Button>
          </CardContent>
        </Card>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Updating or resubmitting an existing registration?</AlertTitle>
          <AlertDescription>
            Use the <Link className="underline" to="/registration/portal">registration portal</Link> — do not create a new
            account. Starting fresh instead?{' '}
            <Link className="underline" to="/register">Choose a registration option</Link>.
          </AlertDescription>
        </Alert>
      </main>
    </div>
  );
}
