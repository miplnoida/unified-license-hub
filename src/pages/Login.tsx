import { useEffect, useState } from 'react';
import { LandingNav } from '@/components/landing/LandingNav';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, login, logout } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // 2FA gate state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingUserId, setPendingUserId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  // If user lands here with an existing session that hasn't passed 2FA, show OTP gate
  useEffect(() => {
    const pendingId = sessionStorage.getItem('pending_2fa_user_id');
    const verifiedId = sessionStorage.getItem('two_factor_verified_user_id');
    if (pendingId && pendingId !== verifiedId) {
      supabase.auth.getUser().then(({ data: { user: u } }) => {
        if (u && u.id === pendingId) {
          setPendingUserId(u.id);
          setPendingEmail(u.email || '');
          setMfaRequired(true);
        }
      });
    }
  }, []);

  if (isAuthenticated && !mfaRequired) {
    const pendingId = sessionStorage.getItem('pending_2fa_user_id');
    const verifiedId = sessionStorage.getItem('two_factor_verified_user_id');
    if (!pendingId || pendingId === verifiedId) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  const sendLoginOtp = async (emailAddr: string) => {
    setOtpSending(true);
    const { data, error } = await supabase.functions.invoke('send-registration-otp', {
      body: { email: emailAddr, channel: 'email', purpose: 'login_2fa' },
    });
    setOtpSending(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Failed to send code');
      return false;
    }
    toast.success(`Verification code sent to ${emailAddr}`);
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Please enter email and password'); return; }
    setLoading(true);
    const result = await login(email, password);
    if (result.error) { setLoading(false); toast.error(result.error); return; }

    // Get the freshly created session/user
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setLoading(false); toast.error('Login failed'); return; }

    // Check 2FA flag on profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('two_factor_enabled')
      .eq('id', authUser.id)
      .maybeSingle();

    setLoading(false);

    if ((prof as any)?.two_factor_enabled) {
      sessionStorage.setItem('pending_2fa_user_id', authUser.id);
      sessionStorage.removeItem('two_factor_verified_user_id');
      setPendingEmail(authUser.email || email);
      setPendingUserId(authUser.id);
      setMfaRequired(true);
      await sendLoginOtp(authUser.email || email);
      return;
    }

    // No 2FA — clear any stale flags and proceed
    sessionStorage.removeItem('pending_2fa_user_id');
    sessionStorage.setItem('two_factor_verified_user_id', authUser.id);
    toast.success('Login successful');
    navigate('/dashboard');
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    setOtpVerifying(true);
    const { data, error } = await supabase.functions.invoke('verify-registration-otp', {
      body: { email: pendingEmail, code: otpCode, channel: 'email', purpose: 'login_2fa' },
    });
    setOtpVerifying(false);
    if (error || !(data as any)?.verified) {
      toast.error((data as any)?.error || error?.message || 'Invalid verification code');
      setOtpCode('');
      return;
    }
    sessionStorage.removeItem('pending_2fa_user_id');
    sessionStorage.setItem('two_factor_verified_user_id', pendingUserId);
    toast.success('Verification successful');
    setMfaRequired(false);
    navigate('/dashboard');
  };

  const handleCancelMfa = async () => {
    sessionStorage.removeItem('pending_2fa_user_id');
    sessionStorage.removeItem('two_factor_verified_user_id');
    await logout();
    setMfaRequired(false);
    setOtpCode('');
    setPendingEmail('');
    setPendingUserId('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/40">
      <LandingNav />
      <div className="flex-1 flex flex-col items-center justify-center p-4">

      <Card className="w-full max-w-[420px] shadow-card">
        {!mfaRequired ? (
          <>
            <CardHeader className="text-center space-y-1 pb-4">
              <CardTitle className="text-xl font-bold">Welcome back</CardTitle>
              <CardDescription>Sign in to your account to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="login-email" type="email" placeholder="your.email@example.com" className="pl-10"
                      value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="login-password" type={showPw ? 'text' : 'password'} placeholder="Enter your password" className="pl-10 pr-10"
                      value={password} onChange={(e) => setPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                  {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button type="button" onClick={() => navigate('/forgot-password')} className="text-primary hover:underline">
                    Forgot password?
                  </button>
                  <button type="button" onClick={() => navigate('/register')} className="text-primary hover:underline">
                    Create account
                  </button>
                </div>
              </form>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="text-center space-y-1 pb-4">
              <div className="flex justify-center mb-2"><ShieldCheck className="h-10 w-10 text-primary" /></div>
              <CardTitle className="text-xl font-bold">Two-Factor Verification</CardTitle>
              <CardDescription>
                Enter the 6-digit code sent to <strong>{pendingEmail}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-otp">Verification Code</Label>
                <Input
                  id="login-otp"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>
              <Button onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6} className="w-full">
                {otpVerifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Verify & Continue
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={otpSending}
                onClick={() => sendLoginOtp(pendingEmail)}
              >
                {otpSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Resend code
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={handleCancelMfa}>
                Cancel and sign out
              </Button>
            </CardContent>
          </>
        )}
      </Card>
      </div>
    </div>
  );
}
