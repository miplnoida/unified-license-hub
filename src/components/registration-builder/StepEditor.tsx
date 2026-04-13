import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Columns,
} from 'lucide-react';
import type { RegStep, RegRow, RegColumn, RegField, RegFieldType } from '@/types/registrationForm';
import { COLUMN_PRESETS, REG_FIELD_TYPES } from '@/types/registrationForm';
import { FieldEditor } from './FieldEditor';

interface Props {
  step: RegStep;
  onChange: (step: RegStep) => void;
  allSteps: RegStep[];
}

export function StepEditor({ step, onChange, allSteps }: Props) {
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  const update = (partial: Partial<RegStep>) => {
    onChange({ ...step, ...partial });
  };

  const addRow = (spans: readonly number[]) => {
    const row: RegRow = {
      id: crypto.randomUUID(),
      columns: spans.map(span => ({ span, field: null })),
    };
    update({ rows: [...step.rows, row] });
  };

  const deleteRow = (rowId: string) => {
    update({ rows: step.rows.filter(r => r.id !== rowId) });
  };

  const moveRow = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= step.rows.length) return;
    const rows = [...step.rows];
    [rows[idx], rows[newIdx]] = [rows[newIdx], rows[idx]];
    update({ rows });
  };

  const updateColumn = (rowId: string, colIdx: number, field: RegField | null) => {
    update({
      rows: step.rows.map(r =>
        r.id === rowId
          ? { ...r, columns: r.columns.map((c, i) => i === colIdx ? { ...c, field } : c) }
          : r
      ),
    });
  };

  const addFieldToColumn = (rowId: string, colIdx: number, type: RegFieldType) => {
    const field: RegField = {
      id: crypto.randomUUID(),
      type,
      label: REG_FIELD_TYPES.find(f => f.type === type)?.label || 'Field',
      fieldName: `field_${Date.now()}`,
      required: false,
    };
    updateColumn(rowId, colIdx, field);
    setEditingFieldId(field.id);
  };

  const removeFieldFromColumn = (rowId: string, colIdx: number) => {
    updateColumn(rowId, colIdx, null);
    setEditingFieldId(null);
  };

  // Gather all fields for conditional logic references
  const allFields: RegField[] = allSteps.flatMap(s =>
    s.rows.flatMap(r => r.columns.map(c => c.field).filter(Boolean) as RegField[])
  );

  const editingField = editingFieldId
    ? step.rows.flatMap(r => r.columns).find(c => c.field?.id === editingFieldId)?.field || null
    : null;

  const editingLocation = editingFieldId
    ? (() => {
        for (const r of step.rows) {
          for (let i = 0; i < r.columns.length; i++) {
            if (r.columns[i].field?.id === editingFieldId) return { rowId: r.id, colIdx: i };
          }
        }
        return null;
      })()
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Step Title</Label>
            <Input
              value={step.title}
              onChange={e => update({ title: e.target.value })}
              className="h-8 text-sm font-semibold"
            />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              value={step.description || ''}
              onChange={e => update({ description: e.target.value })}
              rows={1}
              className="text-xs"
              placeholder="Brief description for this step..."
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {step.rows.map((row, rowIdx) => (
          <div
            key={row.id}
            className="border rounded-lg p-3 bg-muted/20 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  value={row.label ?? `Row ${rowIdx + 1}`}
                  onChange={e => {
                    update({
                      rows: step.rows.map(r =>
                        r.id === row.id ? { ...r, label: e.target.value } : r
                      ),
                    });
                  }}
                  className="h-6 text-xs font-medium border-transparent bg-transparent hover:border-input focus:border-input px-1 max-w-[200px]"
                  placeholder={`Row ${rowIdx + 1}`}
                />
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {row.columns.length} col{row.columns.length > 1 ? 's' : ''} ({row.columns.map(c => c.span).join('-')})
                </span>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveRow(rowIdx, -1)} disabled={rowIdx === 0}>
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveRow(rowIdx, 1)} disabled={rowIdx === step.rows.length - 1}>
                  <ChevronDown className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteRow(row.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="grid gap-2" style={{ gridTemplateColumns: row.columns.map(c => `${c.span}fr`).join(' ') }}>
              {row.columns.map((col, colIdx) => (
                <div
                  key={colIdx}
                  className={`min-h-[60px] rounded-md border-2 border-dashed p-2 transition-all ${
                    col.field
                      ? editingFieldId === col.field.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background'
                      : 'border-muted-foreground/20 hover:border-primary/40'
                  }`}
                >
                  {col.field ? (
                    <div
                      className="cursor-pointer"
                      onClick={() => setEditingFieldId(col.field!.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">{col.field.label}</span>
                        <button
                          onClick={e => { e.stopPropagation(); removeFieldFromColumn(row.id, colIdx); }}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge variant="outline" className="text-[9px] px-1">{col.field.type}</Badge>
                        {col.field.required && <Badge variant="secondary" className="text-[9px] px-1">Required</Badge>}
                      </div>
                    </div>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="w-full h-full flex items-center justify-center text-muted-foreground hover:text-primary text-xs gap-1">
                          <Plus className="h-3 w-3" /> Add Field
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-44 p-1 max-h-60 overflow-y-auto" align="start">
                        {REG_FIELD_TYPES.map(ft => (
                          <button
                            key={ft.type}
                            className="flex items-center gap-2 w-full p-2 text-xs rounded hover:bg-accent transition-colors"
                            onClick={() => addFieldToColumn(row.id, colIdx, ft.type)}
                          >
                            {ft.label}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Add row */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="w-full h-10 rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 flex items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors text-xs">
              <Columns className="h-3.5 w-3.5" />
              Add Row
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            {COLUMN_PRESETS.map((preset, i) => (
              <button
                key={i}
                className="flex items-center justify-between w-full p-2 text-xs rounded hover:bg-accent transition-colors"
                onClick={() => addRow(preset.spans)}
              >
                <span>{preset.label}</span>
                <span className="text-muted-foreground">{preset.spans.join('-')}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Field properties panel */}
        {editingField && editingLocation && (
          <FieldEditor
            field={editingField}
            onChange={updated => updateColumn(editingLocation.rowId, editingLocation.colIdx, updated)}
            onClose={() => setEditingFieldId(null)}
            allFields={allFields}
          />
        )}
      </CardContent>
    </Card>
  );
}
