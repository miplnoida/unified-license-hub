import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { SeverityBadge, StatusChip } from './severityBadge';

export function TriggeredRulesLog() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['complaint_escalation_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_escalation_log' as any)
        .select('id, triggered_at, rule_label, severity, outcome, note, complaints(complaint_number)')
        .order('triggered_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Triggered Rules Log</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Complaint</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>}
            {!isLoading && rows.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs">{new Date(t.triggered_at).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{t.rule_label}</TableCell>
                <TableCell className="font-mono text-xs">{t.complaints?.complaint_number ?? '—'}</TableCell>
                <TableCell><SeverityBadge severity={t.severity} /></TableCell>
                <TableCell><StatusChip status={t.outcome} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.note || '—'}</TableCell>
              </TableRow>
            ))}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No triggers logged yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
