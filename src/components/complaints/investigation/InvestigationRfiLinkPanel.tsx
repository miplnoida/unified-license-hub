/**
 * MC-03 — Information requests summary.
 *
 * Read-only over the investigation read model. RFIs are raised, reviewed and
 * closed in the existing Information requests section; this panel only
 * surfaces the outstanding position and routes the officer there.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, MailQuestion } from 'lucide-react';
import { formatDateOnly } from '@/lib/datetime';
import type { CaseWorkSection } from '@/lib/complaintWorkflow';
import type { InvestigationWorkspace } from '@/hooks/useComplaintInvestigation';

interface Props {
  workspace: InvestigationWorkspace;
  onOpenSection?: (section: CaseWorkSection) => void;
}

const CLOSED_STATES = ['closed', 'completed', 'responded', 'withdrawn', 'cancelled', 'resolved'];

export function InvestigationRfiLinkPanel({ workspace, onOpenSection }: Props) {
  const rfis = workspace.information_requests ?? [];
  const outstanding = rfis.filter((r) => !CLOSED_STATES.includes(String(r.status ?? '').toLowerCase()));
  const overdue = outstanding.filter((r) => r.due_at && new Date(r.due_at) < new Date());

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <MailQuestion className="h-4 w-4" />Information requests
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Requests are raised and reviewed in the Information requests section. Raising or answering one does not move
            the case out of investigation case work.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={outstanding.length ? 'default' : 'secondary'}>{outstanding.length} outstanding</Badge>
          {overdue.length > 0 && <Badge variant="destructive">{overdue.length} past due</Badge>}
          {onOpenSection && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onOpenSection('rfis')}>
              Open information requests<ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rfis.length === 0 ? (
          <p className="text-muted-foreground text-xs">No information requests have been raised on this complaint.</p>
        ) : (
          <ul className="space-y-2">
            {rfis.slice(0, 5).map((r) => (
              <li key={r.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {String(r.status ?? '').replace(/_/g, ' ')}
                  </Badge>
                  <p className="text-sm font-medium">{r.summary ?? 'Information request'}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {r.item_count} item{r.item_count === 1 ? '' : 's'}
                  {r.due_at ? ` · due ${formatDateOnly(r.due_at)}` : ''}
                  {r.allegation_numbers?.length ? ` · allegations ${r.allegation_numbers.join(', ')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        {rfis.length > 5 && (
          <p className="text-xs text-muted-foreground">
            Showing the 5 most recent of {rfis.length}. Open the Information requests section for the full register.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default InvestigationRfiLinkPanel;
