import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Settings } from 'lucide-react';
import { fieldTypes } from './FieldPalette';

interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
}

interface Props {
  selectedField: FormField | null;
  onUpdateField: (id: string, updates: Partial<FormField>) => void;
}

export function FormBuilderFieldProperties({ selectedField, onUpdateField }: Props) {
  if (!selectedField) {
    return (
      <div>
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

  return (
    <div>
      <Card className="sticky top-6">
        <CardHeader>
          <CardTitle className="text-base">Field Properties</CardTitle>
          <CardDescription>Editing: {selectedField.label}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={selectedField.label}
                onChange={e => onUpdateField(selectedField.id, { label: e.target.value })}
              />
            </div>
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
            <div className="space-y-2">
              <Label>Placeholder</Label>
              <Input
                value={selectedField.placeholder || ''}
                onChange={e => onUpdateField(selectedField.id, { placeholder: e.target.value })}
                placeholder="Enter placeholder text"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Required</Label>
              <Switch
                checked={selectedField.required}
                onCheckedChange={val => onUpdateField(selectedField.id, { required: val })}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
