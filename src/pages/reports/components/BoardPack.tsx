import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Printer, Loader2 } from 'lucide-react';
import { reportStatusCounts } from '@/lib/reportStatusCounts';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRegulators } from '@/hooks/useOperatingStructure';
import { useSectors } from '@/hooks/useMasterConfig';
import { filterReportRows, type ReportScope, type ScopedReportRow } from '@/lib/reportScope';

type Section = { title: string; table: string; columns: string };

const SECTIONS: Section[] = [
  { title: 'Licensing — licences', table: 'licenses', columns: 'id,status,created_at,regulator_id,sector_id,holder_id' },
  { title: 'Licensing — applications', table: 'applications', columns: 'id,status,created_at,regulator_id,entity_id' },
  { title: 'Regulatory returns', table: 'return_filings', columns: 'id,status,created_at,regulator_id,entity_id' },
  { title: 'Consumer complaints', table: 'complaints', columns: 'id,status,created_at,regulator_id,licensee_id' },
  { title: 'Conduct findings', table: 'conduct_findings', columns: 'id,status,created_at,entity_id' },
];

async function readRows(table: string, columns: string) {
  const records: any[] = [];
  // Page the RLS-scoped rows so the API's row limit cannot truncate the pack.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await (supabase as any).from(table)
      .select(columns).order('id').range(offset, offset + 999);
    if (error) throw error;
    const page = data ?? [];
    records.push(...page);
    if (page.length < 1000) break;
  }
  return records;
}

export function BoardPack() {
  const [scope, setScope] = useState<ReportScope>({ regulatorId: 'all', sectorId: 'all', from: '', to: '' });
  const { data: regulators } = useRegulators();
  const { data: sectors } = useSectors();
  const invalidDates = !!scope.from && !!scope.to && scope.from > scope.to;
  const { data, isLoading, error } = useQuery({
    queryKey: ['board-pack', scope],
    enabled: !invalidDates,
    queryFn: async () => {
      const [entities, sectorRows, sections] = await Promise.all([
        readRows('licensees', 'id,sector_id,lead_regulator_id'),
        readRows('sectors', 'id,regulator_id'),
        Promise.all(SECTIONS.map(async s => ({ ...s, records: await readRows(s.table, s.columns) }))),
      ]);
      return sections.map(s => {
        const records = filterReportRows(s.records as ScopedReportRow[], scope, entities, sectorRows);
        return { ...s, ...reportStatusCounts(records) };
      });
    },
  });
  const regulatorLabel = regulators?.find(r => r.id === scope.regulatorId)?.name || 'All accessible regulators';
  const sectorLabel = sectors?.find(s => s.id === scope.sectorId)?.name || 'All sectors';
  const populationLabel = `${regulatorLabel} · ${sectorLabel} · Created ${scope.from || 'any date'} to ${scope.to || 'any date'}`;

  const downloadCsv = () => {
    if (!data) return;
    const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [`Scope,${cell(populationLabel)}`, `As of,${cell(new Date().toISOString())}`, 'Basis,Current status of records created within the selected dates', 'Section,Status,Count'];
    data.forEach((s) => {
      lines.push(`${cell(s.title)},Total,${s.total}`);
      s.rows.forEach((r) => lines.push(`${cell(s.title)},${cell(r.status)},${r.count}`));
    });
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `board-pack-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div className="space-y-1"><Label>Regulator</Label><Select value={scope.regulatorId} onValueChange={regulatorId => setScope(s => ({ ...s, regulatorId, sectorId: 'all' }))}><SelectTrigger aria-label="Board Pack regulator"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All accessible regulators</SelectItem>{regulators?.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Sector</Label><Select value={scope.sectorId} onValueChange={sectorId => setScope(s => ({ ...s, sectorId }))}><SelectTrigger aria-label="Board Pack sector"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sectors</SelectItem>{sectors?.filter(s => scope.regulatorId === 'all' || s.regulator_id === scope.regulatorId).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor="pack-from">Created from</Label><Input id="pack-from" type="date" value={scope.from} onChange={e => setScope(s => ({ ...s, from: e.target.value }))} /></div>
        <div className="space-y-1"><Label htmlFor="pack-to">Created through</Label><Input id="pack-to" type="date" value={scope.to} onChange={e => setScope(s => ({ ...s, to: e.target.value }))} /></div>
      </div>
      <p className="text-sm text-muted-foreground">{populationLabel}</p>
      <p className="text-xs text-muted-foreground">Current status, not historical as-of status. Unresolved entity/sector links are excluded from filtered populations.</p>
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          Executive supervisory summary across licensing, returns, complaints and conduct.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadCsv} disabled={!data || invalidDates || isLoading || !!error}>
            <Download className="h-4 w-4 mr-2" />CSV
          </Button>
          <Button onClick={() => window.print()} disabled={!data || invalidDates || isLoading || !!error}>
            <Printer className="h-4 w-4 mr-2" />Print / PDF
          </Button>
        </div>
      </div>
      <h2 className="hidden print:block text-xl font-semibold">
        Executive Supervisory Board Pack — {new Date().toLocaleDateString()}
      </h2>
      {invalidDates ? <p role="alert" className="text-destructive">The end date must not precede the start date.</p> : error ? <p role="alert" className="text-destructive">The Board Pack could not be loaded. No totals are available.</p> : isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data?.map((s) => (
            <Card key={s.table}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex justify-between">
                  <span>{s.title}</span>
                  <span className="font-mono">{s.total}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {s.rows.map((r) => (
                  <div key={r.status} className="flex justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{r.status.replace(/_/g, ' ').toLowerCase()}</span>
                    <span className="font-mono">{r.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
