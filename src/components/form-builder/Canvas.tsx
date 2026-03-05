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
}

export function FormBuilderCanvas({ fields, selectedField, onSelectField }: Props) {
  const getFieldIcon = (type: string) => {
    const ft = fieldTypes.find(f => f.type === type);
    return ft?.icon || <Type className="h-4 w-4" />;
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
        <CardContent className="space-y-3">
          {fields.map((field) => (
            <div
              key={field.id}
              className={`flex items-center gap-3 p-4 rounded-lg border transition-all cursor-pointer ${
                selectedField?.id === field.id
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-primary/50'
              }`}
              onClick={() => onSelectField(field)}
            >
              <div className="cursor-grab text-muted-foreground hover:text-foreground">
                <GripVertical className="h-4 w-4" />
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground">
                {getFieldIcon(field.type)}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{field.label}</p>
                <p className="text-xs text-muted-foreground capitalize">{field.type}</p>
              </div>
              {field.required && (
                <Badge variant="outline" className="text-xs">Required</Badge>
              )}
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Copy className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" className="w-full border-dashed">
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
