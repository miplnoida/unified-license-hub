/**
 * RDM-ENTITY-001 Wave C — entity reporting obligations workbench.
 * Derives obligations from the configured rules and generates the reporting
 * periods for a selected entity. All writes go through governed RPCs.
 */
import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EntityPicker, SelectedEntity } from './EntityPicker';
import {
  useEntityObligations,
  useReportingPeriods,
  useWaveCMutations,
  FREQUENCY_LABELS,
} from '@/hooks/useWaveC';
import { formatDateOnly } from '@/lib/datetime';
import { CalendarPlus, Loader2, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function EntityObligationsWorkbench() {
  const [entity, setEntity] = useState<SelectedEntity | null>(null);
  const [openObligation, setOpenObligation] = useState<string | null>(null);
  const { data: obligations = [], isLoading } = useEntityObligations(entity?.entity_id);
  const { data: periods = [] } = useReportingPeriods(openObligation);
  const { deriveObligations, generatePeriods } = useWaveCMutations();

  const derive = async () => {
    if (!entity) return;
    try {
      const res = await deriveObligations.mutateAsync(entity.entity_id);
      toast({ title: 'Obligations derived', description: `${res.created} created, ${res.closed} closed.` });
    } catch (e: any) {
      toast({ title: 'Derivation failed', description: e.message, variant: 'destructive' });
    }
  };

  const generate = async (obligationId: string) => {
    try {
      const res = await generatePeriods.mutateAsync({ obligationId });
      toast({
        title: res.created ? 'Periods generated' : 'Nothing to generate',
        description: res.created ? `${res.created} reporting periods created.` : res.reason ?? 'Schedule is already complete.',
      });
    } catch (e: any) {
      toast({ title: 'Period generation failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Reporting Obligations"
          description="Derive an entity's return obligations from the configured rules and manage its reporting periods"
          actions={entity ? (
            <Button data-rbac="returns_management.edit" onClick={derive} disabled={deriveObligations.isPending}>
              {deriveObligations.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Re-derive obligations
            </Button>
          ) : undefined}
        />

        <Card>
          <CardHeader><CardTitle className="text-base">Entity</CardTitle></CardHeader>
          <CardContent><EntityPicker value={entity} onSelect={(e) => { setEntity(e); setOpenObligation(null); }} /></CardContent>
        </Card>

        {entity && (
          <Card>
            <CardHeader><CardTitle className="text-base">Obligations ({obligations.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Return</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead>Origin</TableHead>
                        <TableHead>Due days</TableHead>
                        <TableHead>Effective from</TableHead>
                        <TableHead>Next due</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Periods</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {obligations.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No obligations — run “Re-derive obligations”.</TableCell></TableRow>
                      ) : obligations.map((o: any) => (
                        <TableRow key={o.id} className={openObligation === o.id ? 'bg-muted/50' : ''}>
                          <TableCell>
                            <span className="font-medium">{o.return_definitions?.code ?? '—'}</span>
                            <span className="block text-xs text-muted-foreground">{o.return_definitions?.name ?? ''}</span>
                          </TableCell>
                          <TableCell>{FREQUENCY_LABELS[o.frequency as keyof typeof FREQUENCY_LABELS] ?? o.frequency}</TableCell>
                          <TableCell><Badge variant="outline">{o.origin}</Badge></TableCell>
                          <TableCell>{o.due_days_after_period_end}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDateOnly(o.effective_from)}</TableCell>
                          <TableCell className="whitespace-nowrap">{o.next_due_date ? formatDateOnly(o.next_due_date) : '—'}</TableCell>
                          <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                          <TableCell className="space-x-1 text-right">
                            <Button variant="ghost" size="sm" onClick={() => setOpenObligation(openObligation === o.id ? null : o.id)}>
                              {openObligation === o.id ? 'Hide' : 'View'}
                            </Button>
                            <Button data-rbac="returns_management.edit" variant="outline" size="sm" onClick={() => generate(o.id)} disabled={generatePeriods.isPending}>
                              <CalendarPlus className="mr-1 h-3.5 w-3.5" />Generate
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
        )}

        {openObligation && (
          <Card>
            <CardHeader><CardTitle className="text-base">Reporting periods ({periods.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead>
                      <TableHead>Due</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periods.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No periods generated yet</TableCell></TableRow>
                    ) : periods.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.period_label}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateOnly(p.period_start)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateOnly(p.period_end)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateOnly(p.due_date)}</TableCell>
                        <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
