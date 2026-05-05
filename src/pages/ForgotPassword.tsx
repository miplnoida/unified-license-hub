import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, ArrowLeft, MailCheck } from 'lucide-react';
import { LandingNav } from '@/components/landing/LandingNav';

type Step = 'email' | 'sent';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const sendResetLink = async (target: string) => {
    return supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) {
      toast.error('Please enter your email');
      return;
    }
    setLoading(true);
    const { error } = await sendResetLink(target);
    setLoading(false);
    if (error) {
      // Do not reveal whether email exists; only show generic transport errors.
      console.warn('[ForgotPassword] resetPasswordForEmail error:', error.message);
    }
    toast.success('If the account exists, a reset link has been sent.');
    setStep('sent');
  };

  const handleResend = async () => {
    const target = email.trim().toLowerCase();
    if (!target) return;
    setLoading(true);
    await sendResetLink(target);
    setLoading(false);
    toast.success('If the account exists, a new reset link has been sent.');
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
                <CardDescription>
                  Enter your email and we'll send you a secure password reset link.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSend} className="space-y-4">
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
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </Button>
                  <Button variant="ghost" className="w-full" type="button" onClick={() => navigate('/')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {step === 'sent' && (
            <>
              <CardHeader className="text-center space-y-2">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <MailCheck className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="text-2xl font-bold">Check Your Inbox</CardTitle>
                <CardDescription>
                  If an account exists for <span className="font-medium text-foreground">{email}</span>,
                  we've sent a password reset link. Follow the link to create a new password.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full" type="button" disabled={loading} onClick={handleResend}>
                  {loading ? 'Sending...' : 'Resend Reset Link'}
                </Button>
                <Button variant="ghost" className="w-full" type="button" onClick={() => navigate('/')}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
