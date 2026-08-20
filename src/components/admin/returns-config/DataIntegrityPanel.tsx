/**
 * RDM-ENTITY-001 Wave C — Data Integrity tab. Renders the certification
 * dataset verification (`cert_verify_dataset_v1()`) as pass/fail rows.
 * Read-only diagnostic surface — no mutation surfaces here.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';

interface CertFailure {
  check: string;
  entity?: string;
  detail?: string;
}

interface CertReport {
  counts: Record<string, unknown>;
  failures: CertFailure[];
  failure_count: number;
}

export function DataIntegrityPanel() {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['wave-c-config', 'cert-verify-dataset'],
    queryFn: async (): Promise<CertReport> => {
      const { data, error } = await supabase.rpc('cert_verify_dataset_v1' as never);
      if (error) throw new Error(error.message);
      return data as unknown as CertReport;
    },
  });

  const failures = data?.failures ?? [];
  const failureCount = data?.failure_count ?? 0;
  const counts = data?.counts ?? {};

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Re-verify
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <Alert variant="destructive"><AlertDescription>{(error as Error).message}</AlertDescription></Alert>
      ) : (
        <>
          <Alert variant={failureCount === 0 ? 'default' : 'destructive'}>
            {failureCount === 0 ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <AlertDescription>
              {failureCount === 0
                ? 'Certification dataset reports zero integrity failures.'
                : `Certification dataset reports ${failureCount} integrity failure${failureCount === 1 ? '' : 's'}.`}
            </AlertDescription>
          </Alert>

          <Card><CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Check</TableHead><TableHead>Result</TableHead><TableHead>Entity</TableHead><TableHead>Detail</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {failures.map((f, i) => (
                  <TableRow key={`${f.check}-${i}`}>
                    <TableCell className="font-mono text-xs font-medium">{f.check}</TableCell>
                    <TableCell><Badge variant="destructive" className="gap-1"><XCircle className="h-3.5 w-3.5" />Fail</Badge></TableCell>
                    <TableCell>{f.entity ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.detail ?? '—'}</TableCell>
                  </TableRow>
                ))}
                {failures.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" />All integrity checks passed.</span>
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>

          <Card><CardContent className="p-4">
            <p className="mb-2 text-sm font-medium">Dataset counts</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
              {Object.entries(counts).map(([k, v]) => (
                typeof v === 'object' ? null : (
                  <div key={k} className="flex justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-mono font-medium">{String(v)}</span>
                  </div>
                )
              ))}
            </div>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
