import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Settings, Plus, X, Zap, Trash2 } from 'lucide-react';
import { fieldTypes } from './FieldPalette';
import type { FormField, FieldType, ValidationRules, ConditionalRule, TableColumn } from '@/types/formBuilder';

const COMMON_FILE_TYPES = [
  { value: '.pdf', label: 'PDF' },
  { value: '.doc,.docx', label: 'Word' },
  { value: '.xls,.xlsx', label: 'Excel' },
  { value: '.jpg,.jpeg', label: 'JPEG' },
  { value: '.png', label: 'PNG' },
  { value: '.csv', label: 'CSV' },
  { value: '.zip,.rar', label: 'Archive' },
];

interface Props {
  selectedField: FormField | null;
  allFields: FormField[];
  onUpdateField: (id: string, updates: Partial<FormField>) => void;
  onDeleteField?: () => void;
}

export function FormBuilderFieldProperties({ selectedField, allFields, onUpdateField, onDeleteField }: Props) {
  if (!selectedField) {
    return (
      <Card className="sticky top-6">
        <CardHeader>
          <CardTitle className="text-sm">Field Properties</CardTitle>
          <CardDescription className="text-xs">Select a field to edit</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Settings className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground">Click on a field to configure it</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const f = selectedField;
  const isParagraph = f.type === 'paragraph';
  const hasOptions = ['radio', 'select', 'checkbox', 'multi_select'].includes(f.type);
  const isFile = f.type === 'file';
  const isTable = f.type === 'table';
  const isCalculated = f.type === 'calculated';

  const updateValidation = (updates: Partial<ValidationRules>) => {
    onUpdateField(f.id, { validation: { ...f.validation, ...updates } });
  };

  const handleAddOption = () => {
    const opts = f.options || [];
    onUpdateField(f.id, { options: [...opts, `Option ${opts.length + 1}`] });
  };

  const handleRemoveOption = (i: number) => {
    const opts = [...(f.options || [])];
    opts.splice(i, 1);
    onUpdateField(f.id, { options: opts });
  };

  const handleUpdateOption = (i: number, val: string) => {
    const opts = [...(f.options || [])];
    opts[i] = val;
    onUpdateField(f.id, { options: opts });
  };

  // Conditional logic
  const addCondition = () => {
    const rules = f.conditionalLogic || [];
    onUpdateField(f.id, {
      conditionalLogic: [...rules, { fieldId: '', operator: 'equals', value: '', action: 'show' }],
    });
  };

  const updateCondition = (idx: number, updates: Partial<ConditionalRule>) => {
    const rules = [...(f.conditionalLogic || [])];
    rules[idx] = { ...rules[idx], ...updates };
    onUpdateField(f.id, { conditionalLogic: rules });
  };

  const removeCondition = (idx: number) => {
    const rules = [...(f.conditionalLogic || [])];
    rules.splice(idx, 1);
    onUpdateField(f.id, { conditionalLogic: rules });
  };

  // Table columns
  const addTableColumn = () => {
    const cols = f.tableColumns || [];
    onUpdateField(f.id, {
      tableColumns: [...cols, { id: crypto.randomUUID(), label: `Column ${cols.length + 1}`, type: 'text' }],
    });
  };

  const updateTableColumn = (idx: number, updates: Partial<TableColumn>) => {
    const cols = [...(f.tableColumns || [])];
    cols[idx] = { ...cols[idx], ...updates };
    onUpdateField(f.id, { tableColumns: cols });
  };

  const removeTableColumn = (idx: number) => {
    const cols = [...(f.tableColumns || [])];
    cols.splice(idx, 1);
    onUpdateField(f.id, { tableColumns: cols });
  };

  const otherFields = allFields.filter(of => of.id !== f.id);

  return (
    <Card className="sticky top-6 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Field Properties</CardTitle>
        <CardDescription className="text-xs truncate">Editing: {f.label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Label */}
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input value={f.label} onChange={e => onUpdateField(f.id, { label: e.target.value })} className="h-8 text-sm" />
        </div>

        {/* Field Name */}
        <div className="space-y-1.5">
          <Label className="text-xs">Field Name (system key)</Label>
          <Input
            value={f.fieldName}
            onChange={e => onUpdateField(f.id, { fieldName: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })}
            className="h-8 text-sm font-mono"
            placeholder="e.g. business_name"
          />
        </div>

        {/* Field Type */}
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={f.type} onValueChange={(val: FieldType) => onUpdateField(f.id, { type: val })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fieldTypes.map(ft => (
                <SelectItem key={ft.type} value={ft.type}>
                  <div className="flex items-center gap-2">{ft.icon}<span>{ft.label}</span></div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Paragraph content */}
        {isParagraph && (
          <div className="space-y-1.5">
            <Label className="text-xs">Content</Label>
            <Textarea value={f.content || ''} onChange={e => onUpdateField(f.id, { content: e.target.value })} rows={3} className="text-sm" />
          </div>
        )}

        {/* Options */}
        {hasOptions && (
          <div className="space-y-2">
            <Label className="text-xs">Options</Label>
            {(f.options || []).map((opt, i) => (
              <div key={i} className="flex gap-1">
                <Input value={opt} onChange={e => handleUpdateOption(i, e.target.value)} className="h-7 text-xs" />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => handleRemoveOption(i)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleAddOption}>
              <Plus className="h-3 w-3 mr-1" /> Add Option
            </Button>
          </div>
        )}

        {/* Table columns */}
        {isTable && (
          <div className="space-y-2">
            <Label className="text-xs">Table Columns</Label>
            {(f.tableColumns || []).map((col, i) => (
              <div key={col.id} className="flex gap-1">
                <Input value={col.label} onChange={e => updateTableColumn(i, { label: e.target.value })} className="h-7 text-xs flex-1" />
                <Select value={col.type} onValueChange={(v: any) => updateTableColumn(i, { type: v })}>
                  <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="select">Select</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeTableColumn(i)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={addTableColumn}>
              <Plus className="h-3 w-3 mr-1" /> Add Column
            </Button>
          </div>
        )}

        {/* Calculated expression */}
        {isCalculated && (
          <div className="space-y-1.5">
            <Label className="text-xs">Expression</Label>
            <Input
              value={f.calculatedExpression || ''}
              onChange={e => onUpdateField(f.id, { calculatedExpression: e.target.value })}
              className="h-8 text-xs font-mono"
              placeholder="{field_a} + {field_b}"
            />
            <p className="text-[10px] text-muted-foreground">Use {'{field_name}'} to reference other fields</p>
          </div>
        )}

        {/* Placeholder, Default, Help */}
        {!isParagraph && !isTable && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Placeholder</Label>
              <Input value={f.placeholder || ''} onChange={e => onUpdateField(f.id, { placeholder: e.target.value })} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Value</Label>
              <Input value={f.defaultValue || ''} onChange={e => onUpdateField(f.id, { defaultValue: e.target.value })} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Help Text</Label>
              <Input value={f.helpText || ''} onChange={e => onUpdateField(f.id, { helpText: e.target.value })} className="h-8 text-sm" placeholder="Guidance for the user" />
            </div>
          </>
        )}

        {/* Required */}
        {!isParagraph && (
          <div className="flex items-center justify-between">
            <Label className="text-xs">Required</Label>
            <Switch checked={f.required} onCheckedChange={val => onUpdateField(f.id, { required: val })} />
          </div>
        )}

        <Separator />

        {/* Validation Rules */}
        {!isParagraph && !isTable && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Validation</Label>
            {['text', 'textarea', 'email', 'phone'].includes(f.type) && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Min Length</Label>
                  <Input type="number" className="h-7 text-xs" value={f.validation?.minLength ?? ''} onChange={e => updateValidation({ minLength: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Max Length</Label>
                  <Input type="number" className="h-7 text-xs" value={f.validation?.maxLength ?? ''} onChange={e => updateValidation({ maxLength: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
              </div>
            )}
            {['number', 'decimal'].includes(f.type) && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Min Value</Label>
                  <Input type="number" className="h-7 text-xs" value={f.validation?.min ?? ''} onChange={e => updateValidation({ min: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Max Value</Label>
                  <Input type="number" className="h-7 text-xs" value={f.validation?.max ?? ''} onChange={e => updateValidation({ max: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
              </div>
            )}
            {isFile && (
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground">Allowed File Types</Label>
                <div className="space-y-1">
                  {COMMON_FILE_TYPES.map(ft => {
                    const current = f.validation?.allowedTypes || [];
                    return (
                      <label key={ft.value} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={current.includes(ft.value)}
                          onCheckedChange={val => {
                            const updated = val ? [...current, ft.value] : current.filter(t => t !== ft.value);
                            updateValidation({ allowedTypes: updated });
                          }}
                        />
                        {ft.label}
                      </label>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Min Size (KB)</Label>
                    <Input type="number" className="h-7 text-xs" value={f.validation?.minSizeKB ?? ''} onChange={e => updateValidation({ minSizeKB: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Max Size (MB)</Label>
                    <Input type="number" className="h-7 text-xs" value={f.validation?.maxSizeMB ?? ''} onChange={e => updateValidation({ maxSizeMB: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <Separator />

        {/* Conditional Logic */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold flex items-center gap-1">
              <Zap className="h-3 w-3" /> Conditional Logic
            </Label>
            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addCondition}>
              <Plus className="h-3 w-3 mr-1" /> Add Rule
            </Button>
          </div>
          {(f.conditionalLogic || []).map((rule, idx) => (
            <div key={idx} className="space-y-1.5 p-2 rounded-lg border bg-muted/30">
              <div className="flex gap-1">
                <Select value={rule.fieldId} onValueChange={v => updateCondition(idx, { fieldId: v })}>
                  <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue placeholder="Watch field..." /></SelectTrigger>
                  <SelectContent>
                    {otherFields.map(of => (
                      <SelectItem key={of.id} value={of.id} className="text-xs">{of.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCondition(idx)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex gap-1">
                <Select value={rule.operator} onValueChange={(v: any) => updateCondition(idx, { operator: v })}>
                  <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="not_equals">Not Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="is_empty">Is Empty</SelectItem>
                    <SelectItem value="is_not_empty">Not Empty</SelectItem>
                  </SelectContent>
                </Select>
                {!['is_empty', 'is_not_empty'].includes(rule.operator) && (
                  <Input value={rule.value || ''} onChange={e => updateCondition(idx, { value: e.target.value })} className="h-7 text-[10px] flex-1" placeholder="Value..." />
                )}
              </div>
              <Select value={rule.action} onValueChange={(v: any) => updateCondition(idx, { action: v })}>
                <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="show">Show this field</SelectItem>
                  <SelectItem value="hide">Hide this field</SelectItem>
                  <SelectItem value="require">Make required</SelectItem>
                  <SelectItem value="unrequire">Make optional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {onDeleteField && (
          <>
            <Separator className="my-4" />
            <Button variant="destructive" size="sm" className="w-full" onClick={onDeleteField}>
              <Trash2 className="h-4 w-4 mr-2" />
              Remove Field
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
