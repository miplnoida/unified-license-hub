import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { GitCompare, Plus, Minus, Edit3, Columns2, List } from 'lucide-react';
import { useFormVersions, useVersionSections } from '@/hooks/useFormTemplates';
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
  /** Attribute-level snapshot used by the side-by-side view. */
  oldSide?: FieldSnapshot;
  newSide?: FieldSnapshot;
  /** Attribute keys that differ (side-by-side highlights only these). */
  changedKeys?: string[];
}

interface FieldSnapshot {
  label: string;
  fieldName: string;
  type: string;
  required: boolean;
  options?: string;
  validation?: string;
  section: string;
}

function snapshot(field: FormField, section: string): FieldSnapshot {
  return {
    label: field.label,
    fieldName: field.fieldName,
    type: field.type,
    required: !!field.required,
    options: field.options?.length ? field.options.map((o: any) => (typeof o === 'string' ? o : o?.label ?? o?.value)).join(', ') : undefined,
    validation: field.validation ? JSON.stringify(field.validation) : undefined,
    section,
  };
}

/**
 * Stable cross-version identity for a field.
 * Field `id`s are regenerated on every new version (see `useCreateNewFormVersion`),
 * so pairing by id would report every field as removed+added. Pair by fieldName,
 * then by section::label, and only fall back to id as a last resort.
 */
function fieldKey(field: FormField, section: string): string {
  const fn = (field.fieldName || '').trim();
  if (fn) return `n:${fn.toLowerCase()}`;
  const lbl = (field.label || '').trim();
  if (lbl) return `l:${section.trim().toLowerCase()}::${lbl.toLowerCase()}`;
  return `i:${field.id}`;
}

