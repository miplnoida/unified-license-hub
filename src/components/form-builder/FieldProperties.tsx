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
}

export function FormBuilderFieldProperties({ selectedField }: Props) {
  return (
    <div>
      <Card className="sticky top-6">
        <CardHeader>
          <CardTitle className="text-base">Field Properties</CardTitle>
          <CardDescription>
            {selectedField ? `Editing: ${selectedField.label}` : 'Select a field to edit'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedField ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Label</Label>
                <Input defaultValue={selectedField.label} />
              </div>
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select defaultValue={selectedField.type}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldTypes.map((ft) => (
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
                <Input defaultValue={selectedField.placeholder} placeholder="Enter placeholder text" />
              </div>
              <div className="flex items-center justify-between">
                <Label>Required</Label>
                <input type="checkbox" defaultChecked={selectedField.required} className="h-4 w-4" />
              </div>
              <div className="pt-4 border-t space-y-2">
                <Label className="text-muted-foreground">Validation Rules</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Minimum Length</span>
                    <Input type="number" className="w-20 h-8" placeholder="0" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Maximum Length</span>
                    <Input type="number" className="w-20 h-8" placeholder="255" />
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t">
                <Button variant="outline" className="w-full">
                  <Settings className="h-4 w-4 mr-2" />
                  Advanced Settings
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Settings className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Click on a field to edit its properties
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
