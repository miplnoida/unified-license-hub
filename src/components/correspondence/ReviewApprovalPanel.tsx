import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, MessageSquare } from 'lucide-react';

export function ReviewApprovalPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3 bg-muted/30 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Reviewer comments</span>
          <Badge variant="secondary">2</Badge>
        </div>
        <div className="text-xs space-y-2">
          <div className="p-2 rounded bg-background border">
            <div className="font-medium">S. Reid · Senior Examiner</div>
            <div className="text-muted-foreground">Recommend approving extension of 7 days (not 10). Migration timeline supports this.</div>
          </div>
          <div className="p-2 rounded bg-background border">
            <div className="font-medium">M. Grant · Head, Supervision</div>
            <div className="text-muted-foreground">Concur with 7-day extension. Ensure the licensee re-confirms revised submission date.</div>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs">Approval decision note</Label>
        <Textarea rows={4} placeholder="Enter rationale for the approval or rejection decision…" />
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" size="sm" data-rbac="correspondence_management.reject"><XCircle className="h-4 w-4 mr-1" />Reject</Button>
        <Button size="sm" data-rbac="correspondence_management.approve"><CheckCircle2 className="h-4 w-4 mr-1" />Approve response</Button>
      </div>
    </div>
  );
}
