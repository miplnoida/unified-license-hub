import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Type,
  Hash,
  Mail,
  Calendar,
  List,
  CheckSquare,
  FileUp,
  AlignLeft,
  Phone,
} from 'lucide-react';

export const fieldTypes = [
  { type: 'text', label: 'Text Input', icon: <Type className="h-4 w-4" /> },
  { type: 'number', label: 'Number', icon: <Hash className="h-4 w-4" /> },
  { type: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { type: 'phone', label: 'Phone', icon: <Phone className="h-4 w-4" /> },
  { type: 'date', label: 'Date', icon: <Calendar className="h-4 w-4" /> },
  { type: 'select', label: 'Dropdown', icon: <List className="h-4 w-4" /> },
  { type: 'checkbox', label: 'Checkbox', icon: <CheckSquare className="h-4 w-4" /> },
  { type: 'file', label: 'File Upload', icon: <FileUp className="h-4 w-4" /> },
  { type: 'textarea', label: 'Text Area', icon: <AlignLeft className="h-4 w-4" /> },
];

export function FormBuilderFieldPalette() {
  return (
    <div>
      <Card className="sticky top-6">
        <CardHeader>
          <CardTitle className="text-base">Field Types</CardTitle>
          <CardDescription>Drag fields to the form</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {fieldTypes.map((fieldType) => (
            <div
              key={fieldType.type}
              className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 cursor-grab transition-colors"
              draggable
            >
              <div className="text-muted-foreground">{fieldType.icon}</div>
              <span className="text-sm font-medium">{fieldType.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
