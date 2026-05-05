import { useLocation, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowRight, LogIn, ClipboardList } from 'lucide-react';

export default function RegistrationSuccess() {
  const location = useLocation();
  const registrationReference = location.state?.registrationReference || 'REG-XXXX-XXXXXX';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-xl w-full animate-slide-up">
        <CardContent className="pt-8 pb-8 space-y-6">
          {/* Success icon */}
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Registration Completed Successfully!</h1>
            <p className="text-muted-foreground text-sm mt-2">
              Your account registration has been completed. Please log in to continue your license application.
            </p>
          </div>

          {/* Reference Number */}
          <div className="rounded-lg bg-muted/50 border border-border p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Registration Reference</p>
            <p className="text-2xl font-bold font-mono text-primary">{registrationReference}</p>
            <p className="text-xs text-muted-foreground mt-2">Use this reference if you need support with your registration.</p>
          </div>

          {/* Status info */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Account Created</p>
                <p className="text-xs text-muted-foreground">Your registration details have been saved successfully.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <LogIn className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Login to Continue</p>
                <p className="text-xs text-muted-foreground">Sign in with your registered email to access the applicant portal.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <ClipboardList className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Complete License Application</p>
                <p className="text-xs text-muted-foreground">
                  Select your sector, sub-sector, and category, then complete the required forms, documents, payment, and final submission.
                </p>
              </div>
            </div>
          </div>

          {/* Next steps */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <p className="text-sm font-medium text-foreground mb-2">Next Steps</p>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Click "Login to Continue Application".</li>
              <li>Sign in using your registered email.</li>
              <li>Start or continue your license application from the applicant dashboard.</li>
              <li>Complete all required forms, upload documents, make payment if applicable, and submit.</li>
            </ol>
          </div>

          {/* Highlighted CTA */}
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-center space-y-1">
            <p className="text-sm font-semibold text-foreground">Ready for the next step?</p>
            <p className="text-xs text-muted-foreground">
              Log in now to complete and submit your license application.
            </p>
          </div>

          {/* Action */}
          <div className="text-center">
            <Button size="lg" asChild>
              <Link to="/">
                Login to Continue Application
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
