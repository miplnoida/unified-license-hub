import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useReturnDueDates, useReturnConfigs, useCutoffConfigs, useReturnTypes } from '@/hooks/useReturnsManagement';
import { useSectors } from '@/hooks/useMasterConfig';
import { useRegulator } from '@/contexts/RegulatorContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, CalendarDays, Eye, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays, lastDayOfMonth, lastDayOfYear, lastDayOfQuarter } from 'date-fns';

export default function DueDatesPage() {
  const { activeRegulatorId } = useRegulator();
  const [tab, setTab] = useState('manage');
  const [genYear, setGenYear] = useState(String(new Date().getFullYear()));
  const [genSectorId, setGenSectorId] = useState('');
  const [genTypeId, setGenTypeId] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);

  const { data: dueDates = [], isLoading, refetch } = useReturnDueDates({ year: parseInt(genYear) || undefined });
  const { data: configs = [] } = useReturnConfigs();
  const { data: cutoffs = [] } = useCutoffConfigs();
  const { data: returnTypes = [] } = useReturnTypes();
  const { data: sectors = [] } = useSectors(activeRegulatorId);
  const { data: entities = [] } = useQuery({
    queryKey: ['licensees_list'],
    queryFn: async () => {
      const { data } = await supabase.from('licensees').select('id, name, sector_id').eq('status', 'active');
      return data || [];
    },
  });

  const getCutoffDays = (sectorId: string | null, typeId: string) => {
    const match = cutoffs.find(c => c.return_type_id === typeId && (c.sector_id === sectorId || !c.sector_id));
    return match?.cutoff_days || 30;
  };

  const generatePreview = () => {
    const year = parseInt(genYear);
    const results: any[] = [];
    const filteredConfigs = configs.filter(c => c.status === 'active' && (!genSectorId || c.sector_id === genSectorId) && (!genTypeId || c.return_type_id === genTypeId));
    const filteredEntities = entities.filter(e => !genSectorId || e.sector_id === genSectorId);

    for (const config of filteredConfigs) {
      const typeName = config.return_types?.name || '';
      const cutoff = getCutoffDays(config.sector_id, config.return_type_id);

      for (const entity of filteredEntities) {
        if (typeName === 'Annual') {
          const periodEnd = new Date(year, 11, 31);
          const dueDate = addDays(periodEnd, cutoff);
          results.push({ entity_id: entity.id, entity_name: entity.name, config_name: config.name, return_configuration_id: config.id, return_year: year, return_period: 'Annual', due_date: format(dueDate, 'yyyy-MM-dd'), notification_date: format(addDays(dueDate, -30), 'yyyy-MM-dd') });
        } else if (typeName === 'Quarterly') {
          ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q, i) => {
            const periodEnd = lastDayOfQuarter(new Date(year, i * 3, 1));
            const dueDate = addDays(periodEnd, cutoff);
            results.push({ entity_id: entity.id, entity_name: entity.name, config_name: config.name, return_configuration_id: config.id, return_year: year, return_period: q, due_date: format(dueDate, 'yyyy-MM-dd'), notification_date: format(addDays(dueDate, -30), 'yyyy-MM-dd') });
          });
        } else if (typeName === 'Monthly') {
          for (let m = 0; m < 12; m++) {
            const periodEnd = lastDayOfMonth(new Date(year, m, 1));
            const dueDate = addDays(periodEnd, cutoff);
            const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            results.push({ entity_id: entity.id, entity_name: entity.name, config_name: config.name, return_configuration_id: config.id, return_year: year, return_period: months[m], due_date: format(dueDate, 'yyyy-MM-dd'), notification_date: format(addDays(dueDate, -30), 'yyyy-MM-dd') });
          }
        }
      }
    }
    setPreview(results);
  };

  const generateDueDates = async () => {
    setGenerating(true);
    try {
      const inserts = preview.map(p => ({
        entity_id: p.entity_id, return_configuration_id: p.return_configuration_id, return_year: p.return_year,
        return_period: p.return_period, due_date: p.due_date, notification_date: p.notification_date,
      }));
      const { error } = await (supabase as any).from('return_due_dates').upsert(inserts, { onConflict: 'entity_id,return_configuration_id,return_year,return_period', ignoreDuplicates: true });
      if (error) throw error;
      toast.success(`Generated ${inserts.length} due dates`);
      setPreview([]);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
    setGenerating(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Due Date Management" description="Generate and manage return due dates for all entities" />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="manage">Manage Due Dates</TabsTrigger>
            <TabsTrigger value="generate">Generate Due Dates</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Generate Due Dates</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Year *</Label><Input type="number" value={genYear} onChange={e => setGenYear(e.target.value)} /></div>
                  <div className="space-y-2">
                    <Label>Sector (optional)</Label>
                    <Select value={genSectorId || 'all'} onValueChange={v => setGenSectorId(v === 'all' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="All sectors" /></SelectTrigger>
                      <SelectContent><SelectItem value="all">All</SelectItem>{sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Return Type (optional)</Label>
                    <Select value={genTypeId || 'all'} onValueChange={v => setGenTypeId(v === 'all' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                      <SelectContent><SelectItem value="all">All</SelectItem>{returnTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={generatePreview}><Eye className="h-4 w-4 mr-2" />Preview</Button>
                  {preview.length > 0 && <Button onClick={generateDueDates} disabled={generating}><Sparkles className="h-4 w-4 mr-2" />{generating ? 'Generating...' : `Generate ${preview.length} Due Dates`}</Button>}
                </div>
                {preview.length > 0 && (
                  <div className="max-h-[400px] overflow-auto border rounded-md">
                    <Table>
                      <TableHeader><TableRow><TableHead>Entity</TableHead><TableHead>Return Config</TableHead><TableHead>Period</TableHead><TableHead>Due Date</TableHead><TableHead>Notification Date</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {preview.slice(0, 100).map((p, i) => (
                          <TableRow key={i}>
                            <TableCell>{p.entity_name}</TableCell><TableCell>{p.config_name}</TableCell>
                            <TableCell>{p.return_period}</TableCell><TableCell>{p.due_date}</TableCell><TableCell>{p.notification_date}</TableCell>
                          </TableRow>
                        ))}
                        {preview.length > 100 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">...and {preview.length - 100} more</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Entity</TableHead><TableHead>Return Config</TableHead><TableHead>Period</TableHead><TableHead>Year</TableHead><TableHead>Due Date</TableHead><TableHead>Notified</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {dueDates.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No due dates generated</TableCell></TableRow>
                      ) : dueDates.map(d => (
                        <TableRow key={d.id}>
                          <TableCell>{d.licensees?.name || '—'}</TableCell>
                          <TableCell>{d.return_configs?.name || '—'}</TableCell>
                          <TableCell>{d.return_period}</TableCell>
                          <TableCell>{d.return_year}</TableCell>
                          <TableCell>{d.due_date}</TableCell>
                          <TableCell><Badge variant={d.notification_sent ? 'default' : 'secondary'}>{d.notification_sent ? 'Yes' : 'No'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
