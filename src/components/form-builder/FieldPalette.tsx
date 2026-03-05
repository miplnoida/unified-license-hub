import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
  CircleDot,
  FileText,
} from 'lucide-react';

export const fieldTypes = [
  // Input Fields
  { type: 'text', label: 'Text Input', icon: <Type className="h-4 w-4" />, group: 'input' },
  { type: 'number', label: 'Number', icon: <Hash className="h-4 w-4" />, group: 'input' },
  { type: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, group: 'input' },
  { type: 'phone', label: 'Phone', icon: <Phone className="h-4 w-4" />, group: 'input' },
  { type: 'date', label: 'Date', icon: <Calendar className="h-4 w-4" />, group: 'input' },
  { type: 'file', label: 'File Upload', icon: <FileUp className="h-4 w-4" />, group: 'input' },
  { type: 'textarea', label: 'Text Area', icon: <AlignLeft className="h-4 w-4" />, group: 'input' },
  // Selection Fields
  { type: 'select', label: 'Dropdown', icon: <List className="h-4 w-4" />, group: 'selection' },
  { type: 'checkbox', label: 'Checkbox', icon: <CheckSquare className="h-4 w-4" />, group: 'selection' },
  { type: 'radio', label: 'Radio Button', icon: <CircleDot className="h-4 w-4" />, group: 'selection' },
  // Content Fields
  { type: 'paragraph', label: 'Paragraph', icon: <FileText className="h-4 w-4" />, group: 'content' },
];

interface Props {
  onAddField: (type: string) => void;
}

const groups = [
  { key: 'input', label: 'Input Fields' },
  { key: 'selection', label: 'Selection Fields' },
  { key: 'content', label: 'Content Fields' },
];

export function FormBuilderFieldPalette({ onAddField }: Props) {
  return (
    <div>
      <Card className="sticky top-6">
        <CardHeader>
          <CardTitle className="text-base">Field Types</CardTitle>
          <CardDescription>Click to add a field</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {groups.map((group, gi) => (
            <div key={group.key}>
              {gi > 0 && <Separator className="mb-3" />}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.label}
              </p>
              <div className="space-y-1">
                {fieldTypes
                  .filter(ft => ft.group === group.key)
                  .map(fieldType => (
                    <div
                      key={fieldType.type}
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 cursor-pointer transition-colors"
                      onClick={() => onAddField(fieldType.type)}
                    >
                      <div className="text-muted-foreground">{fieldType.icon}</div>
                      <span className="text-sm font-medium">{fieldType.label}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
