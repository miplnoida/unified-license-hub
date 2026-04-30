import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GitCompare, Plus, Minus, Edit3 } from 'lucide-react';
import { useFormVersions } from '@/hooks/useFormTemplates';
import type { FormSection, FormField } from '@/types/formBuilder';

interface VersionDiffViewerProps {
  templateId: string;
  formName: string;
}

interface DiffItem {
  type: 'added' | 'removed' | 'changed' | 'unchanged';
  sectionTitle: string;
  fieldLabel: string;
  fieldName: string;
  details?: string;
}

function computeDiff(oldSections: FormSection[], newSections: FormSection[]): DiffItem[] {
  const items: DiffItem[] = [];
  const oldFields = new Map<string, { field: FormField; section: string }>();
  const newFields = new Map<string, { field: FormField; section: string }>();

  oldSections.forEach(s => s.fields.forEach(f => oldFields.set(f.id, { field: f, section: s.title })));
  newSections.forEach(s => s.fields.forEach(f => newFields.set(f.id, { field: f, section: s.title })));

  // Removed fields
  oldFields.forEach((v, id) => {
    if (!newFields.has(id)) {
      items.push({ type: 'removed', sectionTitle: v.section, fieldLabel: v.field.label, fieldName: v.field.fieldName });
    }
  });

  // Added fields
  newFields.forEach((v, id) => {
    if (!oldFields.has(id)) {
      items.push({ type: 'added', sectionTitle: v.section, fieldLabel: v.field.label, fieldName: v.field.fieldName });
    }
  });

  // Changed fields
  newFields.forEach((v, id) => {
    const old = oldFields.get(id);
    if (!old) return;
    const changes: string[] = [];
    if (old.field.type !== v.field.type) changes.push(`Type: ${old.field.type} → ${v.field.type}`);
    if (old.field.label !== v.field.label) changes.push(`Label: "${old.field.label}" → "${v.field.label}"`);
    if (old.field.required !== v.field.required) changes.push(`Required: ${old.field.required} → ${v.field.required}`);
    if (JSON.stringify(old.field.options) !== JSON.stringify(v.field.options)) changes.push('Options changed');
    if (JSON.stringify(old.field.validation) !== JSON.stringify(v.field.validation)) changes.push('Validation changed');
    if (old.section !== v.section) changes.push(`Section: "${old.section}" → "${v.section}"`);

    if (changes.length > 0) {
      items.push({ type: 'changed', sectionTitle: v.section, fieldLabel: v.field.label, fieldName: v.field.fieldName, details: changes.join('; ') });
    }
  });

  // Section-level changes
  const oldSectionIds = new Set(oldSections.map(s => s.id));
  const newSectionIds = new Set(newSections.map(s => s.id));
  newSections.forEach(s => {
    if (!oldSectionIds.has(s.id)) {
      items.unshift({ type: 'added', sectionTitle: s.title, fieldLabel: `[Section Added]`, fieldName: '' });
    }
  });
  oldSections.forEach(s => {
    if (!newSectionIds.has(s.id)) {
      items.unshift({ type: 'removed', sectionTitle: s.title, fieldLabel: `[Section Removed]`, fieldName: '' });
    }
  });

  return items;
}

const iconMap = {
  added: <Plus className="h-4 w-4 text-green-600" />,
  removed: <Minus className="h-4 w-4 text-red-600" />,
  changed: <Edit3 className="h-4 w-4 text-amber-600" />,
  unchanged: null,
};

const bgMap = {
  added: 'bg-green-50 dark:bg-green-950/30 border-green-200',
  removed: 'bg-red-50 dark:bg-red-950/30 border-red-200',
  changed: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200',
  unchanged: '',
};

