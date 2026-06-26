import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_VERB: Record<string, string> = {
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
  license_issued: 'License issued',
};

const ACTION_VERB: Record<string, string> = {
  application_created: 'Draft saved',
  application_updated: 'Draft updated',
  application_submitted: 'Application submitted',
  application_resubmitted: 'Resubmitted',
  application_approved: 'Application approved',
  application_rejected: 'Application rejected',
  application_returned: 'Returned for correction',
  info_requested: 'More information requested',
  resubmission_requested: 'Resubmission requested',
  license_issued: 'License issued',
  payment_completed: 'Payment completed',
  document_uploaded: 'Document uploaded',
};

export interface RecentActivityRow {
  id: string;
  application_number: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
}

interface ActivityItem {
  key: string;
  label: string;
  ref: string | null;
  href: string;
  ts: string;
}

interface Props {
  rows: RecentActivityRow[];
}

function actionToLabel(action: string): string {
  if (ACTION_VERB[action]) return ACTION_VERB[action];
  return action
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RecentActivityPanel({ rows }: Props) {
  const { user } = useAuth();

  const { data: auditItems = [] } = useQuery({
    queryKey: ['applicant-recent-audit', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<ActivityItem[]> => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, entity_type, entity_id, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) return [];
      return (data || []).map((r: any) => ({
        key: r.id,
        label: actionToLabel(r.action || 'updated'),
        ref: r.entity_id ? String(r.entity_id).slice(0, 8) : null,
        href:
          r.entity_type === 'application' && r.entity_id
            ? `/applications/${r.entity_id}`
            : '#',
        ts: r.created_at,
      }));
    },
  });

  const fallbackItems: ActivityItem[] = rows.map((a) => {
    const ts = a.updated_at || a.created_at;
    return {
      key: `${a.id}-${ts}`,
      label: STATUS_VERB[a.status] || 'Status updated',
      ref: a.application_number || a.id.slice(0, 8),
      href: `/applications/${a.id}`,
      ts,
    };
  });

  const items = auditItems.length > 0 ? auditItems : fallbackItems;

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Recent activity</h3>
        </div>
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            No recent activity
          </div>
        ) : (
          <ul className="divide-y">
            {items.slice(0, 8).map((it) => (
              <li key={it.key} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {it.href !== '#' ? (
                    <Link to={it.href} className="text-sm font-medium hover:underline truncate block">
                      {it.label}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium truncate block">{it.label}</span>
                  )}
                  {it.ref && (
                    <p className="text-xs text-muted-foreground font-mono truncate">{it.ref}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {it.ts ? formatDistanceToNow(new Date(it.ts), { addSuffix: true }) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
