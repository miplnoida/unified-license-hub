/**
 * RDM-ENTITY-001 Wave C — reporting calendar for a single entity.
 * Shows every open reporting period with its filing state and lets an
 * authorised user open the filing for a period that has none.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EntityPicker, SelectedEntity } from './EntityPicker';
import { useEntityReportingCalendar, useWaveCMutations, FILING_STATUS_LABELS, FREQUENCY_LABELS } from '@/hooks/useWaveC';
import { formatDateOnly } from '@/lib/datetime';
import { FilePlus2, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function EntityReportingCalendar() {
  const navigate = useNavigate();
  const [entity, setEntity] = useState<SelectedEntity | null>(null);
  const { data: rows = [], isLoading } = useEntityReportingCalendar(entity?.entity_id);
  const { openFiling } = useWaveCMutations();

  const start = async (periodId: string) => {
    try {
      const res = await openFiling.mutateAsync(periodId);
      toast({ title: 'Filing opened', description: res.filing_reference });
      navigate(`/returns/filings/${res.filing_id}`);
    } catch (e: any) {
      toast({ title: 'Could not open filing', description: e.message, variant: 'destructive' });
    }
  };

  const overdue = rows.filter((r) => r.is_overdue).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Reporting Calendar" description="Reporting periods, due dates and filing state for a supervised entity" />

        <Card>
          <CardHeader><CardTitle className="text-base">Entity</CardTitle></CardHeader>
          <CardContent><EntityPicker value={entity} onSelect={setEntity} /></CardContent>
        </Card>

        {entity && overdue > 0 && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive">
            {overdue} reporting period{overdue > 1 ? 's are' : ' is'} past its due date.
          </div>
        )}

        {entity && (
          <Card>
            <CardHeader><CardTitle className="text-base">Periods ({rows.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Return</TableHead><TableHead>Period</TableHead><TableHead>Window</TableHead>
                        <TableHead>Due</TableHead><TableHead>Filing</TableHead><TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No reporting periods for this entity</TableCell></TableRow>
                      ) : rows.map((r) => (
                        <TableRow key={r.period_id}>
                          <TableCell>
                            <span className="font-medium">{r.definition_code}</span>
                            <span className="block text-xs text-muted-foreground">{FREQUENCY_LABELS[r.frequency] ?? r.frequency}</span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-medium">{r.period_label}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateOnly(r.period_start)} – {formatDateOnly(r.period_end)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDateOnly(r.due_date)}
                            {r.is_overdue
                              ? <Badge variant="outline" className="ml-2 border-destructive/20 bg-destructive/10 text-destructive">Overdue</Badge>
                              : r.days_remaining <= 30 && <Badge variant="outline" className="ml-2 border-warning/20 bg-warning/10 text-warning">{r.days_remaining}d</Badge>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.filing_reference ?? '—'}</TableCell>
                          <TableCell>
                            {r.filing_status
                              ? <Badge variant="outline">{FILING_STATUS_LABELS[r.filing_status] ?? r.filing_status}</Badge>
                              : <Badge variant="outline">{r.period_status}</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.filing_id ? (
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/returns/filings/${r.filing_id}`)}>Open</Button>
                            ) : (
                              <Button data-rbac="returns_management.edit" variant="outline" size="sm" onClick={() => start(r.period_id)} disabled={openFiling.isPending}>
                                <FilePlus2 className="mr-1 h-3.5 w-3.5" />Start filing
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
