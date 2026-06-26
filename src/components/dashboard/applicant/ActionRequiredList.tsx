import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { BellRing, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const REQUEST_TYPE_LABEL: Record<string, string> = {
  query_raised: 'Clarification Requested',
  info_requested: 'More Information Requested',
  resubmission_requested: 'Resubmission Requested',
  resubmission_required: 'Resubmission Required',
  returned_for_correction: 'Returned for Correction',
};

export interface ActionRequiredRow {
  id: string;
  application_number: string | null;
  status: string;
  updated_at: string;
}

interface Props {
  rows: ActionRequiredRow[];
}

/**
 * Applicant-facing surface for existing workflow actions (RFI, resubmission,
 * return-for-correction). Pure presentation — no new workflow tables/calls.
 * Continue routes to the existing /applications/:id edit page.
 */
export function ActionRequiredList({ rows }: Props) {
  if (!rows.length) {
    return (
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-3">
            <BellRing className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Action required</h3>
          </div>
          <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            No open requests. You are all caught up.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 mb-3">
          <BellRing className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold">Action required</h3>
          <Badge variant="outline" className="ml-auto bg-amber-500/10 text-amber-700 border-amber-500/30">
            {rows.length}
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {rows.map((a) => {
            const requestType = REQUEST_TYPE_LABEL[a.status] || 'Needs Changes';
            return (
              <div
                key={a.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border bg-card p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs">
                      {a.application_number || a.id.slice(0, 8)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {requestType}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Requested {a.updated_at ? formatDistanceToNow(new Date(a.updated_at), { addSuffix: true }) : '—'}
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link to={`/applications/${a.id}`}>Continue</Link>
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
