/**
 * Signed-in complaint tracking page.
 *
 * Routes: /complaints/track and /complaints/track/:reference
 */
import { useNavigate, useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ComplaintTrackingView } from '@/components/complaints/ComplaintTrackingView';

export default function ComplaintTracking() {
  const { reference } = useParams<{ reference?: string }>();
  const nav = useNavigate();
  const { user } = useAuth();

  return (
    <DashboardLayout>
      <PageHeader
        title="Track Complaint"
        description="Follow the progress, actions taken and outcome of a complaint."
        actions={
          <Button variant="outline" asChild>
            <Link to="/complaints"><ArrowLeft className="h-4 w-4 mr-2" />Back to complaints</Link>
          </Button>
        }
      />
      <div className="mt-4">
        <ComplaintTrackingView
          reference={reference ? decodeURIComponent(reference) : undefined}
          email={user?.email ?? ''}
          hideEmailField
          onLookup={(ref) => nav(`/complaints/track/${encodeURIComponent(ref)}`)}
        />
      </div>
    </DashboardLayout>
  );
}
