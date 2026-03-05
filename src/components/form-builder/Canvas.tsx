import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Plus, GripVertical, Copy, Trash2, Type } from 'lucide-react';
import { fieldTypes } from './FieldPalette';

interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
}

interface Props {
  fields: FormField[];
  selectedField: FormField | null;
  onSelectField: (field: FormField) => void;
  onReorder: (fields: FormField[]) => void;
  onAddField: (type: string) => void;
  onDeleteField: (id: string) => void;
  onDuplicateField: (id: string) => void;
}

export function FormBuilderCanvas({
  fields,
  selectedField,
  onSelectField,
  onReorder,
  onAddField,
  onDeleteField,
  onDuplicateField,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const getFieldIcon = (type: string) => {
    const ft = fieldTypes.find(f => f.type === type);
    return ft?.icon || <Type className="h-4 w-4" />;
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    dragNode.current = e.currentTarget as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    // Make the drag image semi-transparent
    setTimeout(() => {
      if (dragNode.current) dragNode.current.style.opacity = '0.4';
    }, 0);
  };

  const handleDragEnter = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    setOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      const reordered = [...fields];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(overIndex, 0, moved);
      onReorder(reordered);
    }
    if (dragNode.current) dragNode.current.style.opacity = '1';
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="lg:col-span-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Form Fields</CardTitle>
            <Badge variant="secondary">{fields.length} fields</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {fields.map((field, index) => (
            <div
              key={field.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                selectedField?.id === field.id
                  ? 'border-primary bg-primary/5'
                  : dragIndex !== null && overIndex === index
                  ? 'border-primary/50 bg-accent/50'
                  : 'hover:border-primary/50'
              }`}
              onClick={() => onSelectField(field)}
            >
              <div className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing">
                <GripVertical className="h-4 w-4" />
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground">
                {getFieldIcon(field.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{field.label}</p>
                <p className="text-xs text-muted-foreground capitalize">{field.type}</p>
              </div>
              {field.required && (
                <Badge variant="outline" className="text-xs shrink-0">Required</Badge>
              )}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); onDuplicateField(field.id); }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDeleteField(field.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={() => onAddField('text')}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
