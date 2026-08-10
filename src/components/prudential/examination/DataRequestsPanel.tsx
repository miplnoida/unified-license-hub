import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Send, CheckCircle2, Trash2 } from 'lucide-react';
import { useDataRequestMutations, useDataRequests } from '@/hooks/useExaminations';
import { StageActions } from './ExaminationStageActions';

const statusTone = (s: string, due?: string | null) => {
  if (s === 'received') return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
  if (s === 'issued' && due && new Date(due) < new Date()) return 'bg-destructive/10 text-destructive border-destructive/20';
  if (s === 'issued') return 'bg-primary/10 text-primary border-primary/20';
  return 'bg-muted text-muted-foreground';
};

export function DataRequestsPanel({ examinationId, readOnly }: { examinationId: string; readOnly?: boolean }) {
  const { data: rows = [], isLoading } = useDataRequests(examinationId);
  const { save, remove } = useDataRequestMutations(examinationId);
  const [form, setForm] = useState({ title: '', description: '', data_format: '', due_date: '' });
  const [response, setResponse] = useState<Record<string, string>>({});

  const add = async () => {
    await save.mutateAsync({
      item_no: rows.length + 1,
      title: form.title,
      description: form.description || null,
      data_format: form.data_format || null,
      due_date: form.due_date || null,
      status: 'draft',
    });
    setForm({ title: '', description: '', data_format: '', due_date: '' });
  };

  const issue = (r: any) => save.mutate({ id: r.id, status: 'issued', issued_at: new Date().toISOString() });
  const markReceived = (r: any) =>
    save.mutate({
      id: r.id,
      status: 'received',
      received_at: new Date().toISOString(),
      entity_response: response[r.id] ?? r.entity_response ?? null,
    });

  const outstanding = rows.filter((r: any) => r.status !== 'received').length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Pre-examination data request</CardTitle>
        <Badge variant="outline">{outstanding} outstanding of {rows.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No request items yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entity response</TableHead>
                  {!readOnly && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.item_no ?? '—'}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.title}</div>
                      {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                    </TableCell>
                    <TableCell className="text-xs">{r.data_format || '—'}</TableCell>
                    <TableCell className="text-xs">{r.due_date ? new Date(r.due_date).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusTone(r.status, r.due_date)}>
                        {r.status === 'issued' && r.due_date && new Date(r.due_date) < new Date() ? 'overdue' : r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      {readOnly ? (
                        <span className="text-xs">{r.entity_response || '—'}</span>
                      ) : (
                        <Textarea rows={2} value={response[r.id] ?? r.entity_response ?? ''}
                          onChange={e => setResponse(s => ({ ...s, [r.id]: e.target.value }))} />
                      )}
                    </TableCell>
                    {!readOnly && (
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        {r.status === 'draft' && (
                          <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline" onClick={() => issue(r)}>
                            <Send className="h-3.5 w-3.5 mr-1" />Issue
                          </Button>
                        )}
                        {r.status !== 'received' && (
                          <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => markReceived(r)}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Received
                          </Button>
                        )}
                        <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!readOnly && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label>Item title</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <Label>Due date</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <Label>Format</Label>
                <Input placeholder="Excel, PDF, extract…" value={form.data_format}
                  onChange={e => setForm(f => ({ ...f, data_format: e.target.value }))} />
              </div>
            </div>
            <Button data-rbac="prudential_supervision.edit" size="sm" disabled={!form.title || save.isPending} onClick={add}>
              <Plus className="h-4 w-4 mr-1" />Add request item
            </Button>
          </div>
        )}
        {!readOnly && <StageActions />}
      </CardContent>
    </Card>
  );
}
