import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { GitCompareArrows, Loader2 } from 'lucide-react';
import { useFormVersion, useVersionSections } from '@/hooks/useFormTemplates';
import type { FormSection } from '@/types/formBuilder';

interface SubmissionInfo {
  id: string;
  label: string; // e.g. "RET-2025-00001 — Q1 2025"
  versionId: string | null;
  data: Record<string, any>;
}

interface SubmissionCompareDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formName?: string;
  left: SubmissionInfo;
  right: SubmissionInfo;
}

interface FieldDiff {
  fieldName: string;
  label: string;
  section: string;
  leftValue: string;
  rightValue: string;
  changed: boolean;
  onlyOn?: 'left' | 'right';
}

function flattenFields(sections: FormSection[]) {
  const out: { fieldName: string; label: string; section: string }[] = [];
  for (const s of sections) {
    for (const f of s.fields) {
      out.push({ fieldName: f.fieldName || f.id, label: f.label || f.fieldName, section: s.title });
    }
  }
  return out;
}

function fmt(v: any): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

export function SubmissionCompareDialog({ open, onOpenChange, formName, left, right }: SubmissionCompareDialogProps) {
  const { data: leftSections = [], isLoading: lL } = useVersionSections(left.versionId);
  const { data: rightSections = [], isLoading: rL } = useVersionSections(right.versionId);
  const { data: leftV } = useFormVersion(left.versionId);
  const { data: rightV } = useFormVersion(right.versionId);
  const loading = lL || rL;

  const [onlyDiffs, setOnlyDiffs] = useState(true);

  const diffs: FieldDiff[] = useMemo(() => {
    if (loading) return [];
    const leftFields = flattenFields(leftSections as FormSection[]);
    const rightFields = flattenFields(rightSections as FormSection[]);
    const map = new Map<string, FieldDiff>();
    for (const f of leftFields) {
      map.set(f.fieldName, {
        fieldName: f.fieldName,
        label: f.label,
        section: f.section,
        leftValue: fmt(left.data[f.fieldName]),
        rightValue: '—',
        changed: false,
        onlyOn: 'left',
      });
    }
    for (const f of rightFields) {
      const existing = map.get(f.fieldName);
      if (existing) {
        existing.rightValue = fmt(right.data[f.fieldName]);
        existing.onlyOn = undefined;
        existing.changed = existing.leftValue !== existing.rightValue;
      } else {
        map.set(f.fieldName, {
          fieldName: f.fieldName,
          label: f.label,
          section: f.section,
          leftValue: '—',
          rightValue: fmt(right.data[f.fieldName]),
          changed: false,
          onlyOn: 'right',
        });
      }
    }
    let arr = Array.from(map.values());
    arr.forEach(d => { if (d.onlyOn) d.changed = true; });
    return arr;
  }, [loading, leftSections, rightSections, left.data, right.data]);

  const filtered = onlyDiffs ? diffs.filter(d => d.changed) : diffs;
  const stats = {
    total: diffs.length,
    changed: diffs.filter(d => d.changed && !d.onlyOn).length,
    onlyLeft: diffs.filter(d => d.onlyOn === 'left').length,
    onlyRight: diffs.filter(d => d.onlyOn === 'right').length,
  };

  const lLabel = (leftV as any)?.semantic_version || `v${(leftV as any)?.version || '?'}`;
  const rLabel = (rightV as any)?.semantic_version || `v${(rightV as any)?.version || '?'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5" /> Submission Comparison{formName ? ` — ${formName}` : ''}
          </DialogTitle>
          <DialogDescription>
            Field-level differences between two submissions. Versions: <strong>{left.label}</strong> (v{lLabel}) vs{' '}
            <strong>{right.label}</strong> (v{rLabel}).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading form versions...
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{stats.total} fields</Badge>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">{stats.changed} changed</Badge>
              <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400">{stats.onlyLeft} only on left</Badge>
              <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">{stats.onlyRight} only on right</Badge>
              <div className="flex-1" />
              <Button size="sm" variant={onlyDiffs ? 'default' : 'outline'} onClick={() => setOnlyDiffs(o => !o)}>
                {onlyDiffs ? 'Showing differences only' : 'Showing all fields'}
              </Button>
            </div>

            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-2">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No differences found.</p>
                ) : filtered.map(d => (
                  <Card key={d.fieldName} className="p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-sm font-medium">{d.label}</span>
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{d.fieldName}</code>
                      <span className="text-[11px] text-muted-foreground">Section: {d.section}</span>
                      {d.onlyOn === 'left' && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700">missing on right</Badge>}
                      {d.onlyOn === 'right' && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">added on right</Badge>}
                      {d.changed && !d.onlyOn && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700">changed</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="border rounded p-2 bg-muted/30">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Left ({left.label})</p>
                        <p className="break-words whitespace-pre-wrap">{d.leftValue}</p>
                      </div>
                      <div className="border rounded p-2 bg-muted/30">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Right ({right.label})</p>
                        <p className="break-words whitespace-pre-wrap">{d.rightValue}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
