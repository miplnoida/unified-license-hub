/**
 * RDM-ENTITY-001 — generic editor for a Phase 1 metadata table.
 *
 * Rendered entirely from the declarative field schema so every configurable
 * regulatory concept gets the same governed UX: list, create, edit, retire.
 * Seeded system rows can be edited or deactivated but not deleted.
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Archive, Edit, Lock, Plus, Search, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { useToast } from '@/hooks/use-toast';
import { useRdmMutations, useRdmRows, type RdmRow } from '@/hooks/useRegulatoryDataModel';
import type { RdmTableSchema } from '@/lib/rdm/rdmSchema';

interface Props {
  schema: RdmTableSchema;
  /** Extra columns merged into every insert (e.g. scheme_id). */
  contextValues?: Record<string, unknown>;
  schemeId?: string | null;
  canWrite: boolean;
}

function emptyDraft(schema: RdmTableSchema): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const f of schema.fields) {
    if (f.type === 'boolean') draft[f.name] = f.name === 'is_active';
    else if (f.type === 'number') draft[f.name] = 0;
    else if (f.type === 'select') draft[f.name] = f.options?.[0] ?? '';
    else draft[f.name] = '';
  }
  return draft;
}

export function MetadataTablePanel({ schema, contextValues, schemeId, canWrite }: Props) {
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useRdmRows(schema.table, { schemeId });
  const { create, update, retire, remove } = useRdmMutations(schema.table);


  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RdmRow | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => emptyDraft(schema));

  const listFields = schema.fields.filter((f) => f.inList);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [rows, query]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft(schema));
    setOpen(true);
  };

  const openEdit = (row: RdmRow) => {
    const next = emptyDraft(schema);
    for (const f of schema.fields) {
      const value = row[f.name];
      next[f.name] = value === null || value === undefined ? next[f.name] : value;
    }
    setEditing(row);
    setDraft(next);
    setOpen(true);
  };

  const save = async () => {
    const missing = schema.fields.filter((f) => f.required && !String(draft[f.name] ?? '').trim());
    if (missing.length) {
      toast({ title: 'Missing values', description: `Required: ${missing.map((f) => f.label).join(', ')}`, variant: 'destructive' });
      return;
    }
    const payload: Record<string, unknown> = { ...contextValues };
    for (const f of schema.fields) {
      // Immutable fields (machine keys) are never resubmitted on edit.
      if (editing && f.immutable) continue;
      let value = draft[f.name];
      if ((f.type === 'text' || f.type === 'textarea' || f.type === 'date') && value === '') value = null;
      if (f.type === 'number') value = Number(value) || 0;
      payload[f.name] = value;
    }
    try {
      if (editing) await update.mutateAsync({ id: editing.id, values: payload });
      else await create.mutateAsync(payload);
      toast({ title: editing ? 'Updated' : 'Created', description: `${schema.singular} saved.` });
      setOpen(false);
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  };

  const confirmRetire = async (row: RdmRow) => {
    const res = await Swal.fire({
      title: `Retire ${schema.singular}?`,
      text: `"${row.label}" stays in the database for historical records but will no longer be offered for new use.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Retire',
    });
    if (!res.isConfirmed) return;
    try {
      await retire.mutateAsync(row.id);
      toast({ title: 'Retired', description: `${row.label} is no longer active.` });
    } catch (err) {
      toast({
        title: 'Could not retire',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  };

  const confirmDelete = async (row: RdmRow) => {
    const res = await Swal.fire({
      title: `Delete ${schema.singular}?`,
      text: `"${row.label}" will be removed permanently. Configuration that is referenced anywhere must be retired instead — the database will refuse the deletion.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'hsl(0 72% 45%)',
    });
    if (!res.isConfirmed) return;
    try {
      await remove.mutateAsync(row.id);
      toast({ title: 'Deleted', description: `${row.label} removed.` });
    } catch (err) {
      toast({
        title: 'Could not delete',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  };


  const renderCell = (row: RdmRow, name: string) => {
    const value = row[name];
    if (typeof value === 'boolean') {
      return <Badge variant={value ? 'default' : 'outline'}>{value ? 'Yes' : 'No'}</Badge>;
    }
    if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
    if (name === 'key') return <code className="font-mono text-xs">{String(value)}</code>;
    return <span className="text-sm">{String(value)}</span>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-base">{schema.title}</CardTitle>
          <CardDescription>{schema.description}</CardDescription>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="pl-8" />
          </div>
          {canWrite && (
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {listFields.map((f) => <TableHead key={f.name}>{f.label}</TableHead>)}
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={listFields.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                      No {schema.singular}s configured yet.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((row) => (
                  <TableRow key={row.id}>
                    {listFields.map((f) => <TableCell key={f.name}>{renderCell(row, f.name)}</TableCell>)}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canWrite ? (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => openEdit(row)} aria-label="Edit">
                              <Edit className="h-4 w-4" />
                            </Button>
                            {row.is_active !== false && (
                              <Button size="icon" variant="ghost" onClick={() => confirmRetire(row)} aria-label="Retire">
                                <Archive className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                            {row.is_system ? (
                              <span title="Seeded system record — retire it instead of deleting">
                                <Lock className="h-4 w-4 text-muted-foreground" />
                              </span>
                            ) : (
                              <Button size="icon" variant="ghost" onClick={() => confirmDelete(row)} aria-label="Delete">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Read only</span>
                        )}

                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${schema.singular}` : `Add ${schema.singular}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {schema.fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                {f.type === 'boolean' ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`rdm-${f.name}`}
                      checked={Boolean(draft[f.name])}
                      onCheckedChange={(v) => setDraft((d) => ({ ...d, [f.name]: Boolean(v) }))}
                    />
                    <Label htmlFor={`rdm-${f.name}`}>{f.label}</Label>
                  </div>
                ) : (
                  <>
                    <Label htmlFor={`rdm-${f.name}`}>
                      {f.label}{f.required && <span className="text-destructive"> *</span>}
                    </Label>
                    {f.type === 'textarea' ? (
                      <Textarea
                        id={`rdm-${f.name}`}
                        value={String(draft[f.name] ?? '')}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                        rows={3}
                      />
                    ) : f.type === 'select' ? (
                      <Select
                        value={String(draft[f.name] ?? f.options?.[0] ?? '')}
                        onValueChange={(v) => setDraft((d) => ({ ...d, [f.name]: v }))}
                      >
                        <SelectTrigger id={`rdm-${f.name}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`rdm-${f.name}`}
                        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                        value={String(draft[f.name] ?? '')}
                        readOnly={Boolean(editing && f.immutable)}
                        disabled={Boolean(editing && f.immutable)}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                      />

                    )}
                  </>
                )}
                {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
