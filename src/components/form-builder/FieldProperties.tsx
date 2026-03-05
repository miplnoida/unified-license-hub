import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings, Plus, X } from 'lucide-react';
import { fieldTypes } from './FieldPalette';
import type { FormField, FileValidation } from '@/types/formBuilder';

const COMMON_FILE_TYPES = [
  { value: '.pdf', label: 'PDF' },
  { value: '.doc,.docx', label: 'Word (DOC/DOCX)' },
  { value: '.xls,.xlsx', label: 'Excel (XLS/XLSX)' },
  { value: '.jpg,.jpeg', label: 'JPEG' },
  { value: '.png', label: 'PNG' },
  { value: '.gif', label: 'GIF' },
  { value: '.csv', label: 'CSV' },
  { value: '.txt', label: 'Text (TXT)' },
  { value: '.zip,.rar', label: 'Archive (ZIP/RAR)' },
];

interface Props {
  selectedField: FormField | null;
  onUpdateField: (id: string, updates: Partial<FormField>) => void;
}

export function FormBuilderFieldProperties({ selectedField, onUpdateField }: Props) {
  if (!selectedField) {
    return (
      <div className="col-span-4">
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle className="text-base">Field Properties</CardTitle>
            <CardDescription>Select a field to edit</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Settings className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Click on a field to edit its properties
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isParagraph = selectedField.type === 'paragraph';
  const hasOptions = ['radio', 'select', 'checkbox'].includes(selectedField.type);

  const handleAddOption = () => {
    const options = selectedField.options || [];
    onUpdateField(selectedField.id, { options: [...options, `Option ${options.length + 1}`] });
  };

  const handleRemoveOption = (index: number) => {
    const options = [...(selectedField.options || [])];
    options.splice(index, 1);
    onUpdateField(selectedField.id, { options });
  };

  const handleUpdateOption = (index: number, value: string) => {
    const options = [...(selectedField.options || [])];
    options[index] = value;
    onUpdateField(selectedField.id, { options });
  };

  return (
    <div className="col-span-4">
      <Card className="sticky top-6">
        <CardHeader>
          <CardTitle className="text-base">Field Properties</CardTitle>
          <CardDescription>Editing: {selectedField.label}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Label */}
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={selectedField.label}
                onChange={e => onUpdateField(selectedField.id, { label: e.target.value })}
              />
            </div>

            {/* Field Type */}
            <div className="space-y-2">
              <Label>Field Type</Label>
              <Select
                value={selectedField.type}
                onValueChange={val => onUpdateField(selectedField.id, { type: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map(ft => (
                    <SelectItem key={ft.type} value={ft.type}>
                      <div className="flex items-center gap-2">
                        {ft.icon}
                        <span>{ft.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Paragraph Content */}
            {isParagraph && (
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea
                  value={selectedField.content || ''}
                  onChange={e => onUpdateField(selectedField.id, { content: e.target.value })}
                  placeholder="Enter paragraph text..."
                  rows={4}
                />
                <p className="text-[11px] text-muted-foreground">
                  This content will be displayed as static text in the form. It does not collect user input.
                </p>
              </div>
            )}

            {/* Options for radio/select/checkbox */}
            {hasOptions && (
              <div className="space-y-2">
                <Label>Options</Label>
                <div className="space-y-1.5">
                  {(selectedField.options || []).map((opt, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        value={opt}
                        onChange={e => handleUpdateOption(i, e.target.value)}
                        className="h-8 text-sm"
                        placeholder={`Option ${i + 1}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive"
                        onClick={() => handleRemoveOption(i)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={handleAddOption}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Option
                </Button>
              </div>
            )}

            {/* Placeholder (not for paragraph, radio, checkbox, file) */}
            {!isParagraph && !['radio', 'checkbox', 'file'].includes(selectedField.type) && (
              <div className="space-y-2">
                <Label>Placeholder</Label>
                <Input
                  value={selectedField.placeholder || ''}
                  onChange={e => onUpdateField(selectedField.id, { placeholder: e.target.value })}
                  placeholder="Enter placeholder text"
                />
              </div>
            )}

            {/* File Upload Validation */}
            {selectedField.type === 'file' && (
              <div className="space-y-3">
                <Label className="font-medium">File Upload Settings</Label>

                {/* Allowed File Types */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Allowed File Types</Label>
                    <div className="space-y-1.5">
                      {COMMON_FILE_TYPES.map(ft => {
                        const current = selectedField.fileValidation?.allowedTypes || [];
                        const checked = current.includes(ft.value);
                        return (
                          <label key={ft.value} className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(val) => {
                                const updated = val
                                  ? [...current, ft.value]
                                  : current.filter(t => t !== ft.value);
                                onUpdateField(selectedField.id, {
                                  fileValidation: { ...selectedField.fileValidation, allowedTypes: updated },
                                });
                              }}
                            />
                            <span>{ft.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  <p className="text-[11px] text-muted-foreground">Leave all unchecked to allow any file type.</p>
                </div>

                {/* Min Size */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Min File Size (KB)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 text-sm"
                    value={selectedField.fileValidation?.minSizeKB ?? ''}
                    onChange={e => {
                      const val = e.target.value ? Number(e.target.value) : undefined;
                      onUpdateField(selectedField.id, {
                        fileValidation: { ...selectedField.fileValidation, minSizeKB: val },
                      });
                    }}
                    placeholder="e.g. 10"
                  />
                </div>

                {/* Max Size */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Max File Size (MB)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 text-sm"
                    value={selectedField.fileValidation?.maxSizeMB ?? ''}
                    onChange={e => {
                      const val = e.target.value ? Number(e.target.value) : undefined;
                      onUpdateField(selectedField.id, {
                        fileValidation: { ...selectedField.fileValidation, maxSizeMB: val },
                      });
                    }}
                    placeholder="e.g. 5"
                  />
                </div>
              </div>
            )}

            {/* Required toggle (not for paragraph) */}
            {!isParagraph && (
              <div className="flex items-center justify-between">
                <Label>Required</Label>
                <Switch
                  checked={selectedField.required}
                  onCheckedChange={val => onUpdateField(selectedField.id, { required: val })}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
