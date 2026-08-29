/**
 * F7-B — monetary display modes for a return filing.
 *
 * As-reported values are never altered. Regulator base and consolidated
 * reporting equivalents are computed server-side by the canonical F6-X
 * effective-dated FX engine, so the browser performs no conversion. Where no
 * approved rate exists the line is shown as "not convertible" and totals are
 * declared not summable — unlike currencies are never added together.
 */
import { useState } from 'react';
import { AlertTriangle, Coins } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { formatDateOnly } from '@/lib/datetime';
import {
  MONETARY_DISPLAY_MODE_LABELS, useFilingMetricsDisplay, type MonetaryDisplayMode,
} from '@/hooks/useEntityCurrency';

export function FilingMonetaryDisplay({ filingId }: { filingId: string }) {
  const [mode, setMode] = useState<MonetaryDisplayMode>('AS_REPORTED');
  const { data, isLoading, error } = useFilingMetricsDisplay(filingId, mode);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><Coins className="h-4 w-4" />Monetary values</CardTitle>
          <CardDescription>
            Reported figures stay exactly as filed. Equivalents are derived from the approved exchange rates
            applicable to this filing.
          </CardDescription>
        </div>
        <Select value={mode} onValueChange={(v) => setMode(v as MonetaryDisplayMode)}>
          <SelectTrigger className="w-[16rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(MONETARY_DISPLAY_MODE_LABELS) as MonetaryDisplayMode[]).map((m) => (
              <SelectItem key={m} value={m}>{MONETARY_DISPLAY_MODE_LABELS[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error || !data ? (
          <p className="py-6 text-center text-sm text-destructive">{(error as Error)?.message ?? 'Monetary values could not be resolved.'}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">Filed in {data.filing_currency ?? '—'}</Badge>
              <Badge variant="outline">Shown in {data.display_currency ?? '—'}</Badge>
              {data.fx_as_of && <Badge variant="outline">Rates as at {formatDateOnly(data.fx_as_of)}</Badge>}
              {!data.summable && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {data.incomplete_count} value(s) have no approved rate — these figures must not be totalled.
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Code</TableHead><TableHead>Metric</TableHead>
                  <TableHead className="text-right">As reported</TableHead>
                  <TableHead className="text-right">{MONETARY_DISPLAY_MODE_LABELS[data.mode]}</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.metrics.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No reported values</TableCell></TableRow>
                  ) : data.metrics.map((m) => (
                    <TableRow key={m.code}>
                      <TableCell className="font-mono text-xs">{m.code}</TableCell>
                      <TableCell>{m.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {m.as_reported !== null ? `${m.as_reported_currency ?? ''} ${Number(m.as_reported).toLocaleString()}`.trim() : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {m.display_value !== null ? `${m.display_currency ?? ''} ${Number(m.display_value).toLocaleString()}`.trim() : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.status === 'OK' ? 'outline' : 'secondary'}>
                          {m.status === 'OK' ? 'Converted' : m.status === 'UNCONVERTED' ? 'No approved rate' : 'Not reported'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
