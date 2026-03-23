import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, FileText } from 'lucide-react';

export default function ReturnsTab({ entityId, licenseId }: { entityId: string; licenseId: string | null }) {
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!licenseId) { setLoading(false); return; }
      const { data } = await supabase.from('compliance_returns').select('*').eq('license_id', licenseId).order('due_date', { ascending: false });
      setReturns(data || []);
      setLoading(false);
    })();
  }, [licenseId]);

  const statusColor = (s: string) => {
    if (s === 'submitted') return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
    if (s === 'overdue') return 'bg-destructive/10 text-destructive border-destructive/20';
    if (s === 'pending') return 'bg-warning/10 text-warning border-warning/20';
    return '';
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-primary" />Compliance Returns</CardTitle></CardHeader>
      <CardContent>
        {returns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><FileText className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>No returns filed for this entity.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Due Date</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {returns.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.period_start).toLocaleDateString()} – {new Date(r.period_end).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(r.due_date).toLocaleDateString()}</TableCell>
                  <TableCell>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell><Badge variant="outline" className={`capitalize ${statusColor(r.status)}`}>{r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
