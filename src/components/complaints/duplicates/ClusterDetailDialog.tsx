import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface ClusterRow {
  id: string;
  dimension: string;
  key: string | null;
  member_ids: string[] | null;
  created_at: string;
  updated_at?: string;
}

const dimensionLabel: Record<string, string> = {
  institution: 'Institution',
  product: 'Product',
  intermediary: 'Intermediary',
  issue: 'Issue',
};

export function ClusterDetailDialog({
  cluster, open, onOpenChange,
}: { cluster: ClusterRow | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const memberIds = cluster?.member_ids ?? [];

  const { data: members = [], isLoading, isError } = useQuery({
    queryKey: ['cluster_members', cluster?.id],
    enabled: !!cluster && open && memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaints')
        .select('id, complaint_number, subject, severity, status, created_at')
        .in('id', memberIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (!cluster) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="outline">{dimensionLabel[cluster.dimension] ?? cluster.dimension}</Badge>
            {cluster.key ?? '—'}
          </DialogTitle>
          <DialogDescription>
            {memberIds.length} related complaints in this cluster.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : isError ? (
          <div className="p-4 text-sm text-destructive">Unable to load cluster members.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.complaint_number}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{c.subject}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{c.severity ?? '—'}</Badge></TableCell>
                  <TableCell className="capitalize">{c.status?.replace(/_/g, ' ')}</TableCell>
                  <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
