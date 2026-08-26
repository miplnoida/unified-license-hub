/**
 * Truly public complaint tracking page.
 *
 * Reachable at /track/complaint with no account. For complaints lodged through
 * the MC-01 wizard, identity is proven with the complaint reference plus the
 * tracking access code issued at submission. Older complaints can still be
 * tracked with the reference plus the email address on file. Verification
 * happens server-side and the response is uniform, so nothing is disclosed when
 * the credentials do not match.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Button } from '@/components/ui/button';
import { ComplaintTrackingView } from '@/components/complaints/ComplaintTrackingView';

export default function PublicComplaintTracking() {
  const [params] = useSearchParams();
  const [lookup, setLookup] = useState<{ reference?: string; email: string; accessCode: string }>({
    reference: params.get('reference') ?? undefined,
    email: '',
    accessCode: '',
  });

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold">Track your complaint</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your complaint reference and the tracking access code you were given when you
            submitted it to see the latest status, actions taken and progress. No account is needed.
          </p>
        </div>

        <ComplaintTrackingView
          publicMode
          reference={lookup.reference}
          email={lookup.email}
          accessCode={lookup.accessCode}
          onLookup={(reference, email, accessCode) =>
            setLookup({ reference, email, accessCode: accessCode ?? '' })
          }
        />

        <div className="pt-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/complaints/file">Make a new complaint</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

