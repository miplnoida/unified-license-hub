/**
 * Public complaint tracking page.
 *
 * Reachable at /track/complaint. Requires a complaint reference number and,
 * for non-anonymous complaints, the contact email on file. Uses the
 * `get_public_complaint_tracking` RPC which returns a redacted view — public
 * status labels only, no assignee names, no internal notes.
 */
import { useState } from 'react';
import { ComplaintTrackingView } from '@/components/complaints/ComplaintTrackingView';

export default function PublicComplaintTracking() {
  const [lookup, setLookup] = useState<{ reference?: string; email: string }>({ email: '' });

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Track your complaint</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your complaint reference number to see the latest public status,
            actions taken and progress. You will need the email address you used
            when submitting the complaint.
          </p>
        </div>

        <ComplaintTrackingView
          reference={lookup.reference}
          email={lookup.email}
          onLookup={(reference, email) => setLookup({ reference, email })}
        />
      </div>
    </div>
  );
}
