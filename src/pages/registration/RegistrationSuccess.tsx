import { useLocation, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowRight, Clock, FileSearch, Mail } from 'lucide-react';

export default function RegistrationSuccess() {
  const location = useLocation();
  const registrationReference = location.state?.registrationReference || 'REG-XXXX-XXXXXX';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full animate-slide-up">
        <CardContent className="pt-8 pb-8 space-y-6">
          {/* Success icon */}
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Registration Submitted Successfully!</h1>
            <p className="text-muted-foreground text-sm mt-2">
              Your registration application has been received and is now under review.
            </p>
          </div>

          {/* Reference Number */}
          <div className="rounded-lg bg-muted/50 border border-border p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Registration Reference</p>
            <p className="text-2xl font-bold font-mono text-primary">{registrationReference}</p>
            <p className="text-xs text-muted-foreground mt-2">Please save this reference for your records</p>
          </div>

          {/* Status info */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <FileSearch className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Application Under Review</p>
                <p className="text-xs text-muted-foreground">Our team will review your submitted documents and information.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <Clock className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Expected Processing Time</p>
                <p className="text-xs text-muted-foreground">3–5 business days. You will receive a notification once reviewed.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <Mail className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Confirmation Email Sent</p>
                <p className="text-xs text-muted-foreground">A confirmation email with your reference number has been sent to your registered email.</p>
              </div>
            </div>
          </div>

          {/* Next steps */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <p className="text-sm font-medium text-foreground mb-2">Next Steps</p>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Your registration will be reviewed by the regulatory team.</li>
              <li>You may be contacted for additional information if needed.</li>
              <li>Once approved, you will receive login credentials to access the portal.</li>
              <li>After login, you can complete any required application forms.</li>
            </ol>
          </div>

          {/* Action */}
          <div className="text-center">
            <Button size="lg" asChild>
              <Link to="/">
                Go to Login
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