export function VersionDiffViewer({ templateId, formName }: VersionDiffViewerProps) {
  const [open, setOpen] = useState(false);
  const { data: versions = [] } = useFormVersions(templateId);
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');

  const leftVersion = versions.find((v: any) => v.id === leftId);
  const rightVersion = versions.find((v: any) => v.id === rightId);

  // Auto-default: Old (Base) = oldest, New (Compare) = latest
  useEffect(() => {
    if (!open || versions.length < 2) return;
    const sorted = [...versions].sort((a: any, b: any) => {
      const av = parseFloat(a.semantic_version || String(a.version || 0));
      const bv = parseFloat(b.semantic_version || String(b.version || 0));
      return av - bv;
    });
    const oldest = sorted[0];
    const latest = sorted[sorted.length - 1];
    if (!leftId && oldest) setLeftId(oldest.id);
    if (!rightId && latest) setRightId(latest.id);
  }, [open, versions, leftId, rightId]);

  const diff = useMemo(() => {
    if (!leftVersion || !rightVersion) return [];
    const oldSections = (leftVersion.schema_snapshot || []) as unknown as FormSection[];
    const newSections = (rightVersion.schema_snapshot || []) as unknown as FormSection[];
    return computeDiff(oldSections, newSections);
  }, [leftVersion, rightVersion]);

  const stats = useMemo(() => ({
    added: diff.filter(d => d.type === 'added').length,
    removed: diff.filter(d => d.type === 'removed').length,
    changed: diff.filter(d => d.type === 'changed').length,
  }), [diff]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={versions.length < 2}>
        <GitCompare className="h-4 w-4 mr-1" />
        Compare
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5" /> Version Comparison
            </DialogTitle>
            <DialogDescription>{formName} — Select two versions to compare</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Old Version (Base)</label>
              <Select value={leftId} onValueChange={(val) => {
                // Auto-swap if user picks a version newer than current "new"
                if (rightId) {
                  const selected = versions.find((v: any) => v.id === val);
                  const right = versions.find((v: any) => v.id === rightId);
                  const sNum = parseFloat(selected?.semantic_version || String(selected?.version || 0));
                  const rNum = parseFloat(right?.semantic_version || String(right?.version || 0));
                  if (sNum > rNum) {
                    setLeftId(rightId);
                    setRightId(val);
                    return;
                  }
                }
                setLeftId(val);
              }}>
                <SelectTrigger><SelectValue placeholder="Select base version" /></SelectTrigger>
                <SelectContent>
                  {versions.filter((v: any) => v.id !== rightId).map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>v{v.semantic_version || v.version} — {v.status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">New Version (Compare)</label>
              <Select value={rightId} onValueChange={(val) => {
                // Auto-swap if user picks a version older than current "old"
                if (leftId) {
                  const selected = versions.find((v: any) => v.id === val);
                  const left = versions.find((v: any) => v.id === leftId);
                  const sNum = parseFloat(selected?.semantic_version || String(selected?.version || 0));
                  const lNum = parseFloat(left?.semantic_version || String(left?.version || 0));
                  if (sNum < lNum) {
                    setRightId(leftId);
                    setLeftId(val);
                    return;
                  }
                }
                setRightId(val);
              }}>
                <SelectTrigger><SelectValue placeholder="Select compare version" /></SelectTrigger>
                <SelectContent>
                  {versions.filter((v: any) => v.id !== leftId).map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>v{v.semantic_version || v.version} — {v.status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {leftId && rightId && (
            <>
              <div className="flex gap-3 text-sm">
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">+{stats.added} added</Badge>
                <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400">−{stats.removed} removed</Badge>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">~{stats.changed} changed</Badge>
              </div>

              <ScrollArea className="max-h-[50vh] pr-2">
                <div className="space-y-2">
                  {diff.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No differences found between versions.</p>
                  ) : (
                    diff.map((item, idx) => (
                      <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border ${bgMap[item.type]}`}>
                        {iconMap[item.type]}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{item.fieldLabel}</span>
                            {item.fieldName && (
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.fieldName}</code>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Section: {item.sectionTitle}</p>
                          {item.details && <p className="text-xs mt-1">{item.details}</p>}
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">{item.type}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
