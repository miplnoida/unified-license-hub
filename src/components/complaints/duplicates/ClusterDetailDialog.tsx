import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import type { DuplicateCluster } from '@/pages/complaints/duplicates/types';

const dimensionLabel: Record<string, string> = {
  institution: 'Institution',
  product: 'Product',
  intermediary: 'Intermediary',
  issue: 'Issue',
};

export function ClusterDetailDialog({
  cluster, open, onOpenChange,
}: { cluster: DuplicateCluster | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!cluster) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="outline">{dimensionLabel[cluster.dimension]}</Badge>
            {cluster.label}
          </DialogTitle>
          <DialogDescription>
            {cluster.count} related complaints between {new Date(cluster.dateRange.from).toLocaleDateString()} and{' '}
            {new Date(cluster.dateRange.to).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cluster.trend}>
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>High</span><span className="font-medium">{cluster.severityMix.high}</span></div>
            <div className="flex items-center justify-between"><span>Medium</span><span className="font-medium">{cluster.severityMix.medium}</span></div>
            <div className="flex items-center justify-between"><span>Low</span><span className="font-medium">{cluster.severityMix.low}</span></div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Complainant</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cluster.complaints.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.reference}</TableCell>
                <TableCell>{c.complainantName}</TableCell>
                <TableCell>{c.issue}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{c.severity}</Badge></TableCell>
                <TableCell>{new Date(c.submittedAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
