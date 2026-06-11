/**
 * Workflow Version Panel — surfaces the version lifecycle for a workflow.
 *
 * Shows the current published version number + last published date, and
 * lets admins publish a new version that snapshots the live workflow
 * configuration. Existing in-progress instances stay pinned to their
 * original version — only new submissions pick up the new one.
 */
import { useState } from 'react';
import { useCurrentPublishedVersion, usePublishWorkflowVersion, useWorkflowVersions } from '@/hooks/useWorkflowVersions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { History, UploadCloud, AlertTriangle } from 'lucide-react';

interface Props {
  workflowId: string;
  workflowName: string;
}

function fmt(iso: string | null | undefined) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export function WorkflowVersionPanel({ workflowId, workflowName }: Props) {
  const current = useCurrentPublishedVersion(workflowId);
  const versions = useWorkflowVersions(workflowId);
  const publish = usePublishWorkflowVersion();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');

  const cur = current.data;

  const handlePublish = async () => {
    try {
      const res = await publish.mutateAsync({ workflowId, notes: notes.trim() || undefined });
      toast({ title: `Published v${res.version_number}`, description: `${workflowName} is now at v${res.version_number}.` });
      setOpen(false);
      setNotes('');
    } catch (e: any) {
      toast({ title: 'Publish failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" /> Workflow Version
            </CardTitle>
            <CardDescription>
              In-progress submissions stay pinned to the version they started on.
              Only new submissions use the latest published version.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)} disabled={publish.isPending}>
            <UploadCloud className="h-4 w-4 mr-2" /> Publish New Version
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="default">
            Current: v{cur?.version_number ?? '—'}
          </Badge>
          <Badge variant="outline">Status: {cur?.status ?? 'none'}</Badge>
          <span className="text-muted-foreground">Last published: {fmt(cur?.published_at)}</span>
          <span className="text-muted-foreground">Total versions: {versions.data?.length ?? 0}</span>
        </div>
        {cur?.notes && (
          <div className="text-xs text-muted-foreground">Notes: {cur.notes}</div>
        )}
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Saving step / action / notification changes mutates the live workflow definition.
            Click <strong>Publish New Version</strong> when ready — that snapshot becomes the
            version pinned to all future submissions.
          </span>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish new version of {workflowName}</DialogTitle>
            <DialogDescription>
              This snapshots the current configuration as v{(cur?.version_number ?? 0) + 1}.
              Existing in-progress submissions are not affected.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Optional release notes (what changed in this version)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handlePublish} disabled={publish.isPending}>
              {publish.isPending ? 'Publishing…' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
