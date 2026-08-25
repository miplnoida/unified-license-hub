/**
 * Truly public complaint tracking page.
 *
 * Reachable at /track/complaint with no account. Identity is verified by the
 * complaint reference plus the contact email on file, checked server-side inside
 * the public complaint intake function, which returns the same redacted record
 * the signed-in view uses — public status labels only, no assignee names, no
 * internal notes.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Button } from '@/components/ui/button';
import { ComplaintTrackingView } from '@/components/complaints/ComplaintTrackingView';

export default function PublicComplaintTracking() {
  const [lookup, setLookup] = useState<{ reference?: string; email: string }>({ email: '' });

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Track your complaint</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your complaint reference number and the email address you used when
            submitting it to see the latest status, actions taken and progress. No
            account is needed.
          </p>
        </div>

        <ComplaintTrackingView
          publicMode
          reference={lookup.reference}
          email={lookup.email}
          onLookup={(reference, email) => setLookup({ reference, email })}
        />

        <div className="pt-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/complaints/file">File a new complaint</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
