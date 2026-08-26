/**
 * Public market-conduct complaint intake (/complaints/file).
 *
 * Consumers of financial services are not portal users, so this route is
 * intentionally unauthenticated. The journey is a seven-step guided wizard
 * (MC-01) that captures structured information about the people involved, the
 * business complained about — whether we regulate it now, regulated it in the
 * past, or cannot match it at all — and what the consumer would like to happen.
 *
 * No eligibility or jurisdiction decision is shown to the consumer here: that
 * assessment happens after intake.
 */
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PublicComplaintWizard } from '@/components/complaints/public-intake/PublicComplaintWizard';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

export default function PublicComplaintIntake() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to home
        </Link>
        <h1 className="mb-1 text-2xl font-bold">Make a complaint about a financial business</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          You do not need an account. We will take you through seven short steps, and you can complain
          about a business we regulate now, one we regulated in the past, or one you cannot find in our
          register. After you submit, we will assess whether the matter is within our role and what
          happens next.
        </p>

        <Alert className="mb-6">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Where you can, it helps to raise the problem with the business first. Never include
            passwords, PINs, full card numbers or security codes anywhere in this form.
          </AlertDescription>
        </Alert>

        <PublicComplaintWizard />

        <div className="pt-6">
          <Button asChild variant="ghost" size="sm">
            <Link to="/track/complaint">Already made a complaint? Track it here</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
