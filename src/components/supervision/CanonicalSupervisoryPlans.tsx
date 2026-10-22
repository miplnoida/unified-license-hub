/**
 * Supervisory plans held in the canonical supervisory plan register
 * (`supervisory_plan`). The execution dashboard below lists plan *actions*
 * from the older plan store, so a canonical plan with no actions — e.g. a new
 * DRAFT plan — never appeared on /supervision/plans. This list reads the
 * register directly; RLS decides which plans the caller may see.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/datetime';

const sb = supabase as any;

export function useCanonicalSupervisoryPlans() {
  return useQuery({
    queryKey: ['canonical-supervisory-plans'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('supervisory_plan')
        .select('id, reference, title, status, priority, domain_code, period_label, start_date, target_completion, entity_ids')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.flatMap(r => r.entity_ids ?? [])));
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: ls } = await sb.from('licensees').select('id, name').in('id', ids);
        (ls ?? []).forEach((l: any) => names.set(l.id, l.name));
      }
      return rows.map(r => ({ ...r, entity_names: (r.entity_ids ?? []).map((i: string) => names.get(i) ?? '—') }));
    },
  });
}

const humanise = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : '—');

export function CanonicalSupervisoryPlans() {
  const { data, isLoading } = useCanonicalSupervisoryPlans();
  return (
    <Card className="mb-6">
      <CardHeader><CardTitle className="text-base">Supervisory plans</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">No supervisory plans visible to you.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead><TableHead>Title</TableHead><TableHead>Entity</TableHead>
                <TableHead>Domain</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Period</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    <Link className="text-primary hover:underline" to={`/supervision/plans/${p.id}`}>{p.reference}</Link>
                  </TableCell>
                  <TableCell>{p.title}</TableCell>
                  <TableCell>{p.entity_names.join(', ') || '—'}</TableCell>
                  <TableCell>{humanise(p.domain_code)}</TableCell>
                  <TableCell>{humanise(p.priority)}</TableCell>
                  <TableCell><Badge variant="outline">{humanise(p.status)}</Badge></TableCell>
                  <TableCell className="text-xs">{p.period_label ?? '—'}{p.target_completion ? ` · by ${formatDate(p.target_completion)}` : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
