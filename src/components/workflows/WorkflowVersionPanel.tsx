/**
 * Workflow Version Panel — surfaces the version lifecycle for a workflow.
 *
 * - Shows the current published version + last published date
 * - Lists every version (draft / published / archived) with notes & timestamps
 * - Lets admins publish a new version that snapshots the live workflow
 *
 * In-progress instances stay pinned to the version they started on, so
 * publishing never breaks active submissions.
 */
import { useState } from 'react';
import {
  useCurrentPublishedVersion,
  usePublishWorkflowVersion,
  useWorkflowVersions,
  type WorkflowVersionRow,
} from '@/hooks/useWorkflowVersions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { History, UploadCloud, AlertTriangle, CheckCircle2, FileText, Archive } from 'lucide-react';

interface Props {
  workflowId: string;
  workflowName: string;
}

function fmt(iso: string | null | undefined) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function statusBadge(status: WorkflowVersionRow['status']) {
  if (status === 'published') {
    return <Badge variant="approved" className="gap-1"><CheckCircle2 className="h-3 w-3" />Published</Badge>;
  }
  if (status === 'archived') {
    return <Badge variant="secondary" className="gap-1"><Archive className="h-3 w-3" />Archived</Badge>;
  }
  return <Badge variant="draft" className="gap-1"><FileText className="h-3 w-3" />Draft</Badge>;
}

export function WorkflowVersionPanel({ workflowId, workflowName }: Props) {
  const current = useCurrentPublishedVersion(workflowId);
  const versions = useWorkflowVersions(workflowId);
  const publish = usePublishWorkflowVersion();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notes, setNotes] = useState('');

  const cur = current.data;
  const allVersions = versions.data ?? [];
  const currentId = cur?.id;

  const handlePublish = async () => {
    try {
      const res = await publish.mutateAsync({ workflowId, notes: notes.trim() || undefined });
      toast({
        title: `Published v${res.version_number}`,
        description: `${workflowName} is now at v${res.version_number}.`,
      });
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
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHistoryOpen(true)}
              disabled={versions.isLoading}
            >
              <History className="h-4 w-4 mr-2" />
              History ({allVersions.length})
            </Button>
            <Button size="sm" onClick={() => setOpen(true)} disabled={publish.isPending}>
              <UploadCloud className="h-4 w-4 mr-2" /> Publish New Version
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="default">Current: v{cur?.version_number ?? '—'}</Badge>
          {cur ? statusBadge(cur.status) : <Badge variant="outline">No published version</Badge>}
          <span className="text-muted-foreground">Last published: {fmt(cur?.published_at)}</span>
          <span className="text-muted-foreground">Total versions: {allVersions.length}</span>
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

      {/* Publish dialog */}
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

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Version history — {workflowName}
            </DialogTitle>
            <DialogDescription>
              All saved versions of this workflow. The current published version is highlighted.
              Publishing a new version does not affect submissions already in progress.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-2">
            {versions.isLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading versions…</p>
            ) : allVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No versions yet. Publish to create v1.
              </p>
            ) : (
              <ol className="space-y-2">
                {allVersions.map((v) => {
                  const isCurrent = v.id === currentId;
                  return (
                    <li
                      key={v.id}
                      className={`rounded-md border p-3 ${
                        isCurrent ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">v{v.version_number}</span>
                          {statusBadge(v.status)}
                          {isCurrent && (
                            <Badge variant="outline" className="text-[10px]">
                              Current published
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {v.status === 'published'
                            ? `Published ${fmt(v.published_at)}`
                            : `Created ${fmt(v.created_at)}`}
                        </span>
                      </div>
                      {v.notes && (
                        <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                          {v.notes}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
