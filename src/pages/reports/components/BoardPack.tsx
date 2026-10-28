import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Printer, Loader2 } from 'lucide-react';
import { reportStatusCounts } from '@/lib/reportStatusCounts';

type Section = { title: string; table: string };

const SECTIONS: Section[] = [
  { title: 'Licensing — licences', table: 'licenses' },
  { title: 'Licensing — applications', table: 'applications' },
  { title: 'Regulatory returns', table: 'return_filings' },
  { title: 'Consumer complaints', table: 'complaints' },
  { title: 'Conduct findings', table: 'conduct_findings' },
];

async function countRows(table: string) {
  const records: Array<{ status: string | null }> = [];
  // Page the RLS-scoped rows so the API's row limit cannot truncate the pack.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await (supabase as any).from(table)
      .select('id,status').order('id').range(offset, offset + 999);
    if (error) throw error;
    const page = data ?? [];
    records.push(...page);
    if (page.length < 1000) break;
  }
  return reportStatusCounts(records);
}

export function BoardPack() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['board-pack'],
    queryFn: async () =>
      Promise.all(
        SECTIONS.map(async (s) => ({
          ...s,
          ...await countRows(s.table),
        })),
      ),
  });

  const downloadCsv = () => {
    if (!data) return;
    const lines = ['Section,Status,Count'];
    data.forEach((s) => {
      lines.push(`"${s.title}",Total,${s.total}`);
      s.rows.forEach((r) => lines.push(`"${s.title}",${r.status},${r.count}`));
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
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          Executive supervisory summary across licensing, returns, complaints and conduct.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadCsv} disabled={!data}>
            <Download className="h-4 w-4 mr-2" />CSV
          </Button>
          <Button onClick={() => window.print()} disabled={!data}>
            <Printer className="h-4 w-4 mr-2" />Print / PDF
          </Button>
        </div>
      </div>
      <h2 className="hidden print:block text-xl font-semibold">
        Executive Supervisory Board Pack — {new Date().toLocaleDateString()}
      </h2>
      {error ? <p role="alert" className="text-destructive">The Board Pack could not be loaded. No totals are available.</p> : isLoading ? (
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
