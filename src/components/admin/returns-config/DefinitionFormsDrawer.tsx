/**
 * RDM-ENTITY-001 Wave C — assigned forms for a return definition.
 * Writes go through `returns_save_definition_form` / `returns_delete_definition_form`.
 * The exact form VERSION is never chosen here — it is pinned when a filing
 * is opened against the then-published version of the template.
 */
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Info, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { ReturnDefinition } from '@/hooks/useWaveC';
import { useDefinitionFormRows, useFormTemplateOptions, useWaveCConfigMutations } from '@/hooks/useWaveCConfig';

export function DefinitionFormsDrawer({
  definition, canWrite, onClose,
}: {
  definition: ReturnDefinition; canWrite: boolean; onClose: () => void;
}) {
  const { data: rows = [], isLoading } = useDefinitionFormRows(definition.id);
  const { data: templates = [] } = useFormTemplateOptions();
  const { saveDefinitionForm, deleteDefinitionForm } = useWaveCConfigMutations();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [row, setRow] = useState({
    form_template_id: '', sequence: rows.length + 1, is_required: true,
    section_label: '', tab_name: '',
  });
  const [adding, setAdding] = useState(false);

  const templateById = new Map(templates.map((t) => [t.id, t]));

  const startAdd = () => {
    setEditingId(null);
    setRow({ form_template_id: '', sequence: rows.length + 1, is_required: true, section_label: '', tab_name: '' });
    setAdding(true);
  };

  const startEdit = (r: typeof rows[number]) => {
    setEditingId(r.id);
    setRow({
      form_template_id: r.form_template_id, sequence: r.sequence, is_required: r.is_required,
      section_label: r.section_label ?? '', tab_name: r.tab_name ?? '',
    });
    setAdding(true);
  };

  const submitRow = async () => {
    if (!row.form_template_id) {
      toast({ title: 'Select a form definition', variant: 'destructive' });
      return;
    }
    try {
      await saveDefinitionForm.mutateAsync({
        id: editingId || undefined,
        return_definition_id: definition.id,
        form_template_id: row.form_template_id,
        sequence: row.sequence,
        is_required: row.is_required,
        section_label: row.section_label.trim() || null,
        tab_name: row.tab_name.trim() || null,
      });
      toast({ title: 'Form assignment saved' });
      setAdding(false);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteDefinitionForm.mutateAsync(id);
      toast({ title: 'Form assignment removed' });
    } catch (e: any) {
      toast({ title: 'Remove failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Forms assigned to {definition.name}</DialogTitle>
          <DialogDescription>Forms attached to this return definition, in filing sequence.</DialogDescription>
        </DialogHeader>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            The exact form <strong>version</strong> is pinned automatically when a reporting period is opened for
            filing — not here. Configuration only records which form definition applies; the published version in
            force at filing time is what gets used.
          </AlertDescription>
        </Alert>

        {canWrite && !adding && (
          <div className="flex justify-end">
            <Button size="sm" onClick={startAdd}><Plus className="mr-2 h-4 w-4" />Assign form</Button>
          </div>
        )}

        {adding && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Form definition</Label>
                <Select value={row.form_template_id} onValueChange={(v) => setRow({ ...row, form_template_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a form" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}{t.latest_published_version ? ` — published v${t.latest_published_version}` : ' — no published version'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Sequence</Label>
                <Input type="number" min={1} value={row.sequence} onChange={(e) => setRow({ ...row, sequence: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Section label</Label>
                <Input value={row.section_label} onChange={(e) => setRow({ ...row, section_label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Tab name</Label>
                <Input value={row.tab_name} onChange={(e) => setRow({ ...row, tab_name: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Required</span>
              <Switch checked={row.is_required} onCheckedChange={(c) => setRow({ ...row, is_required: c })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
              <Button size="sm" onClick={submitRow} disabled={saveDefinitionForm.isPending}>
                {saveDefinitionForm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Form definition</TableHead><TableHead>Sequence</TableHead><TableHead>Required</TableHead>
              <TableHead>Section</TableHead><TableHead>Tab</TableHead><TableHead>Published version</TableHead>
              {canWrite && <TableHead className="w-20" />}
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => {
                const tpl = templateById.get(r.form_template_id);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      {canWrite ? (
                        <button type="button" className="hover:underline" onClick={() => startEdit(r)}>{tpl?.name ?? r.form_template_id}</button>
                      ) : (tpl?.name ?? r.form_template_id)}
                    </TableCell>
                    <TableCell>{r.sequence}</TableCell>
                    <TableCell><Badge variant={r.is_required ? 'default' : 'outline'}>{r.is_required ? 'Required' : 'Optional'}</Badge></TableCell>
                    <TableCell>{r.section_label ?? '—'}</TableCell>
                    <TableCell>{r.tab_name ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {tpl?.latest_published_version ? `Published v${tpl.latest_published_version} available` : 'No published version yet'}
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => remove(r.id)} disabled={deleteDefinitionForm.isPending}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No forms assigned yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
