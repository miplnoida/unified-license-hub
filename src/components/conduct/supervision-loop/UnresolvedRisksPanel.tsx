import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Loader2, ArrowRight } from 'lucide-react';
import { fmtDate, type UnresolvedRisk } from '@/lib/conduct/supervisionLoop';

const TONE: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  critical: 'destructive', high: 'destructive', medium: 'secondary', low: 'outline',
};

export function UnresolvedRisksPanel({ risks, isLoading }: { risks: UnresolvedRisk[]; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive" /> Unresolved Supervisory Risks
          <Badge variant="outline" className="ml-1">{risks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : risks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No unresolved supervisory risks for this scope — the loop is closed.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risks.map((r, i) => (
                  <TableRow key={`${r.reason_code}-${r.entity_id}-${i}`}>
                    <TableCell><Badge variant={TONE[r.severity] ?? 'outline'}>{r.severity}</Badge></TableCell>
                    <TableCell className="text-sm">{r.entity ?? '—'}</TableCell>
                    <TableCell className="text-sm">{r.reason}</TableCell>
                    <TableCell className="text-xs font-mono">{fmtDate(r.occurred_at)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={r.target_href}>Action Required <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
