import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Printer, Loader2 } from 'lucide-react';

type Section = { title: string; table: string; groups: string[] };

const SECTIONS: Section[] = [
  { title: 'Licensing — licences', table: 'licenses', groups: ['active', 'suspended', 'revoked', 'expired'] },
  { title: 'Licensing — applications', table: 'applications', groups: ['draft', 'submitted', 'in_progress', 'approved', 'rejected'] },
  { title: 'Regulatory returns', table: 'return_filings', groups: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'ACCEPTED'] },
  { title: 'Consumer complaints', table: 'complaints', groups: ['received', 'under_investigation', 'resolved', 'closed'] },
  { title: 'Conduct findings', table: 'conduct_findings', groups: ['OPEN', 'REMEDIATION_REQUIRED', 'CLOSED'] },
];

async function countRows(table: string, status?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any).from(table).select('id', { count: 'exact', head: true });
  if (status) q = q.ilike('status', status);
  const { count } = await q;
  return count ?? 0;
}

export function BoardPack() {
  const { data, isLoading } = useQuery({
    queryKey: ['board-pack'],
    queryFn: async () =>
      Promise.all(
        SECTIONS.map(async (s) => ({
          ...s,
          total: await countRows(s.table),
          rows: await Promise.all(s.groups.map(async (g) => ({ status: g, count: await countRows(s.table, g) }))),
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
      {isLoading ? (
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
