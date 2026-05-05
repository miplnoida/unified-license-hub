import { useLocation, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export default function RegistrationSuccess() {
  const location = useLocation();
  const registrationReference = location.state?.registrationReference || 'REG-XXXX-XXXXXX';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md animate-slide-up">
        <CardContent className="p-6 text-center space-y-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">Registration Completed</h1>
            <p className="text-sm text-muted-foreground">
              Your registration has been saved successfully. Log in to continue your license application.
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 border border-border p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Registration Reference</p>
            <p className="text-lg font-bold font-mono text-primary mt-0.5">{registrationReference}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Keep this reference for support.</p>
          </div>

          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-sm font-medium text-foreground">
              Next step: Log in and complete your license application.
            </p>
          </div>

          <Button asChild className="w-full">
            <Link to="/">
              Login to Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
