import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SeverityBadge, StatusChip } from './severityBadge';
import { MOCK_TRIGGERS } from './mockData';

export function TriggeredRulesLog() {
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
              <TableHead>Institution</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_TRIGGERS.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs">{new Date(t.triggeredAt).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{t.ruleLabel}</TableCell>
                <TableCell className="font-mono text-xs">{t.complaintNumber}</TableCell>
                <TableCell className="text-sm">{t.institution}</TableCell>
                <TableCell><SeverityBadge severity={t.severity} /></TableCell>
                <TableCell><StatusChip status={t.outcome} /></TableCell>
                <TableCell className="text-xs text-slate-600">{t.note || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
