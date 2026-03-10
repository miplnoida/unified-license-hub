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
  GripVertical, Plus, Trash2, Copy, ChevronDown, ChevronRight,
  Repeat, Settings2,
} from 'lucide-react';
import { fieldTypes } from './FieldPalette';
import type { FormSection, FormField, FieldType } from '@/types/formBuilder';

interface Props {
  sections: FormSection[];
  selectedFieldId: string | null;
  onSelectField: (field: FormField, sectionId: string) => void;
  onSectionsChange: (sections: FormSection[]) => void;
  onAddField: (sectionId: string, type: FieldType) => void;
  onDeleteField: (sectionId: string, fieldId: string) => void;
  onDuplicateField: (sectionId: string, fieldId: string) => void;
}

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
  const dragIndex = useRef<number | null>(null);
  const overIndex = useRef<number | null>(null);

  const toggleCollapse = (id: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddSection = () => {
    const newSection: FormSection = {
      id: crypto.randomUUID(),
      title: `Section ${sections.length + 1}`,
      description: '',
      sortOrder: sections.length,
      isRepeatable: false,
      fields: [],
    };
    onSectionsChange([...sections, newSection]);
  };

  const handleDeleteSection = (id: string) => {
    onSectionsChange(sections.filter(s => s.id !== id));
  };

  const handleUpdateSection = (id: string, updates: Partial<FormSection>) => {
    onSectionsChange(sections.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleDuplicateSection = (id: string) => {
    const source = sections.find(s => s.id === id);
    if (!source) return;
    const clone: FormSection = {
      ...source,
      id: crypto.randomUUID(),
      title: `${source.title} (Copy)`,
      sortOrder: sections.length,
      fields: source.fields.map(f => ({ ...f, id: crypto.randomUUID() })),
    };
    onSectionsChange([...sections, clone]);
  };

  // Field drag within section
  const handleFieldDragStart = (sectionId: string, fieldIdx: number) => {
    dragIndex.current = fieldIdx;
  };

  const handleFieldDragEnter = (fieldIdx: number) => {
    overIndex.current = fieldIdx;
  };

  const handleFieldDragEnd = (sectionId: string) => {
    if (dragIndex.current !== null && overIndex.current !== null && dragIndex.current !== overIndex.current) {
      const section = sections.find(s => s.id === sectionId);
      if (section) {
        const fields = [...section.fields];
        const [moved] = fields.splice(dragIndex.current, 1);
        fields.splice(overIndex.current, 0, moved);
        handleUpdateSection(sectionId, { fields });
      }
    }
    dragIndex.current = null;
    overIndex.current = null;
  };

  // Section drag
  const sectionDragIdx = useRef<number | null>(null);
  const sectionOverIdx = useRef<number | null>(null);

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
                    <Repeat className="h-3 w-3" />
                    Repeatable
                  </Badge>
                )}

                <Badge variant="secondary" className="text-[10px] ml-auto">
                  {section.fields.length} fields
                </Badge>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 space-y-3" align="end">
                    <div className="space-y-2">
                      <Label className="text-xs">Section Title</Label>
                      <Input
                        value={section.title}
                        onChange={e => handleUpdateSection(section.id, { title: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Description</Label>
                      <Textarea
                        value={section.description || ''}
                        onChange={e => handleUpdateSection(section.id, { description: e.target.value })}
                        rows={2}
                        className="text-sm"
                        placeholder="Optional section description..."
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Repeatable</Label>
                      <Switch
                        checked={section.isRepeatable}
                        onCheckedChange={val => handleUpdateSection(section.id, { isRepeatable: val })}
                      />
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

                {/* Fields list */}
                {section.fields.map((field, fIdx) => (
                  <div
                    key={field.id}
                    draggable
                    onDragStart={() => handleFieldDragStart(section.id, fIdx)}
                    onDragEnter={() => handleFieldDragEnter(fIdx)}
                    onDragOver={e => e.preventDefault()}
                    onDragEnd={() => handleFieldDragEnd(section.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      selectedFieldId === field.id
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => onSelectField(field, section.id)}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab shrink-0" />
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-muted-foreground shrink-0">
                      {getFieldIcon(field.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{field.label}</p>
                      <p className="text-[10px] text-muted-foreground">{field.fieldName}</p>
                    </div>
                    {field.required && <Badge variant="outline" className="text-[10px] px-1 shrink-0">Required</Badge>}
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={e => { e.stopPropagation(); onDuplicateField(section.id, field.id); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={e => { e.stopPropagation(); onDeleteField(section.id, field.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}

                {/* Add field */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="w-full h-10 rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 flex items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors text-xs">
                      <Plus className="h-3.5 w-3.5" />
                      Add Field
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-1 max-h-72 overflow-y-auto" align="start">
                    {fieldTypes.map(ft => (
                      <button
                        key={ft.type}
                        className="flex items-center gap-2 w-full p-2 text-xs rounded hover:bg-accent transition-colors"
                        onClick={() => onAddField(section.id, ft.type)}
                      >
                        <span className="text-muted-foreground">{ft.icon}</span>
                        {ft.label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
