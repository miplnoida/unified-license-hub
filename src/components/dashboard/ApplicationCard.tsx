import { Application } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, ArrowRight, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface ApplicationCardProps {
  application: Application;
  showActions?: boolean;
  onView?: () => void;
  onReview?: () => void;
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  query_raised: 'Query Raised',
  approved: 'Approved',
  rejected: 'Rejected',
  returned: 'Returned',
};

export function ApplicationCard({
  application,
  showActions = true,
  onView,
  onReview,
}: ApplicationCardProps) {
  return (
    <div className="card-elevated p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h4 className="font-semibold text-foreground">
              {application.applicationNumber}
            </h4>
            <p className="text-sm text-muted-foreground">Pre-License Application</p>
          </div>
        </div>
        <Badge variant={application.status.replace('_', '-') as any}>
          {statusLabels[application.status]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Sector</p>
          <p className="font-medium">Insurance</p>
        </div>
        <div>
          <p className="text-muted-foreground">Category</p>
          <p className="font-medium">Life Insurance</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>
          {application.submittedAt
            ? `Submitted ${format(new Date(application.submittedAt), 'MMM d, yyyy')}`
            : `Created ${format(new Date(application.createdAt), 'MMM d, yyyy')}`}
        </span>
      </div>

      {showActions && (
        <div className="flex gap-2 pt-2 border-t">
          <Button variant="card-action" size="sm" className="flex-1" onClick={onView}>
            View Details
            <ArrowRight className="h-4 w-4" />
          </Button>
          {onReview && application.status === 'submitted' && (
            <Button variant="default" size="sm" onClick={onReview}>
              Review
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
