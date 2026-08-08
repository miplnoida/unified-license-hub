import { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitCompareArrows } from 'lucide-react';
import type { ReturnRevision } from '@/hooks/useReturnRevisions';
import { formatDateTime } from '@/lib/datetime';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  revisions: ReturnRevision[];
  /** Current live values grouped by form_id → field_name → value. Included as a virtual "current" option. */
  currentValues?: Record<string, Record<string, any>>;
  returnLabel?: string;
}

const REASON_LABEL: Record<string, string> = {
  submitted: 'Initial submission',
  edit_requested: 'Edit requested by reviewer',
  resubmitted: 'Resubmitted by licensee',
  admin_edit: 'Admin edit',
};

function fmt(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
}

function flatten(snapshot: Record<string, Record<string, any>>): Record<string, { formId: string; value: any }> {
  const out: Record<string, { formId: string; value: any }> = {};
  Object.entries(snapshot || {}).forEach(([formId, fields]) => {
    Object.entries(fields || {}).forEach(([fieldName, value]) => {
      out[`${formId}::${fieldName}`] = { formId, value };
    });
  });
  return out;
}

export function ReturnRevisionCompareDialog({ open, onOpenChange, revisions, currentValues, returnLabel }: Props) {
  const options = useMemo(() => {
    const opts: { id: string; label: string; data: Record<string, Record<string, any>> }[] = revisions.map(r => ({
      id: r.id,
      label: `v${r.revision_number} — ${REASON_LABEL[r.snapshot_reason] || r.snapshot_reason} (${formatDateTime(r.created_at)})`,
      data: r.snapshot || {},
    }));
    if (currentValues) {
      opts.push({ id: '__current__', label: 'Current (live) data', data: currentValues });
    }
    return opts;
  }, [revisions, currentValues]);

  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [onlyDiffs, setOnlyDiffs] = useState(true);

  useEffect(() => {
    if (!open || options.length < 2) return;
    if (!leftId) setLeftId(options[options.length - 2].id);
    if (!rightId) setRightId(options[options.length - 1].id);
  }, [open, options, leftId, rightId]);

  const left = options.find(o => o.id === leftId);
  const right = options.find(o => o.id === rightId);

  const diffs = useMemo(() => {
    if (!left || !right) return [];
    const l = flatten(left.data);
    const r = flatten(right.data);
    const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
    return Array.from(keys).map(k => {
      const [formId, fieldName] = k.split('::');
      const lv = fmt(l[k]?.value);
      const rv = fmt(r[k]?.value);
      return { key: k, formId, fieldName, leftValue: lv, rightValue: rv, changed: lv !== rv };
    }).sort((a, b) => a.formId.localeCompare(b.formId) || a.fieldName.localeCompare(b.fieldName));
  }, [left, right]);

  const filtered = onlyDiffs ? diffs.filter(d => d.changed) : diffs;
  const changedCount = diffs.filter(d => d.changed).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5" /> Compare Return Revisions{returnLabel ? ` — ${returnLabel}` : ''}
          </DialogTitle>
          <DialogDescription>Field-level differences between any two revisions or the current live data.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Base (Left)</label>
            <Select value={leftId} onValueChange={setLeftId}>
              <SelectTrigger><SelectValue placeholder="Select revision" /></SelectTrigger>
              <SelectContent>
                {options.filter(o => o.id !== rightId).map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Compare (Right)</label>
            <Select value={rightId} onValueChange={setRightId}>
              <SelectTrigger><SelectValue placeholder="Select revision" /></SelectTrigger>
              <SelectContent>
                {options.filter(o => o.id !== leftId).map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {left && right && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{diffs.length} fields</Badge>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">{changedCount} changed</Badge>
              <div className="flex-1" />
              <Button size="sm" variant={onlyDiffs ? 'default' : 'outline'} onClick={() => setOnlyDiffs(v => !v)}>
                {onlyDiffs ? 'Showing differences only' : 'Showing all fields'}
              </Button>
            </div>

            <ScrollArea className="max-h-[58vh] pr-2">
              <div className="space-y-2">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No differences.</p>
                ) : filtered.map(d => (
                  <Card key={d.key} className="p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{d.fieldName}</code>
                      {d.changed && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700">changed</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="border rounded p-2 bg-muted/30">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Base</p>
                        <p className="break-words whitespace-pre-wrap tabular-nums">{d.leftValue}</p>
                      </div>
                      <div className={`border rounded p-2 ${d.changed ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-300' : 'bg-muted/30'}`}>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Compare</p>
                        <p className="break-words whitespace-pre-wrap tabular-nums">{d.rightValue}</p>
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
