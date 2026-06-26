import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Activity } from 'lucide-react';

const ACTIVITY_VERB: Record<string, string> = {
  draft: 'Draft saved',
  in_progress: 'Draft updated',
  submitted: 'Application submitted',
  under_review: 'Moved to review',
  review: 'Moved to review',
  pending_review: 'Pending review',
  query_raised: 'Clarification requested',
  info_requested: 'More information requested',
  resubmission_requested: 'Resubmission requested',
  resubmission_required: 'Resubmission required',
  returned_for_correction: 'Returned for correction',
  approved: 'Application approved',
  rejected: 'Application rejected',
  cancelled: 'Application cancelled',
  withdrawn: 'Application withdrawn',
};

export interface RecentActivityRow {
  id: string;
  application_number: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
}

interface Props {
  rows: RecentActivityRow[];
}

export function RecentActivityPanel({ rows }: Props) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Recent activity</h3>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            No recent activity
          </div>
        ) : (
          <ul className="divide-y">
            {rows.slice(0, 8).map((a) => {
              const ts = a.updated_at || a.created_at;
              const verb = ACTIVITY_VERB[a.status] || 'Status updated';
              return (
                <li key={`${a.id}-${ts}`} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/applications/${a.id}`} className="text-sm font-medium hover:underline truncate block">
                      {verb}
                    </Link>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {a.application_number || a.id.slice(0, 8)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
