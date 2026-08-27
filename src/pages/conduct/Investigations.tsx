import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useInvestigations, useCreateInvestigation } from '@/hooks/useMarketConduct';
import { Plus, Loader2 } from 'lucide-react';

const sb = supabase as any;
const STATUSES = ['opened','evidence_gathering','analysis','proposed_outcome','closed'];

export default function Investigations() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useInvestigations();
  const create = useCreateInvestigation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    source_type: 'manual', allegation: '', licensee_id: '', priority: 'medium', severity: 'medium', due_date: '',
  });

  const { data: licensees } = useQuery({
    queryKey: ['licensees-min'],
    queryFn: async () => {
      const { data } = await sb.from('licensees').select('id, name').order('name').limit(500);
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!form.allegation.trim()) return;
    await create.mutateAsync({
      source_type: form.source_type,
      allegation: form.allegation.trim(),
      licensee_id: form.licensee_id || null,
      priority: form.priority,
      severity: form.severity,
      due_date: form.due_date || null,
    } as any);
    setOpen(false);
    setForm({ source_type: 'manual', allegation: '', licensee_id: '', priority: 'medium', severity: 'medium', due_date: '' });
    refetch();
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Conduct Investigations"
          description="Formal investigations opened from complaints, alerts, thematic reviews or supervisory judgment."
          actions={
            <div className="flex gap-2">
              <Button data-rbac="market_conduct.manage_complaints" variant="outline" asChild><Link to="/conduct/work-queue">Conduct work queue</Link></Button>
              <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Open investigation</Button>
            </div>
          }

        />
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Allegation</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Opened</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No investigations opened.</TableCell></TableRow>
                  )}
                  {(data ?? []).map((r: any) => (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/conduct/investigations/${r.id}`)}>
                      <TableCell className="font-medium">{r.licensees?.name || '—'}</TableCell>
                      <TableCell className="max-w-md truncate">{r.allegation}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{r.priority}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{r.severity}</Badge></TableCell>
                      <TableCell><Badge className="capitalize">{r.status.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell>{r.due_date || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Open investigation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Source</Label>
              <Select value={form.source_type} onValueChange={v => setForm({ ...form, source_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['manual','complaint','alert','thematic_review','monitoring_rule'].map(s => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Entity</Label>
              <Select value={form.licensee_id} onValueChange={v => setForm({ ...form, licensee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
                <SelectContent>
                  {(licensees ?? []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Allegation / issue *</Label><Textarea rows={3} value={form.allegation} onChange={e => setForm({ ...form, allegation: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['low','medium','high','critical'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['low','medium','high','critical'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Due date</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
            <Button onClick={submit} disabled={create.isPending} className="w-full">{create.isPending ? 'Opening…' : 'Open investigation'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
