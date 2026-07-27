/**
 * Public complaint tracking page.
 *
 * Reachable at /track/complaint. Requires a complaint reference number and,
 * for non-anonymous complaints, the contact email on file. Uses the
 * `get_public_complaint_tracking` RPC which returns a redacted view — public
 * status labels only, no assignee names, no internal notes.
 */
import { Card, CardContent } from '@/components/ui/card';
import { ComplaintTrackingPanel } from '@/components/complaints/ComplaintTrackingPanel';

export default function PublicComplaintTracking() {
  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Track your complaint</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your complaint reference number to see the latest public status.
            You will need the email address you used when submitting the complaint.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <ComplaintTrackingPanel />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
