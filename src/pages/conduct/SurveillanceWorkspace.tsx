import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ConductSignal,
  DISPOSITION_LABELS,
  deriveDispositionCounts,
  useSurveillanceSignals,
} from '@/hooks/useConductSurveillance';
import { SignalDetailDrawer } from '@/components/conduct/surveillance/SignalDetailDrawer';
import { Loader2, Radar } from 'lucide-react';

const SEV_VARIANT: Record<string, any> = {
  low: 'outline',
  medium: 'secondary',
  high: 'default',
  critical: 'destructive',
};

const BUCKETS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'NEW', label: 'New' },
  { key: 'UNDER_REVIEW', label: 'Under review' },
  { key: 'MONITOR', label: 'Monitor' },
  { key: 'ESCALATED', label: 'Escalated' },
  { key: 'FALSE_POSITIVE', label: 'False positive' },
  { key: 'CLOSED', label: 'Closed' },
];

export default function SurveillanceWorkspace() {
  const [bucket, setBucket] = useState('NEW');
  const [severity, setSeverity] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ConductSignal | null>(null);

  const { data, isLoading } = useSurveillanceSignals({ severity });
  const signals = data ?? [];
  const counts = useMemo(() => deriveDispositionCounts(signals), [signals]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return signals.filter((s) => {
      if (bucket !== 'all' && (s.disposition ?? 'NEW') !== bucket) return false;
      if (!term) return true;
      return (
        s.title?.toLowerCase().includes(term) ||
        s.licensees?.name?.toLowerCase().includes(term) ||
        s.instrument_ref?.toLowerCase().includes(term)
      );
    });
  }, [signals, bucket, search]);

  // Keep the drawer in sync with refreshed data after a disposition change.
  const activeSignal = selected ? signals.find((s) => s.id === selected.id) ?? selected : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Market Surveillance"
          description="Review conduct surveillance signals, record dispositions, and refer confirmed concerns to formal investigation."
          actions={
            <div className="flex gap-2">
              <Input
                className="w-56"
                placeholder="Search signal, entity, instrument"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />

        <Tabs value={bucket} onValueChange={setBucket}>
          <TabsList className="flex-wrap h-auto">
            {BUCKETS.map((b) => (
              <TabsTrigger key={b.key} value={b.key}>
                {b.label}
                <Badge variant="secondary" className="ml-2">{counts[b.key] ?? 0}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Radar className="h-8 w-8 mx-auto mb-2" />
                No signals in this bucket.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Raised</TableHead>
                    <TableHead>Signal</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Disposition</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => setSelected(s)}>
                      <TableCell className="text-xs">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="max-w-xs truncate font-medium">{s.title}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{s.kind.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell><Badge variant={SEV_VARIANT[s.severity] || 'outline'} className="capitalize">{s.severity}</Badge></TableCell>
                      <TableCell className="text-sm">{s.licensees?.name || '—'}</TableCell>
                      <TableCell className="text-sm">{s.instrument_ref || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{DISPOSITION_LABELS[s.disposition] ?? s.disposition ?? 'New'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(s); }}>
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <SignalDetailDrawer
        signal={activeSignal}
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      />
    </DashboardLayout>
  );
}
