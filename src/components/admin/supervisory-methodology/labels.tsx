/**
 * Supervisory methodology presentation vocabulary.
 *
 * Technical enum values are never rendered. Origin labels come from the server
 * (`supervisory_methodology_origin_label`) and are only re-derived here as a
 * defensive fallback; lifecycle status and regulator approval state are kept
 * visually distinct so a MIPL reference approval can never read as a regulator
 * approval.
 */
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const ORIGIN_FALLBACK: Record<string, string> = {
  MIPL_REFERENCE: 'MIPL Reference',
  REGULATOR_ADOPTED: 'Regulator Adopted',
  REGULATOR_AUTHORED: 'Regulator Authored',
};

export function humanize(value?: string | null): string {
  if (!value) return '—';
  return value
    .split(/[_\s]+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function OriginBadge({ origin, label }: { origin?: string | null; label?: string | null }) {
  const text = label || ORIGIN_FALLBACK[origin ?? ''] || humanize(origin);
  const tone =
    origin === 'MIPL_REFERENCE' ? 'border-primary/40 bg-primary/10 text-primary'
      : origin === 'REGULATOR_ADOPTED' ? 'border-accent/40 bg-accent/10 text-accent-foreground'
      : 'border-border bg-muted text-foreground';
  return <Badge variant="outline" className={cn('whitespace-nowrap font-medium', tone)}>{text}</Badge>;
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'border-border bg-muted text-muted-foreground',
  REVIEW: 'border-warning/40 bg-warning/10 text-warning',
  APPROVED: 'border-success/40 bg-success/10 text-success',
  ACTIVE: 'border-success/50 bg-success/15 text-success',
  SUPERSEDED: 'border-border bg-muted text-muted-foreground',
  RETIRED: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export function StatusBadge({ status }: { status?: string | null }) {
  const key = (status ?? '').toUpperCase();
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-mono text-[11px]', STATUS_TONE[key] ?? 'border-border bg-muted text-muted-foreground')}>
      {key || '—'}
    </Badge>
  );
}

/** Regulator approval state — deliberately worded, never a lifecycle status. */
export function ApprovalStateBadge({ state }: { state?: string | null }) {
  const key = (state ?? 'NOT_RECORDED').toUpperCase();
  const text = key === 'APPROVED' ? 'Regulator approved'
    : key === 'REVOKED' ? 'Regulator approval revoked'
    : 'No regulator approval recorded';
  const tone = key === 'APPROVED' ? 'border-success/40 bg-success/10 text-success'
    : key === 'REVOKED' ? 'border-destructive/30 bg-destructive/10 text-destructive'
    : 'border-border bg-muted text-muted-foreground';
  return <Badge variant="outline" className={cn('whitespace-nowrap', tone)}>{text}</Badge>;
}

const READINESS_TONE: Record<string, string> = {
  COMPLETE: 'border-success/40 bg-success/10 text-success',
  APPROVED: 'border-success/40 bg-success/10 text-success',
  YES: 'border-success/40 bg-success/10 text-success',
  CERTIFIED: 'border-success/40 bg-success/10 text-success',
  PENDING: 'border-warning/40 bg-warning/10 text-warning',
  DECISION_PENDING: 'border-warning/40 bg-warning/10 text-warning',
  APPROVED_NOT_EXECUTED: 'border-warning/40 bg-warning/10 text-warning',
  INCOMPLETE: 'border-destructive/30 bg-destructive/10 text-destructive',
  NOT_APPROVED: 'border-destructive/30 bg-destructive/10 text-destructive',
  NOT_CONFIGURED: 'border-destructive/30 bg-destructive/10 text-destructive',
  NOT_CERTIFIED: 'border-destructive/30 bg-destructive/10 text-destructive',
  NOT_DONE: 'border-border bg-muted text-muted-foreground',
  NO: 'border-destructive/30 bg-destructive/10 text-destructive',
  WITHDRAWN: 'border-border bg-muted text-muted-foreground',
  SUPERSEDED: 'border-border bg-muted text-muted-foreground',
  NOT_CURRENT: 'border-border bg-muted text-muted-foreground',
  NOT_APPLICABLE: 'border-border bg-muted text-muted-foreground',
  NO_DECISION: 'border-border bg-muted text-muted-foreground',
};

export function ReadinessStateBadge({ state }: { state?: string | null }) {
  const key = (state ?? '').toUpperCase();
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-mono text-[11px]', READINESS_TONE[key] ?? 'border-border bg-muted text-muted-foreground')}>
      {key || '—'}
    </Badge>
  );
}

export function YesNo({ value }: { value?: boolean | null }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return <span className={value ? 'text-foreground' : 'text-muted-foreground'}>{value ? 'Yes' : 'No'}</span>;
}

/** Truthful empty state. This feature never renders placeholder records. */
export function EmptyPanel({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed p-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function ErrorPanel({ error, title = 'This information could not be loaded' }: { error: unknown; title?: string }) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const denied = /Authentication required|not visible|not found|permission/i.test(message);
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
      <p className="text-sm font-medium text-destructive">{denied ? 'You are not authorised to view this record' : title}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {denied ? 'Methodology visibility follows your regulator scope and supervisory permissions.' : message}
      </p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function CountTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
