import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink } from 'lucide-react';
import { fmtDate, STAGES, type LoopCase, type LoopFunnel } from '@/lib/conduct/supervisionLoop';

interface Props {
  stage: keyof LoopFunnel | null;
  cases: LoopCase[];
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StageDrilldownDialog({ stage, cases, isLoading, onOpenChange }: Props) {
  const label = STAGES.find((s) => s.key === stage)?.label ?? 'Cases';

  return (
    <Dialog open={!!stage} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label} — {cases.length} record{cases.length === 1 ? '' : 's'}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : cases.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No records at this stage.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={`${c.kind}-${c.id}`}>
                  <TableCell className="font-mono text-xs">{c.ref ?? '—'}</TableCell>
                  <TableCell className="text-sm">{c.entity ?? '—'}</TableCell>
                  <TableCell className="text-sm max-w-[280px] truncate">{c.title ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {c.status && <Badge variant="outline">{c.status}</Badge>}
                      {c.severity && <Badge variant="secondary">{c.severity}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{fmtDate(c.occurred_at)}</TableCell>
                  <TableCell>
                    {c.href && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={c.href}><ExternalLink className="h-3.5 w-3.5" /></Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
