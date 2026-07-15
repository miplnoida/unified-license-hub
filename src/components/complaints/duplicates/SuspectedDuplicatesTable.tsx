import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye } from 'lucide-react';
import { SimilarityScoreBadge } from './SimilarityScoreBadge';
import { MatchedFieldsList } from './MatchedFieldsList';
import { DuplicatePairDrawer } from './DuplicatePairDrawer';
import { seedPairs } from '@/pages/complaints/duplicates/seed';
import type { SuspectedDuplicatePair } from '@/pages/complaints/duplicates/types';

const statusTone: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  confirmed: 'bg-destructive/15 text-destructive border-destructive/30',
  dismissed: 'bg-muted text-muted-foreground',
  merged: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  linked: 'bg-primary/15 text-primary border-primary/30',
};

export function SuspectedDuplicatesTable() {
  const [selected, setSelected] = useState<SuspectedDuplicatePair | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Suspected Duplicate Pairs</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Primary</TableHead>
              <TableHead>Candidate</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Matched Signals</TableHead>
              <TableHead>Recommended</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {seedPairs.map(p => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-mono text-xs">{p.primary.reference}</div>
                  <div className="text-xs text-muted-foreground">{p.primary.complainantName} · {p.primary.institution}</div>
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{p.candidate.reference}</div>
                  <div className="text-xs text-muted-foreground">{p.candidate.complainantName} · {p.candidate.institution}</div>
                </TableCell>
                <TableCell><SimilarityScoreBadge score={p.similarityScore} /></TableCell>
                <TableCell className="max-w-md"><MatchedFieldsList matched={p.matched.slice(0, 3)} /></TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{p.recommendation}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={`capitalize ${statusTone[p.status]}`}>{p.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => { setSelected(p); setOpen(true); }}>
                    <Eye className="h-4 w-4 mr-1" />Compare
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <DuplicatePairDrawer pair={selected} open={open} onOpenChange={setOpen} />
      </CardContent>
    </Card>
  );
}
