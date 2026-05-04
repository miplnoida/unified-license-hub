import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { X, Plus, Trash2 } from 'lucide-react';
import type { RegField, RegConditionalRule, RegDataSource } from '@/types/registrationForm';
import { REG_FIELD_TYPES } from '@/types/registrationForm';
import { useMasterDataTypes } from '@/hooks/useMasterData';
import { Database } from 'lucide-react';
import { buildTypeChangePatch, isDestructiveTypeChange } from '@/lib/fieldTypeChange';
import { toast } from '@/hooks/use-toast';

const LEGACY_DATA_SOURCES: { value: RegDataSource; label: string }[] = [
  { value: 'sector', label: 'Sector' },
  { value: 'sub_sector', label: 'Sub-Sector' },
  { value: 'category', label: 'Category' },
  { value: 'country', label: 'Country' },
  { value: 'state', label: 'State' },
];

interface Props {
  field: RegField;
  onChange: (field: RegField) => void;
  onClose: () => void;
  allFields: RegField[];
}

export function FieldEditor({ field, onChange, onClose, allFields }: Props) {
  const { data: masterDataTypes = [] } = useMasterDataTypes();

  const update = (partial: Partial<RegField>) => {
    onChange({ ...field, ...partial });
  };

  // Determine effective option source for backward compat
  const effectiveSource = field.optionSource || (field.dataSource ? 'legacy_data_source' : 'manual');

  const hasOptions = ['select', 'multi_select', 'radio', 'checkbox'].includes(field.type);

  const addCondition = () => {
    const rules = field.conditionalLogic || [];
    update({
      conditionalLogic: [...rules, {
        fieldId: '',
        operator: 'equals',
        value: '',
        action: 'show',
      }],
    });
  };

  const updateCondition = (idx: number, partial: Partial<RegConditionalRule>) => {
    const rules = [...(field.conditionalLogic || [])];
    rules[idx] = { ...rules[idx], ...partial };
    update({ conditionalLogic: rules });
  };

  const removeCondition = (idx: number) => {
    update({ conditionalLogic: (field.conditionalLogic || []).filter((_, i) => i !== idx) });
  };

  return (
    <Card className="border-primary/30 mt-3">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Field Properties</CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Label *</Label>
            <Input value={field.label} onChange={e => update({ label: e.target.value })} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Field Name *</Label>
            <Input value={field.fieldName} onChange={e => update({ fieldName: e.target.value })} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select
              value={field.type}
              onValueChange={v => {
                const newType = v as RegField['type'];
                if (newType === field.type) return;
                if (isDestructiveTypeChange(field.type, newType)) {
                  const ok = window.confirm(
                    'Changing the field type may affect how existing responses are displayed or validated, and incompatible settings (options, validation, defaults) will be reset. Continue?'
                  );
                  if (!ok) return;
                }
                const patch = buildTypeChangePatch(field as any, newType);
                update(patch as any);
                toast({ title: 'Field type updated', description: `Now: ${newType}` });
              }}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REG_FIELD_TYPES.map(ft => (
                  <SelectItem key={ft.type} value={ft.type}>{ft.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={field.required} onCheckedChange={v => update({ required: v })} />
              <Label className="text-xs">Required</Label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Placeholder</Label>
            <Input value={field.placeholder || ''} onChange={e => update({ placeholder: e.target.value })} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Default Value</Label>
            <Input value={field.defaultValue || ''} onChange={e => update({ defaultValue: e.target.value })} className="h-8 text-sm" />
          </div>
        </div>

        <div>
          <Label className="text-xs">Help Text</Label>
          <Textarea value={field.helpText || ''} onChange={e => update({ helpText: e.target.value })} rows={1} className="text-xs" />
        </div>

        {/* Data Source or Manual Options */}
        {hasOptions && (
          <div className="space-y-2">
            {['select', 'multi_select'].includes(field.type) && (
              <div>
                <Label className="text-xs flex items-center gap-1"><Database className="h-3 w-3" /> Data Source</Label>
                <Select
                  value={effectiveSource}
                  onValueChange={v => {
                    if (v === 'manual') {
                      update({ optionSource: 'manual', dataSource: undefined, dependsOn: undefined, masterDataTypeCode: undefined, masterDataParentField: undefined });
                    } else if (v === 'legacy_data_source') {
                      update({ optionSource: 'legacy_data_source', masterDataTypeCode: undefined, masterDataParentField: undefined, options: [] });
                    } else if (v === 'master_data') {
                      update({ optionSource: 'master_data', dataSource: undefined, dependsOn: undefined, options: [] });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Options</SelectItem>
                    <SelectItem value="legacy_data_source">Built-in (Sector/Country)</SelectItem>
                    <SelectItem value="master_data">Master Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Legacy data source: sector/sub_sector/category/country/state */}
            {effectiveSource === 'legacy_data_source' && (
              <>
                <div>
                  <Label className="text-xs">Built-in Source</Label>
                  <Select
                    value={field.dataSource || '_none'}
                    onValueChange={v => {
                      if (v === '_none') {
                        update({ dataSource: undefined, dependsOn: undefined });
                      } else {
                        const ds = v as RegDataSource;
                        const autoDepends = ds === 'sub_sector'
                          ? allFields.find(f => f.dataSource === 'sector')?.fieldName
                          : ds === 'category'
                            ? allFields.find(f => f.dataSource === 'sub_sector')?.fieldName
                            : ds === 'state'
                              ? allFields.find(f => f.dataSource === 'country')?.fieldName
                              : undefined;
                        update({ dataSource: ds, dependsOn: autoDepends, options: [] });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Select source...</SelectItem>
                      {LEGACY_DATA_SOURCES.map(ds => (
                        <SelectItem key={ds.value} value={ds.value}>{ds.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {field.dataSource && ['sub_sector', 'category', 'state'].includes(field.dataSource) && (
                  <div>
                    <Label className="text-xs">Depends On (field name)</Label>
                    <Select
                      value={field.dependsOn || '_none'}
                      onValueChange={v => update({ dependsOn: v === '_none' ? undefined : v })}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select parent field..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
                        {allFields.filter(f => f.id !== field.id && (f.dataSource || f.optionSource === 'master_data')).map(f => (
                          <SelectItem key={f.id} value={f.fieldName}>{f.label} ({f.fieldName})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {field.dataSource && (
                  <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    Options populated dynamically from built-in source ({field.dataSource.replace('_', '-')}).
                  </p>
                )}
              </>
            )}

            {/* Master Data source */}
            {effectiveSource === 'master_data' && (
              <div className="space-y-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Master Data Type</Label>
                  <Select
                    value={field.masterDataTypeCode || ''}
                    onValueChange={v => update({ masterDataTypeCode: v })}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select master data..." /></SelectTrigger>
                    <SelectContent>
                      {masterDataTypes.filter(t => t.status === 'active').map(t => (
                        <SelectItem key={t.id} value={t.code || t.name}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Parent Field (for cascading)</Label>
                  <Select
                    value={field.masterDataParentField || '__none__'}
                    onValueChange={v => update({ masterDataParentField: v === '__none__' ? undefined : v })}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {allFields.filter(f => f.id !== field.id && (f.optionSource === 'master_data' || f.dataSource)).map(f => (
                        <SelectItem key={f.id} value={f.fieldName}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Filter options based on parent field selection</p>
                </div>
              </div>
            )}

            {/* Manual options */}
            {effectiveSource === 'manual' && (
              <div>
                <Label className="text-xs">Options (one per line)</Label>
                <Textarea
                  value={(field.options || []).join('\n')}
                  onChange={e => update({ options: e.target.value.split('\n').filter(Boolean) })}
                  rows={3}
                  className="text-xs"
                  placeholder="Option 1&#10;Option 2&#10;Option 3"
                />
              </div>
            )}
          </div>
        )}

        {/* Validation */}
        <div className="grid grid-cols-2 gap-3">
          {['text', 'textarea', 'email', 'phone'].includes(field.type) && (
            <>
              <div>
                <Label className="text-xs">Min Length</Label>
                <Input type="number" value={field.validation?.minLength ?? ''} onChange={e => update({ validation: { ...field.validation, minLength: e.target.value ? Number(e.target.value) : undefined } })} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Max Length</Label>
                <Input type="number" value={field.validation?.maxLength ?? ''} onChange={e => update({ validation: { ...field.validation, maxLength: e.target.value ? Number(e.target.value) : undefined } })} className="h-8 text-sm" />
              </div>
            </>
          )}
          {field.type === 'number' && (
            <>
              <div>
                <Label className="text-xs">Min</Label>
                <Input type="number" value={field.validation?.min ?? ''} onChange={e => update({ validation: { ...field.validation, min: e.target.value ? Number(e.target.value) : undefined } })} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Max</Label>
                <Input type="number" value={field.validation?.max ?? ''} onChange={e => update({ validation: { ...field.validation, max: e.target.value ? Number(e.target.value) : undefined } })} className="h-8 text-sm" />
              </div>
            </>
          )}
        </div>

        {/* Pattern */}
        {['text', 'email', 'phone'].includes(field.type) && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Pattern (Regex)</Label>
              <Input value={field.validation?.pattern || ''} onChange={e => update({ validation: { ...field.validation, pattern: e.target.value } })} className="h-8 text-sm" placeholder="^[A-Z].*" />
            </div>
            <div>
              <Label className="text-xs">Pattern Message</Label>
              <Input value={field.validation?.patternMessage || ''} onChange={e => update({ validation: { ...field.validation, patternMessage: e.target.value } })} className="h-8 text-sm" />
            </div>
          </div>
        )}

        {/* Static text content */}
        {field.type === 'paragraph' && (
          <div>
            <Label className="text-xs">Content</Label>
            <Textarea value={field.defaultValue || ''} onChange={e => update({ defaultValue: e.target.value })} rows={3} className="text-xs" placeholder="Static text to display..." />
          </div>
        )}

        {/* Conditional Logic */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Conditional Logic</Label>
            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addCondition}>
              <Plus className="h-3 w-3 mr-0.5" /> Add Rule
            </Button>
          </div>
          {(field.conditionalLogic || []).map((rule, idx) => (
            <div key={idx} className="flex items-center gap-1.5 p-2 rounded border bg-muted/30 text-xs">
              <Select value={rule.action} onValueChange={v => updateCondition(idx, { action: v as any })}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="show">Show</SelectItem>
                  <SelectItem value="hide">Hide</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">when</span>
              <Select value={rule.fieldId || '_none'} onValueChange={v => updateCondition(idx, { fieldId: v === '_none' ? '' : v })}>
                <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue placeholder="Field..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Select field...</SelectItem>
                  {allFields.filter(f => f.id !== field.id).map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={rule.operator} onValueChange={v => updateCondition(idx, { operator: v as any })}>
                <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">equals</SelectItem>
                  <SelectItem value="not_equals">not equals</SelectItem>
                  <SelectItem value="contains">contains</SelectItem>
                  <SelectItem value="is_empty">is empty</SelectItem>
                  <SelectItem value="is_not_empty">is not empty</SelectItem>
                </SelectContent>
              </Select>
              {!['is_empty', 'is_not_empty'].includes(rule.operator) && (
                <Input value={rule.value || ''} onChange={e => updateCondition(idx, { value: e.target.value })} className="h-7 w-24 text-xs" placeholder="Value" />
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeCondition(idx)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
