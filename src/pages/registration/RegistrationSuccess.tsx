import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export default function RegistrationSuccess() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full animate-slide-up">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">Registration Successful!</h1>
            <p className="text-muted-foreground text-sm">
              Your email has been verified and your pre-licensee registration is complete.
              You can now log in to access your dashboard and begin your license application.
            </p>
          </div>

          <div className="rounded-lg bg-success/5 border border-success/20 p-4 text-sm text-foreground space-y-1">
            <p className="font-medium">What's next?</p>
            <p className="text-muted-foreground">Log in to your account to start your pre-license application process.</p>
          </div>

          <Button size="lg" asChild>
            <Link to="/">
              Go to Login
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
