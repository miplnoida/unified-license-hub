import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Plus,
  GripVertical,
  Copy,
  Trash2,
  Type,
  Columns2,
  Columns3,
  Columns4,
  Square,
} from 'lucide-react';
import { fieldTypes } from './FieldPalette';
import type { FormField, FormRow } from '@/types/formBuilder';

interface Props {
  rows: FormRow[];
  selectedField: FormField | null;
  onSelectField: (field: FormField) => void;
  onReorderRows: (rows: FormRow[]) => void;
  onAddRow: (columns: 1 | 2 | 3 | 4) => void;
  onDeleteRow: (rowId: string) => void;
  onUpdateRowColumns: (rowId: string, columns: 1 | 2 | 3 | 4) => void;
  onAddFieldToSlot: (rowId: string, slotIndex: number, type: string) => void;
  onDeleteField: (rowId: string, slotIndex: number) => void;
  onDuplicateField: (rowId: string, slotIndex: number) => void;
}

const columnIcons: Record<number, React.ReactNode> = {
  1: <Square className="h-3 w-3" />,
  2: <Columns2 className="h-3 w-3" />,
  3: <Columns3 className="h-3 w-3" />,
  4: <Columns4 className="h-3 w-3" />,
};

export function FormBuilderCanvas({
  rows,
  selectedField,
  onSelectField,
  onReorderRows,
  onAddRow,
  onDeleteRow,
  onUpdateRowColumns,
  onAddFieldToSlot,
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

  const getFieldLabel = (type: string) => {
    const ft = fieldTypes.find(f => f.type === type);
    return ft?.label || type;
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    dragNode.current = e.currentTarget as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
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
      const reordered = [...rows];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(overIndex, 0, moved);
      onReorderRows(reordered);
    }
    if (dragNode.current) dragNode.current.style.opacity = '1';
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const totalFields = rows.reduce((acc, row) => acc + row.fields.filter(Boolean).length, 0);

  return (
    <div className="col-span-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Form Layout</CardTitle>
            <Badge variant="secondary">{totalFields} fields · {rows.length} rows</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row, rowIndex) => (
            <div
              key={row.id}
              draggable
              onDragStart={(e) => handleDragStart(e, rowIndex)}
              onDragEnter={() => handleDragEnter(rowIndex)}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              className={`rounded-lg border p-3 transition-all ${
                dragIndex !== null && overIndex === rowIndex
                  ? 'border-primary/50 bg-accent/50'
                  : 'border-border'
              }`}
            >
              {/* Row header */}
              <div className="flex items-center gap-2 mb-2">
                <div className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing">
                  <GripVertical className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Row {rowIndex + 1}</span>
                <Select
                  value={String(row.columns)}
                  onValueChange={(val) => onUpdateRowColumns(row.id, Number(val) as 1 | 2 | 3 | 4)}
                >
                  <SelectTrigger className="h-7 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Column</SelectItem>
                    <SelectItem value="2">2 Columns</SelectItem>
                    <SelectItem value="3">3 Columns</SelectItem>
                    <SelectItem value="4">4 Columns</SelectItem>
                  </SelectContent>
                </Select>
                <div className="ml-auto">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => onDeleteRow(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Column slots */}
              <div
                className="grid gap-2 overflow-hidden"
                style={{ gridTemplateColumns: `repeat(${row.columns}, minmax(0, 1fr))` }}
              >
                {row.fields.map((field, slotIndex) => (
                  <div key={`${row.id}-${slotIndex}`} className="min-w-0">
                    {field ? (
                      <div
                        className={`flex flex-col gap-1 p-2.5 rounded-md border cursor-pointer transition-all overflow-hidden ${
                          selectedField?.id === field.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-primary/50 border-muted'
                        }`}
                        onClick={() => onSelectField(field)}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-muted-foreground shrink-0">
                            {getFieldIcon(field.type)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-xs break-words">{field.label}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{getFieldLabel(field.type)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 pt-0.5 border-t border-border/50">
                          {field.required && (
                            <Badge variant="outline" className="text-[10px] px-1">Req</Badge>
                          )}
                          <div className="flex items-center ml-auto">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); onDuplicateField(row.id, slotIndex); }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={(e) => { e.stopPropagation(); onDeleteField(row.id, slotIndex); }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className="w-full h-[42px] rounded-md border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 flex items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors text-xs"
                          >
                            <Plus className="h-3 w-3 shrink-0" />
                            <span className="truncate">Add</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-1 max-h-60 overflow-y-auto" align="start">
                          {fieldTypes.map(ft => (
                            <button
                              key={ft.type}
                              className="flex items-center gap-2 w-full p-2 text-xs rounded hover:bg-accent transition-colors"
                              onClick={() => {
                                onAddFieldToSlot(row.id, slotIndex, ft.type);
                              }}
                            >
                              <span className="text-muted-foreground">{ft.icon}</span>
                              {ft.label}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Add Row buttons */}
          <div className="flex gap-2 flex-wrap">
            {([1, 2, 3, 4] as const).map(cols => (
              <Button
                key={cols}
                variant="outline"
                size="sm"
                className="border-dashed flex-1"
                onClick={() => onAddRow(cols)}
              >
                {columnIcons[cols]}
                <span className="ml-1.5 text-xs">Add {cols}-Col Row</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
