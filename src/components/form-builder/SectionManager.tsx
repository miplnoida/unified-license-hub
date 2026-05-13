import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  GripVertical, Plus, Trash2, Copy, ChevronDown, ChevronRight,
  Repeat, Settings2, Rows3,
} from 'lucide-react';
import { fieldTypes } from './FieldPalette';
import type { FormSection, FormField, FormRow, FieldType } from '@/types/formBuilder';
import { syncSectionFields, resizeRow, emptyRow } from '@/lib/formRows';

interface Props {
  sections: FormSection[];
  selectedFieldId: string | null;
  onSelectField: (field: FormField, sectionId: string) => void;
  onSectionsChange: (sections: FormSection[]) => void;
  onAddField: (sectionId: string, type: FieldType) => void;
  onDeleteField: (sectionId: string, fieldId: string) => void;
  onDuplicateField: (sectionId: string, fieldId: string) => void;
}

const COLS_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

export function SectionManager({
  sections,
  selectedFieldId,
  onSelectField,
  onSectionsChange,
  onAddField,
  onDeleteField,
  onDuplicateField,
}: Props) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const sectionDragIdx = useRef<number | null>(null);
  const sectionOverIdx = useRef<number | null>(null);

  const toggleCollapse = (id: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateSection = (id: string, updater: (s: FormSection) => FormSection) => {
    onSectionsChange(sections.map(s => (s.id === id ? syncSectionFields(updater(s)) : s)));
  };

  const handleAddSection = () => {
    const newSection: FormSection = syncSectionFields({
      id: crypto.randomUUID(),
      title: `Section ${sections.length + 1}`,
      description: '',
      sortOrder: sections.length,
      isRepeatable: false,
      rows: [],
      fields: [],
    });
    onSectionsChange([...sections, newSection]);
  };

  const handleDeleteSection = (id: string) => {
    onSectionsChange(sections.filter(s => s.id !== id));
  };

  const handleUpdateSection = (id: string, updates: Partial<FormSection>) => {
    updateSection(id, s => ({ ...s, ...updates }));
  };

  const handleDuplicateSection = (id: string) => {
    const source = sections.find(s => s.id === id);
    if (!source) return;
    const clone: FormSection = syncSectionFields({
      ...source,
      id: crypto.randomUUID(),
      title: `${source.title} (Copy)`,
      sortOrder: sections.length,
      rows: (source.rows || []).map(r => ({
        id: crypto.randomUUID(),
        columns: r.columns,
        fields: r.fields.map(f => (f ? { ...f, id: crypto.randomUUID() } : null)),
      })),
      fields: [],
    });
    onSectionsChange([...sections, clone]);
  };

  // ─── Row operations ───
  const handleAddRow = (sectionId: string, columns: 1 | 2 | 3 | 4) => {
    updateSection(sectionId, s => ({ ...s, rows: [...(s.rows || []), emptyRow(columns)] }));
  };

  const handleDeleteRow = (sectionId: string, rowId: string) => {
    updateSection(sectionId, s => ({ ...s, rows: (s.rows || []).filter(r => r.id !== rowId) }));
  };

  const handleResizeRow = (sectionId: string, rowId: string, columns: 1 | 2 | 3 | 4) => {
    const section = sections.find(s => s.id === sectionId);
    const row = section?.rows?.find(r => r.id === rowId);
    if (!row) return;
    const filledOverflow = row.fields.slice(columns).filter(Boolean).length;
    if (filledOverflow > 0) {
      const ok = window.confirm(
        `Reducing to ${columns} column${columns === 1 ? '' : 's'} will remove ${filledOverflow} field${filledOverflow === 1 ? '' : 's'} from this row. Continue?`
      );
      if (!ok) return;
    }
    updateSection(sectionId, s => ({
      ...s,
      rows: (s.rows || []).map(r => (r.id === rowId ? resizeRow(r, columns) : r)),
    }));
  };

  const handleAddFieldToSlot = (sectionId: string, rowId: string, slotIdx: number, type: FieldType) => {
    const ft = fieldTypes.find(f => f.type === type);
    const label = ft?.label || 'New Field';
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label,
      fieldName: label.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
      required: false,
      placeholder: '',
      options: ['radio', 'select', 'checkbox', 'multi_select'].includes(type) ? ['Option 1', 'Option 2'] : undefined,
      content: type === 'paragraph' ? 'Enter text here...' : undefined,
      tableColumns: type === 'table' ? [{ id: crypto.randomUUID(), label: 'Column 1', type: 'text' }] : undefined,
    };
    updateSection(sectionId, s => ({
      ...s,
      rows: (s.rows || []).map(r => {
        if (r.id !== rowId) return r;
        const newFields = r.fields.slice();
        newFields[slotIdx] = newField;
        return { ...r, fields: newFields };
      }),
    }));
    onSelectField(newField, sectionId);
  };

  const handleSectionDragEnd = () => {
    if (sectionDragIdx.current !== null && sectionOverIdx.current !== null && sectionDragIdx.current !== sectionOverIdx.current) {
      const reordered = [...sections];
      const [moved] = reordered.splice(sectionDragIdx.current, 1);
      reordered.splice(sectionOverIdx.current, 0, moved);
      onSectionsChange(reordered.map((s, i) => ({ ...s, sortOrder: i })));
    }
    sectionDragIdx.current = null;
    sectionOverIdx.current = null;
  };

  const getFieldIcon = (type: string) => {
    const ft = fieldTypes.find(f => f.type === type);
    return ft?.icon || null;
  };

  const totalFields = sections.reduce((acc, s) => acc + s.fields.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Form Sections</h3>
          <Badge variant="secondary" className="text-xs">{sections.length} sections · {totalFields} fields</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={handleAddSection}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Section
        </Button>
      </div>

      {sections.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No sections yet. Add a section to start building your form.</p>
            <Button variant="outline" onClick={handleAddSection}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Section
            </Button>
          </CardContent>
        </Card>
      )}

      {sections.map((section, sIdx) => {
        const isCollapsed = collapsedSections.has(section.id);
        const isEditing = editingSectionId === section.id;
        const rows = section.rows || [];

        return (
          <Card
            key={section.id}
            draggable
            onDragStart={() => { sectionDragIdx.current = sIdx; }}
            onDragEnter={() => { sectionOverIdx.current = sIdx; }}
            onDragOver={e => e.preventDefault()}
            onDragEnd={handleSectionDragEnd}
            className="transition-all"
          >
            <CardHeader className="py-3 px-4">
              <div className="flex items-center gap-2">
                <div className="cursor-grab text-muted-foreground hover:text-foreground">
                  <GripVertical className="h-4 w-4" />
                </div>
                <button onClick={() => toggleCollapse(section.id)} className="text-muted-foreground hover:text-foreground">
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {isEditing ? (
                  <Input
                    value={section.title}
                    onChange={e => handleUpdateSection(section.id, { title: e.target.value })}
                    onBlur={() => setEditingSectionId(null)}
                    onKeyDown={e => e.key === 'Enter' && setEditingSectionId(null)}
                    className="h-7 text-sm font-semibold"
                    autoFocus
                  />
                ) : (
                  <CardTitle
                    className="text-sm cursor-pointer hover:text-primary"
                    onClick={() => setEditingSectionId(section.id)}
                  >
                    {section.title}
                  </CardTitle>
                )}

                {section.isRepeatable && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Repeat className="h-3 w-3" /> Repeatable
                  </Badge>
                )}

                <Badge variant="secondary" className="text-[10px] ml-auto">
                  {rows.length} rows · {section.fields.length} fields
                </Badge>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Settings2 className="h-3.5 w-3.5" /></Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 space-y-3" align="end">
                    <div className="space-y-2">
                      <Label className="text-xs">Section Title</Label>
                      <Input value={section.title} onChange={e => handleUpdateSection(section.id, { title: e.target.value })} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Description</Label>
                      <Textarea value={section.description || ''} onChange={e => handleUpdateSection(section.id, { description: e.target.value })} rows={2} className="text-sm" placeholder="Optional section description..." />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Repeatable</Label>
                      <Switch checked={section.isRepeatable} onCheckedChange={val => handleUpdateSection(section.id, { isRepeatable: val })} />
                    </div>
                  </PopoverContent>
                </Popover>

                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicateSection(section.id)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteSection(section.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>

            {!isCollapsed && (
              <CardContent className="pt-0 px-4 pb-4 space-y-2">
                {section.description && (
                  <p className="text-xs text-muted-foreground mb-2">{section.description}</p>
                )}

                {/* Rows */}
                {rows.map((row, rIdx) => (
                  <div key={row.id} className="rounded-lg border border-border bg-muted/30 p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      <Rows3 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[11px] font-medium text-muted-foreground">Row {rIdx + 1}</span>
                      <div className="ml-auto flex items-center gap-1">
                        <Label className="text-[10px] text-muted-foreground">Columns</Label>
                        <Select
                          value={String(row.columns)}
                          onValueChange={(v) => handleResizeRow(section.id, row.id, Number(v) as 1 | 2 | 3 | 4)}
                        >
                          <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="4">4</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteRow(section.id, row.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className={`grid gap-2 grid-cols-1 ${COLS_CLASS[row.columns]}`}>
                      {Array.from({ length: row.columns }).map((_, slotIdx) => {
                        const field = row.fields[slotIdx] || null;
                        if (!field) {
                          return (
                            <Popover key={`slot-${row.id}-${slotIdx}`}>
                              <PopoverTrigger asChild>
                                <button className="h-14 rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 flex items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors text-[11px]">
                                  <Plus className="h-3 w-3" /> Add Field
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-52 p-1 max-h-72 overflow-y-auto" align="start">
                                {fieldTypes.map(ft => (
                                  <button
                                    key={ft.type}
                                    className="flex items-center gap-2 w-full p-2 text-xs rounded hover:bg-accent transition-colors"
                                    onClick={() => handleAddFieldToSlot(section.id, row.id, slotIdx, ft.type)}
                                  >
                                    <span className="text-muted-foreground">{ft.icon}</span>
                                    {ft.label}
                                  </button>
                                ))}
                              </PopoverContent>
                            </Popover>
                          );
                        }
                        return (
                          <div
                            key={field.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border bg-background cursor-pointer transition-all min-w-0 ${
                              selectedFieldId === field.id
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => onSelectField(field, section.id)}
                          >
                            <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-muted-foreground shrink-0">
                              {getFieldIcon(field.type)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{field.label}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{field.fieldName}</p>
                            </div>
                            {field.required && <Badge variant="outline" className="text-[10px] px-1 shrink-0">Req</Badge>}
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={e => { e.stopPropagation(); onDuplicateField(section.id, field.id); }}>
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={e => { e.stopPropagation(); onDeleteField(section.id, field.id); }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Add row controls */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-muted-foreground">Add row:</span>
                  {([1, 2, 3, 4] as const).map(c => (
                    <Button key={c} variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => handleAddRow(section.id, c)}>
                      <Plus className="h-3 w-3 mr-1" /> {c} col
                    </Button>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
