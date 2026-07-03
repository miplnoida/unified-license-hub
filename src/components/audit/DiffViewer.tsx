import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';

type JsonVal = unknown;

interface Props {
  before?: JsonVal;
  after?: JsonVal;
  /** Compact single-line rendering suitable for table cells. */
  compact?: boolean;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

interface FieldDiff {
  key: string;
  kind: 'added' | 'removed' | 'changed' | 'unchanged';
  before?: unknown;
  after?: unknown;
}

function diffObjects(b: Record<string, unknown>, a: Record<string, unknown>): FieldDiff[] {
  const keys = Array.from(new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])).sort();
  return keys.map((key) => {
    const bv = b?.[key];
    const av = a?.[key];
    const bIn = key in (b ?? {});
    const aIn = key in (a ?? {});
    if (!bIn && aIn) return { key, kind: 'added', after: av };
    if (bIn && !aIn) return { key, kind: 'removed', before: bv };
    if (JSON.stringify(bv) !== JSON.stringify(av)) return { key, kind: 'changed', before: bv, after: av };
    return { key, kind: 'unchanged', before: bv, after: av };
  });
}

const KIND_CLASS: Record<FieldDiff['kind'], string> = {
  added: 'bg-success/10 border-l-2 border-success',
  removed: 'bg-destructive/10 border-l-2 border-destructive',
  changed: 'bg-warning/10 border-l-2 border-warning',
  unchanged: 'bg-muted/30 border-l-2 border-border',
};

const KIND_BADGE: Record<FieldDiff['kind'], string> = {
  added: 'bg-success/15 text-success border-success/30',
  removed: 'bg-destructive/15 text-destructive border-destructive/30',
  changed: 'bg-warning/15 text-warning border-warning/30',
  unchanged: 'bg-muted text-muted-foreground',
};

/**
 * Structured before/after diff viewer. Reads the two JSON blobs already
 * stored in `audit_logs.old_value` / `new_value` (or `rule_overrides
 * .original_value` / `.overridden_value`) and renders a per-field diff.
 * Falls back to a formatted JSON block for arrays or non-object payloads.
 */
export function DiffViewer({ before, after, compact }: Props) {
  const view = useMemo(() => {
    if (before === undefined && after === undefined) return { kind: 'empty' as const };
    if (isPlainObject(before) || isPlainObject(after)) {
      return {
        kind: 'object' as const,
        rows: diffObjects(isPlainObject(before) ? before : {}, isPlainObject(after) ? after : {}),
      };
    }
    return { kind: 'scalar' as const };
  }, [before, after]);

  if (view.kind === 'empty') {
    return <p className="text-xs text-muted-foreground">No diff recorded.</p>;
  }

  if (view.kind === 'scalar') {
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    return (
      <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} gap-2 text-sm`}>
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <div className="text-xs uppercase text-muted-foreground mb-1">Before</div>
          <pre className="text-xs whitespace-pre-wrap break-all">{fmt(before)}</pre>
        </div>
        <div className={`rounded-md border p-2 ${changed ? 'border-warning/40 bg-warning/10' : 'border-border bg-muted/30'}`}>
          <div className="text-xs uppercase text-muted-foreground mb-1">After</div>
          <pre className="text-xs whitespace-pre-wrap break-all">{fmt(after)}</pre>
        </div>
      </div>
    );
  }

  const rows = view.rows.filter((r) => (compact ? r.kind !== 'unchanged' : true));
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No field-level changes.</p>;
  }

  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.key} className={`rounded-sm px-2 py-1.5 ${KIND_CLASS[r.kind]}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono font-medium">{r.key}</span>
            <Badge variant="outline" className={`text-[10px] ${KIND_BADGE[r.kind]}`}>
              {r.kind}
            </Badge>
          </div>
          {r.kind === 'changed' && (
            <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div>
                <div className="uppercase text-[10px] text-muted-foreground">before</div>
                <pre className="whitespace-pre-wrap break-all">{fmt(r.before)}</pre>
              </div>
              <div>
                <div className="uppercase text-[10px] text-muted-foreground">after</div>
                <pre className="whitespace-pre-wrap break-all">{fmt(r.after)}</pre>
              </div>
            </div>
          )}
          {r.kind === 'added' && (
            <pre className="mt-1 text-xs whitespace-pre-wrap break-all">{fmt(r.after)}</pre>
          )}
          {r.kind === 'removed' && (
            <pre className="mt-1 text-xs whitespace-pre-wrap break-all line-through opacity-70">{fmt(r.before)}</pre>
          )}
        </div>
      ))}
    </div>
  );
}

export default DiffViewer;
