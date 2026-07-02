import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type Rule = {
  id: string;
  name: string;
  description: string | null;
  workflow_type_key: string | null;
  sector_id: string | null;
  condition: {
    field_path?: string;
    operator?: string;
    value?: unknown;
  };
  prompt_template: string;
  question_type: 'text' | 'document' | 'text_and_document';
  required: boolean;
  default_due_days: number;
  active: boolean;
};

const OPERATORS = [
  { value: 'missing', label: 'is missing / empty' },
  { value: 'present', label: 'is present' },
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'does not equal' },
  { value: 'lt', label: 'less than (number)' },
  { value: 'gt', label: 'greater than (number)' },
  { value: 'regex', label: 'matches regex' },
];

function emptyRule(): Partial<Rule> {
  return {
    name: '',
    description: '',
    workflow_type_key: null,
    sector_id: null,
    condition: { operator: 'missing', field_path: '' },
    prompt_template: '',
    question_type: 'text',
    required: true,
    default_due_days: 7,
    active: true,
  };
}

export default function RfiAutoRules() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['rfi-auto-rules-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('application_rfi_auto_rules' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Rule[];
    },
  });

  const { data: workflowTypes = [] } = useQuery({
    queryKey: ['approval-workflow-types'],
    queryFn: async () => {
      const { data } = await supabase
        .from('approval_workflow_types' as any)
        .select('key, display_label')
        .eq('is_active', true)
        .order('sort_order');
      return (data ?? []) as unknown as { key: string; display_label: string }[];
    },
  });

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sectors' as any)
        .select('id, name')
        .order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const saveRule = async () => {
    if (!editing) return;
    if (!editing.name?.trim() || !editing.prompt_template?.trim()) {
      toast.error('Name and prompt template are required');
      return;
    }
    const payload = {
      name: editing.name.trim(),
      description: editing.description?.trim() || null,
      workflow_type_key: editing.workflow_type_key || null,
      sector_id: editing.sector_id || null,
      condition: editing.condition || {},
      prompt_template: editing.prompt_template.trim(),
      question_type: editing.question_type || 'text',
      required: editing.required ?? true,
      default_due_days: editing.default_due_days ?? 7,
      active: editing.active ?? true,
    };
    try {
      if (editing.id) {
        const { error } = await supabase
          .from('application_rfi_auto_rules' as any)
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast.success('Rule updated');
      } else {
        const { data: authData } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('application_rfi_auto_rules' as any)
          .insert({ ...payload, created_by: authData.user?.id });
        if (error) throw error;
        toast.success('Rule created');
      }
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['rfi-auto-rules-admin'] });
      qc.invalidateQueries({ queryKey: ['rfi-auto-suggestions'] });
    } catch (e: any) {
      toast.error(e.message || 'Failed to save rule');
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Delete this rule? Existing RFIs are not affected.')) return;
    const { error } = await supabase
      .from('application_rfi_auto_rules' as any)
      .delete()
      .eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Rule deleted');
    qc.invalidateQueries({ queryKey: ['rfi-auto-rules-admin'] });
  };

  const toggleActive = async (r: Rule) => {
    const { error } = await supabase
      .from('application_rfi_auto_rules' as any)
      .update({ active: !r.active })
      .eq('id', r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ['rfi-auto-rules-admin'] });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            RFI Auto-Rules
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pre-configured RFI item suggestions. When a reviewer opens the Raise-RFI dialog,
            active rules matching the application's workflow type and sector are evaluated
            against its form data — matches are offered one-click for inclusion.
          </p>
        </div>
        <Button onClick={() => setEditing(emptyRule())}>
          <Plus className="mr-2 h-4 w-4" /> New rule
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rules ({rules.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No auto-rules configured yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      {r.description && (
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {r.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.workflow_type_key ? (
                        <div>WF: {r.workflow_type_key}</div>
                      ) : (
                        <div className="text-muted-foreground">Any workflow</div>
                      )}
                      {r.sector_id ? (
                        <div>
                          Sector:{' '}
                          {sectors.find((s) => s.id === r.sector_id)?.name ?? '—'}
                        </div>
                      ) : (
                        <div className="text-muted-foreground">Any sector</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {r.condition?.field_path ?? '—'} {r.condition?.operator}{' '}
                      {r.condition?.value !== undefined
                        ? JSON.stringify(r.condition.value)
                        : ''}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{r.question_type}</div>
                      <div className="text-muted-foreground">
                        due +{r.default_due_days}d {r.required ? '(required)' : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={r.active ? 'default' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() => toggleActive(r)}
                      >
                        {r.active ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(r)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteRule(r.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? 'Edit auto-rule' : 'New auto-rule'}
            </DialogTitle>
            <DialogDescription>
              Rules match by workflow type + sector (leave blank for any) and evaluate the
              condition against application form data.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={editing.name || ''}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Default due (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={editing.default_due_days ?? 7}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        default_due_days: Number(e.target.value) || 7,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={editing.description || ''}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Workflow type</Label>
                  <Select
                    value={editing.workflow_type_key ?? 'any'}
                    onValueChange={(v) =>
                      setEditing({
                        ...editing,
                        workflow_type_key: v === 'any' ? null : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any workflow</SelectItem>
                      {workflowTypes.map((w) => (
                        <SelectItem key={w.key} value={w.key}>
                          {w.display_label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sector</Label>
                  <Select
                    value={editing.sector_id ?? 'any'}
                    onValueChange={(v) =>
                      setEditing({
                        ...editing,
                        sector_id: v === 'any' ? null : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any sector</SelectItem>
                      {sectors.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card className="p-3 space-y-3 bg-muted/40">
                <div className="text-sm font-medium">Condition</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Field path</Label>
                    <Input
                      placeholder="e.g. applicant.paid_up_capital"
                      value={editing.condition?.field_path ?? ''}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          condition: {
                            ...editing.condition,
                            field_path: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Operator</Label>
                    <Select
                      value={editing.condition?.operator ?? 'missing'}
                      onValueChange={(v) =>
                        setEditing({
                          ...editing,
                          condition: { ...editing.condition, operator: v },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Value</Label>
                    <Input
                      placeholder="literal or number"
                      value={
                        editing.condition?.value === undefined ||
                        editing.condition?.value === null
                          ? ''
                          : String(editing.condition.value)
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = Number(raw);
                        setEditing({
                          ...editing,
                          condition: {
                            ...editing.condition,
                            value:
                              raw !== '' && !Number.isNaN(num) && raw.trim() !== ''
                                ? num
                                : raw,
                          },
                        });
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Field path is dot-notation into <code>applications.data</code>. Use{' '}
                  <code>missing</code>/<code>present</code> with no value to check whether the
                  field is filled in.
                </p>
              </Card>

              <div>
                <Label>Prompt template *</Label>
                <Textarea
                  rows={3}
                  placeholder="e.g. Please upload proof of paid-up capital of at least ₦{{applicant.min_capital}}"
                  value={editing.prompt_template || ''}
                  onChange={(e) =>
                    setEditing({ ...editing, prompt_template: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use <code>{'{{field.path}}'}</code> to inject values from the application's
                  form data at suggestion time.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Response type</Label>
                  <Select
                    value={editing.question_type || 'text'}
                    onValueChange={(v: any) =>
                      setEditing({ ...editing, question_type: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="text_and_document">Text + Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editing.required ?? true}
                      onCheckedChange={(c) =>
                        setEditing({ ...editing, required: !!c })
                      }
                    />
                    Required
                  </label>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editing.active ?? true}
                      onCheckedChange={(c) => setEditing({ ...editing, active: !!c })}
                    />
                    Active
                  </label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveRule}>Save rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
