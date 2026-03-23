import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Type, Hash, Mail, Calendar, List, CheckSquare, FileUp,
  AlignLeft, Phone, CircleDot, FileText, Table2, Calculator,
  ListChecks, Percent,
} from 'lucide-react';
import type { FieldType } from '@/types/formBuilder';

export interface FieldTypeDefinition {
  type: FieldType;
  label: string;
  icon: React.ReactNode;
  group: string;
}

export const fieldTypes: FieldTypeDefinition[] = [
  { type: 'text', label: 'Text Input', icon: <Type className="h-4 w-4" />, group: 'input' },
  { type: 'number', label: 'Number', icon: <Hash className="h-4 w-4" />, group: 'input' },
  { type: 'decimal', label: 'Decimal', icon: <Percent className="h-4 w-4" />, group: 'input' },
  { type: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, group: 'input' },
  { type: 'phone', label: 'Phone', icon: <Phone className="h-4 w-4" />, group: 'input' },
  { type: 'date', label: 'Date', icon: <Calendar className="h-4 w-4" />, group: 'input' },
  { type: 'textarea', label: 'Text Area', icon: <AlignLeft className="h-4 w-4" />, group: 'input' },
  { type: 'file', label: 'File Upload', icon: <FileUp className="h-4 w-4" />, group: 'input' },
  { type: 'select', label: 'Dropdown', icon: <List className="h-4 w-4" />, group: 'selection' },
  { type: 'multi_select', label: 'Multi-Select', icon: <ListChecks className="h-4 w-4" />, group: 'selection' },
  { type: 'checkbox', label: 'Checkbox', icon: <CheckSquare className="h-4 w-4" />, group: 'selection' },
  { type: 'radio', label: 'Radio Button', icon: <CircleDot className="h-4 w-4" />, group: 'selection' },
  { type: 'paragraph', label: 'Paragraph', icon: <FileText className="h-4 w-4" />, group: 'content' },
  { type: 'table', label: 'Table / Grid', icon: <Table2 className="h-4 w-4" />, group: 'advanced' },
  { type: 'calculated', label: 'Calculated', icon: <Calculator className="h-4 w-4" />, group: 'advanced' },
];

const groups = [
  { key: 'input', label: 'Input Fields' },
  { key: 'selection', label: 'Selection Fields' },
  { key: 'content', label: 'Content' },
  { key: 'advanced', label: 'Advanced' },
];

interface Props {
  onAddField: (type: FieldType) => void;
}

export function FormBuilderFieldPalette({ onAddField }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Field Types</CardTitle>
        <CardDescription className="text-xs">Click to add</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.map((group, gi) => (
          <div key={group.key}>
            {gi > 0 && <Separator className="mb-3" />}
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {group.label}
            </p>
            <div className="space-y-1">
              {fieldTypes
                .filter(ft => ft.group === group.key)
                .map(ft => (
                  <div
                    key={ft.type}
                    className="flex items-center gap-2.5 p-2 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 cursor-pointer transition-colors"
                    onClick={() => onAddField(ft.type)}
                  >
                    <div className="text-muted-foreground">{ft.icon}</div>
                    <span className="text-xs font-medium">{ft.label}</span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
