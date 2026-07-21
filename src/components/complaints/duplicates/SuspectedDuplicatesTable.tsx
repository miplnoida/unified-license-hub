import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Link2, GitMerge, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SimilarityScoreBadge } from './SimilarityScoreBadge';
import { MatchedFieldsList } from './MatchedFieldsList';

const statusTone: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  confirmed: 'bg-destructive/15 text-destructive border-destructive/30',
  dismissed: 'bg-muted text-muted-foreground',
  merged: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  linked: 'bg-primary/15 text-primary border-primary/30',
};

export function SuspectedDuplicatesTable() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: pairs = [], isLoading } = useQuery({
    queryKey: ['complaint_duplicate_pairs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_duplicate_pairs' as any)
        .select(`id, similarity_score, matched, recommendation, status, detected_at,
                 primary:primary_complaint_id(id, complaint_number, subject, email),
                 candidate:candidate_complaint_id(id, complaint_number, subject, email)`)
        .order('detected_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const { error } = await (supabase as any).rpc('decide_duplicate_pair', { _id: id, _action: action });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Pair updated');
      qc.invalidateQueries({ queryKey: ['complaint_duplicate_pairs'] });
      qc.invalidateQueries({ queryKey: ['complaint_duplicate_stats'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Suspected Duplicate Pairs</CardTitle></CardHeader>
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
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>}
            {!isLoading && pairs.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-mono text-xs">{p.primary?.complaint_number ?? '—'}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[220px]">{p.primary?.subject}</div>
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{p.candidate?.complaint_number ?? '—'}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[220px]">{p.candidate?.subject}</div>
                </TableCell>
                <TableCell><SimilarityScoreBadge score={p.similarity_score} /></TableCell>
                <TableCell className="max-w-md">
                  <MatchedFieldsList matched={((p.matched as any[]) || []).slice(0, 3)} />
                </TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{p.recommendation}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={`capitalize ${statusTone[p.status]}`}>{p.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button data-rbac="complaint_management.edit" size="sm" variant="outline" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      <Eye className="h-4 w-4 mr-1" />Compare
                    </Button>
                    {p.status === 'pending' && (
                      <>
                        <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, action: 'dismissed' })}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, action: 'linked' })}>
                          <Link2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, action: 'merged' })}>
                          <GitMerge className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && pairs.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No suspected duplicates. Run detection from the hub header.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
