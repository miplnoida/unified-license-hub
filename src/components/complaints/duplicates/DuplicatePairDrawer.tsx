import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { GitMerge, Link2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { SimilarityScoreBadge } from './SimilarityScoreBadge';
import { MatchedFieldsList } from './MatchedFieldsList';
import type { ComplaintRef, SuspectedDuplicatePair } from '@/pages/complaints/duplicates/types';

function Side({ c, label }: { c: ComplaintRef; label: string }) {
  return (
    <div className="rounded-md border p-4 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <Badge variant="outline">{label}</Badge>
        <span className="font-mono text-xs text-muted-foreground">{c.reference}</span>
      </div>
      <div><span className="text-muted-foreground">Complainant:</span> <span className="font-medium">{c.complainantName}</span></div>
      {c.complainantEmail && <div><span className="text-muted-foreground">Email:</span> {c.complainantEmail}</div>}
      {c.complainantPhone && <div><span className="text-muted-foreground">Phone:</span> {c.complainantPhone}</div>}
      <div><span className="text-muted-foreground">Institution:</span> {c.institution}</div>
      {c.product && <div><span className="text-muted-foreground">Product:</span> {c.product}</div>}
      {c.intermediary && <div><span className="text-muted-foreground">Intermediary:</span> {c.intermediary}</div>}
      <div><span className="text-muted-foreground">Issue:</span> {c.issue}</div>
      <div><span className="text-muted-foreground">Channel:</span> <span className="capitalize">{c.channel}</span></div>
      <div><span className="text-muted-foreground">Submitted:</span> {new Date(c.submittedAt).toLocaleString()}</div>
      <Separator />
      <p className="text-muted-foreground">{c.description}</p>
    </div>
  );
}

export function DuplicatePairDrawer({
  pair, open, onOpenChange,
}: { pair: SuspectedDuplicatePair | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!pair) return null;
  const mock = (label: string) => toast.success(`${label} (demo — no backend action performed)`);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            Compare Complaints <SimilarityScoreBadge score={pair.similarityScore} />
          </SheetTitle>
          <SheetDescription>
            Detected {new Date(pair.detectedAt).toLocaleString()} · Recommended action:{' '}
            <span className="font-medium capitalize">{pair.recommendation}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Matched signals</h4>
            <MatchedFieldsList matched={pair.matched} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Side c={pair.primary} label="Primary" />
            <Side c={pair.candidate} label="Candidate" />
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={() => mock('Marked as not a duplicate')}>
              <XCircle className="h-4 w-4 mr-2" />Dismiss
            </Button>
            <Button variant="outline" onClick={() => mock('Complaints linked for shared investigation')}>
              <Link2 className="h-4 w-4 mr-2" />Link
            </Button>
            <Button onClick={() => mock('Complaints merged into primary case')}>
              <GitMerge className="h-4 w-4 mr-2" />Merge into Primary
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
