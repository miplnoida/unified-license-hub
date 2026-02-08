import { useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MailCheck, ArrowLeft } from 'lucide-react';

export default function VerificationPending() {
  const location = useLocation();
  const email = (location.state as { email?: string })?.email || 'your email';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full animate-slide-up">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-info/10">
            <MailCheck className="h-8 w-8 text-info" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">Verify Your Email</h1>
            <p className="text-muted-foreground text-sm">
              A verification link has been sent to{' '}
              <span className="font-medium text-foreground">{email}</span>.
              Please check your inbox and click the link to complete your registration.
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 border p-4 text-sm text-muted-foreground space-y-2">
            <p>• The link will expire in 24 hours</p>
            <p>• Check your spam/junk folder if you don't see the email</p>
            <p>• Your registration data has been saved</p>
          </div>

          <div className="flex flex-col gap-3">
            <Button variant="outline" asChild>
              <Link to="/registration/success">
                Simulate Verification
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
