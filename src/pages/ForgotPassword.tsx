import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import { LandingNav } from '@/components/landing/LandingNav';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

type Step = 'email' | 'otp' | 'new-password' | 'success';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('OTP sent to your email');
    setStep('otp');
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'recovery',
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Code verified successfully');
    setStep('new-password');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirm) {
      toast.error('Please fill all fields');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.auth.signOut();
    toast.success('Password updated successfully');
    setStep('success');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <LandingNav />
      <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {step === 'email' && (
          <>
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold">Forgot Password</CardTitle>
              <CardDescription>Enter your email to receive a verification code.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="your.email@example.com"
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending...' : 'Send OTP'}
                </Button>
                <Button variant="ghost" className="w-full" type="button" onClick={() => navigate('/')}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {step === 'otp' && (
          <>
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold">Enter Verification Code</CardTitle>
              <CardDescription>
                We've sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                  {loading ? 'Verifying...' : 'Verify Code'}
                </Button>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" className="w-full" type="button" disabled={loading} onClick={async () => {
                    setLoading(true);
                    const { error } = await supabase.auth.resetPasswordForEmail(email);
                    setLoading(false);
                    if (error) { toast.error(error.message); return; }
                    toast.success('New OTP sent');
                    setOtp('');
                  }}>
                    Resend Code
                  </Button>
                  <Button variant="ghost" className="w-full" type="button" onClick={() => { setStep('email'); setOtp(''); }}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Change Email
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        )}

        {step === 'new-password' && (
          <>
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Lock className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold">Set New Password</CardTitle>
              <CardDescription>Choose a strong new password for your account.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="new-password" type="password" placeholder="Min. 6 characters" className="pl-10" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="confirm-password" type="password" placeholder="Confirm new password" className="pl-10" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {step === 'success' && (
          <>
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <CardTitle>Password Updated</CardTitle>
              <CardDescription>Your password has been successfully changed. Please sign in with your new password.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => navigate('/')}>
                Sign In
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