function computeDiff(oldSections: FormSection[], newSections: FormSection[]): DiffItem[] {
  const items: DiffItem[] = [];
  const oldFields = new Map<string, { field: FormField; section: string }>();
  const newFields = new Map<string, { field: FormField; section: string }>();

  oldSections.forEach(s => (s.fields || []).forEach(f => oldFields.set(fieldKey(f, s.title), { field: f, section: s.title })));
  newSections.forEach(s => (s.fields || []).forEach(f => newFields.set(fieldKey(f, s.title), { field: f, section: s.title })));


  // Removed fields
  oldFields.forEach((v, id) => {
    if (!newFields.has(id)) {
      items.push({
        type: 'removed',
        sectionTitle: v.section,
        fieldLabel: v.field.label,
        fieldName: v.field.fieldName,
        oldSide: snapshot(v.field, v.section),
      });
    }
  });

  // Added fields
  newFields.forEach((v, id) => {
    if (!oldFields.has(id)) {
      items.push({
        type: 'added',
        sectionTitle: v.section,
        fieldLabel: v.field.label,
        fieldName: v.field.fieldName,
        newSide: snapshot(v.field, v.section),
      });
    }
  });

  // Changed / unchanged fields
  newFields.forEach((v, id) => {
    const old = oldFields.get(id);
    if (!old) return;
    const changes: string[] = [];
    const changedKeys: string[] = [];
    if (old.field.type !== v.field.type) { changes.push(`Type: ${old.field.type} → ${v.field.type}`); changedKeys.push('type'); }
    if (old.field.label !== v.field.label) { changes.push(`Label: "${old.field.label}" → "${v.field.label}"`); changedKeys.push('label'); }
    if (old.field.required !== v.field.required) { changes.push(`Required: ${old.field.required} → ${v.field.required}`); changedKeys.push('required'); }
    if (JSON.stringify(old.field.options) !== JSON.stringify(v.field.options)) { changes.push('Options changed'); changedKeys.push('options'); }
    if (JSON.stringify(old.field.validation) !== JSON.stringify(v.field.validation)) { changes.push('Validation changed'); changedKeys.push('validation'); }
    if (old.section !== v.section) { changes.push(`Section: "${old.section}" → "${v.section}"`); changedKeys.push('section'); }

    items.push({
      type: changes.length > 0 ? 'changed' : 'unchanged',
      sectionTitle: v.section,
      fieldLabel: v.field.label,
      fieldName: v.field.fieldName,
      details: changes.length > 0 ? changes.join('; ') : undefined,
      oldSide: snapshot(old.field, old.section),
      newSide: snapshot(v.field, v.section),
      changedKeys,
    });
  });

  // Section-level changes (matched by title — section ids are regenerated per version)
  const sectionKey = (s: FormSection) => (s.title || '').trim().toLowerCase();
  const oldSectionKeys = new Set(oldSections.map(sectionKey));
  const newSectionKeys = new Set(newSections.map(sectionKey));
  newSections.forEach(s => {
    if (!oldSectionKeys.has(sectionKey(s))) {
      items.unshift({ type: 'added', sectionTitle: s.title, fieldLabel: `[Section Added]`, fieldName: '' });
    }
  });
  oldSections.forEach(s => {
    if (!newSectionKeys.has(sectionKey(s))) {
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
  unchanged: 'bg-muted/30 border-border',
};

function SidePanel({
  snap,
  tone,
  changedKeys,
  emptyLabel,
}: {
  snap?: FieldSnapshot;
  tone: 'added' | 'removed' | 'changed' | 'unchanged';
  changedKeys?: string[];
  emptyLabel: string;
}) {
  if (!snap) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground flex items-center justify-center min-h-[76px]">
        {emptyLabel}
      </div>
    );
  }
  const hl = (key: string) =>
    changedKeys?.includes(key) ? 'font-medium text-foreground' : 'text-muted-foreground';
  return (
    <div className={`rounded-md border p-3 space-y-1 ${bgMap[tone]}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-sm ${changedKeys?.includes('label') ? 'font-semibold underline decoration-dotted' : 'font-medium'}`}>
          {snap.label}
        </span>
        {snap.fieldName && <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{snap.fieldName}</code>}
      </div>
      <div className="text-xs space-y-0.5">
        <div className={hl('type')}>Type: {snap.type}</div>
        <div className={hl('required')}>Required: {snap.required ? 'Yes' : 'No'}</div>
        <div className={hl('section')}>Section: {snap.section}</div>
        {snap.options && <div className={`${hl('options')} break-words`}>Options: {snap.options}</div>}
        {snap.validation && <div className={`${hl('validation')} break-words`}>Validation: {snap.validation}</div>}
      </div>
    </div>
  );
}

export function VersionDiffViewer({ templateId, formName }: VersionDiffViewerProps) {
  const [open, setOpen] = useState(false);
  const { data: versions = [] } = useFormVersions(templateId);
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [sideBySide, setSideBySide] = useState(true);
  const [showUnchanged, setShowUnchanged] = useState(false);

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

  // Sections must be resolved the same way the app renders a version: use the
  // JSON snapshot when present, otherwise rebuild from normalized form_fields.
  // Many versions store an empty snapshot, which previously made every diff empty.
  const { data: leftSections = [], isFetching: leftLoading } = useVersionSections(leftId || null);
  const { data: rightSections = [], isFetching: rightLoading } = useVersionSections(rightId || null);
  const loading = !!leftId && !!rightId && (leftLoading || rightLoading);

  const diff = useMemo(() => {
    if (!leftVersion || !rightVersion) return [];
    return computeDiff(leftSections as FormSection[], rightSections as FormSection[]);
  }, [leftVersion, rightVersion, leftSections, rightSections]);

  const stats = useMemo(() => ({
    added: diff.filter(d => d.type === 'added').length,
    removed: diff.filter(d => d.type === 'removed').length,
    changed: diff.filter(d => d.type === 'changed').length,
    unchanged: diff.filter(d => d.type === 'unchanged').length,
  }), [diff]);

  const visible = useMemo(
    () => diff.filter(d => (d.type === 'unchanged' ? showUnchanged : true)),
    [diff, showUnchanged],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, DiffItem[]>();
    visible.forEach(item => {
      const list = map.get(item.sectionTitle) || [];
      list.push(item);
      map.set(item.sectionTitle, list);
    });
    return Array.from(map.entries());
  }, [visible]);

  const leftLabel = leftVersion ? `v${(leftVersion as any).semantic_version || (leftVersion as any).version}` : '';
  const rightLabel = rightVersion ? `v${(rightVersion as any).semantic_version || (rightVersion as any).version}` : '';

  return (
    <>
      <Button data-rbac="form_management.edit" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={versions.length < 2}>
        <GitCompare className="h-4 w-4 mr-1" />
        Compare
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5" /> Version Comparison
            </DialogTitle>
            <DialogDescription>{formName} — Select two versions to compare</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-3 text-sm flex-wrap">
                  <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">+{stats.added} added</Badge>
                  <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400">−{stats.removed} removed</Badge>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">~{stats.changed} changed</Badge>
                  <Badge variant="outline">{stats.unchanged} unchanged</Badge>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch id="diff-unchanged" checked={showUnchanged} onCheckedChange={setShowUnchanged} />
                    <Label htmlFor="diff-unchanged" className="text-xs">Show unchanged</Label>
                  </div>
                  <div className="flex items-center gap-1 rounded-md border p-0.5">
                    <Button
                      type="button"
                      variant={sideBySide ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSideBySide(true)}
                    >
                      <Columns2 className="h-3.5 w-3.5 mr-1" /> Side by side
                    </Button>
                    <Button
                      type="button"
                      variant={!sideBySide ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSideBySide(false)}
                    >
                      <List className="h-3.5 w-3.5 mr-1" /> List
                    </Button>
                  </div>
                </div>
              </div>

              {stats.changed === 0 && stats.unchanged === 0 && (stats.added > 0 || stats.removed > 0) && (
                <p className="text-xs text-muted-foreground">
                  These two versions share no common fields — every field was replaced, so there is nothing to show side by side as “changed” or “unchanged”.
                </p>
              )}



              <ScrollArea className="max-h-[50vh] pr-2">
                {visible.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {diff.length === 0 ? 'No differences found between versions.' : 'No changes to show. Enable “Show unchanged” to see all fields.'}
                  </p>
                ) : sideBySide ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sticky top-0 bg-background z-10 pb-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {leftLabel} — {(leftVersion as any)?.status}
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {rightLabel} — {(rightVersion as any)?.status}
                      </div>
                    </div>
                    {grouped.map(([section, items]) => (
                      <div key={section} className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground border-b pb-1">{section}</div>
                        {items.map((item, idx) => (
                          <div key={`${section}-${idx}`} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <SidePanel
                              snap={item.oldSide}
                              tone={item.type === 'added' ? 'unchanged' : item.type}
                              changedKeys={item.type === 'changed' ? item.changedKeys : undefined}
                              emptyLabel={`Not present in ${leftLabel}`}
                            />
                            <SidePanel
                              snap={item.newSide}
                              tone={item.type === 'removed' ? 'unchanged' : item.type}
                              changedKeys={item.type === 'changed' ? item.changedKeys : undefined}
                              emptyLabel={`Removed in ${rightLabel}`}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visible.map((item, idx) => (
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
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
