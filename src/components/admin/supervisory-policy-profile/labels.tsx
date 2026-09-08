/**
 * Supervisory Policy Profile presentation vocabulary.
 *
 * Technical enum values never reach the screen. Component readiness states are
 * rendered with their own tone so "not implemented yet" can never be mistaken
 * for "configured".
 */
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { humanize, formatDate, formatDateTime } from '@/components/admin/supervisory-methodology/labels';

export { humanize, formatDate, formatDateTime };

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'border-border bg-muted text-muted-foreground',
  REVIEW: 'border-warning/40 bg-warning/10 text-warning',
  APPROVED: 'border-success/40 bg-success/10 text-success',
  ACTIVE: 'border-success/50 bg-success/15 text-success',
  SUPERSEDED: 'border-border bg-muted text-muted-foreground',
  RETIRED: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export function ProfileStatusBadge({ status }: { status?: string | null }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', STATUS_TONE[status ?? ''] ?? 'border-border')}>
      {humanize(status)}
    </Badge>
  );
}

const ORIGIN_FALLBACK: Record<string, string> = {
  MIPL_REFERENCE: 'MIPL Reference',
  REGULATOR_ADOPTED: 'Regulator Adopted',
  REGULATOR_AUTHORED: 'Regulator Authored',
};

export function ProfileOriginBadge({ origin, label }: { origin?: string | null; label?: string | null }) {
  const text = label || ORIGIN_FALLBACK[origin ?? ''] || humanize(origin);
  const tone =
    origin === 'MIPL_REFERENCE' ? 'border-primary/40 bg-primary/10 text-primary'
      : origin === 'REGULATOR_ADOPTED' ? 'border-accent/40 bg-accent/10 text-accent-foreground'
      : 'border-border bg-muted text-foreground';
  return <Badge variant="outline" className={cn('whitespace-nowrap font-medium', tone)}>{text}</Badge>;
}

const READINESS_LABEL: Record<string, string> = {
  SATISFIED: 'Configured',
  MISSING: 'Not configured',
  UNBOUND: 'Not configured (optional)',
  INVALID: 'No longer valid',
  NOT_APPLICABLE: 'Not applicable',
  BLOCKED_NOT_IMPLEMENTED: 'Not available on the platform yet',
  AWAITING_ARCHITECTURE: 'Not available on the platform yet',
};

const READINESS_TONE: Record<string, string> = {
  SATISFIED: 'border-success/40 bg-success/10 text-success',
  MISSING: 'border-destructive/40 bg-destructive/10 text-destructive',
  UNBOUND: 'border-border bg-muted text-muted-foreground',
  INVALID: 'border-destructive/40 bg-destructive/10 text-destructive',
  NOT_APPLICABLE: 'border-border bg-muted text-muted-foreground',
  BLOCKED_NOT_IMPLEMENTED: 'border-warning/40 bg-warning/10 text-warning',
  AWAITING_ARCHITECTURE: 'border-border bg-muted text-muted-foreground',
};

export function ReadinessBadge({ state }: { state?: string | null }) {
  const key = state ?? '';
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', READINESS_TONE[key] ?? 'border-border')}>
      {READINESS_LABEL[key] ?? humanize(key)}
    </Badge>
  );
}

const REQUIREMENT_LABEL: Record<string, string> = {
  REQUIRED: 'Required',
  OPTIONAL: 'Optional',
  NOT_APPLICABLE: 'Not applicable',
};

export function RequirementBadge({ requirement }: { requirement?: string | null }) {
  return (
    <Badge variant={requirement === 'REQUIRED' ? 'secondary' : 'outline'} className="whitespace-nowrap">
      {REQUIREMENT_LABEL[requirement ?? ''] ?? humanize(requirement)}
    </Badge>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? '—'}</dd>
    </div>
  );
}

export function ErrorPanel({ error, title = 'This could not be loaded' }: { error: unknown; title?: string }) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-destructive">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{message.replace(/^ERROR:\s*/i, '')}</p>
    </div>
  );
}

export function EmptyPanel({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function errorMessage(e: unknown) {
  const m = e instanceof Error ? e.message : String(e ?? '');
  return m.replace(/^ERROR:\s*/i, '') || 'The server refused this action.';
}
