/**
 * EPR-02 — shared enterprise case header.
 *
 * Renders the standard case header contract (reference, subject, stage, status,
 * owner/team, priority, SLA, waiting-on, next action, blockers). It contains no
 * business logic: every value is supplied by a server read model, so the same
 * component can later serve F&P, Licensing, Conduct and Enforcement cases.
 */
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Clock, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/datetime';

export type CaseSlaState = 'on_track' | 'due_soon' | 'breached' | 'paused' | string;

export interface CaseHeaderProps {
  reference: string;
  subject: string;
  subjectHref?: string | null;
  caseType?: string | null;
  stageLabel?: string | null;
  statusLabel?: string | null;
  ownerName?: string | null;
  team?: string | null;
  priority?: string | null;
  slaDueAt?: string | null;
  slaState?: CaseSlaState | null;
  waitingOn?: string | null;
  nextActionLabel?: string | null;
  blockers?: Array<{ code: string; label: string; href?: string }>;
  lastActivityAt?: string | null;
  actions?: ReactNode;
}

const SLA_CLASS: Record<string, string> = {
  breached: 'bg-destructive/10 text-destructive border-destructive/30',
  due_soon: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  on_track: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  paused: 'bg-muted text-muted-foreground',
};

const SLA_LABEL: Record<string, string> = {
  breached: 'SLA breached',
  due_soon: 'Due soon',
  on_track: 'On track',
  paused: 'SLA paused',
};

const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  medium: 'bg-muted text-muted-foreground',
  low: 'bg-muted text-muted-foreground',
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{children}</div>
    </div>
  );
}

export function CaseHeader(props: CaseHeaderProps) {
  const {
    reference, subject, subjectHref, caseType, stageLabel, statusLabel, ownerName, team,
    priority, slaDueAt, slaState, waitingOn, nextActionLabel, blockers = [], lastActivityAt, actions,
  } = props;

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{reference}</span>
              {caseType ? <Badge variant="outline" className="text-[10px]">{caseType}</Badge> : null}
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold">
              {subjectHref ? (
                <Link to={subjectHref} className="hover:underline">
                  {subject} <ArrowUpRight className="inline h-4 w-4 text-muted-foreground" />
                </Link>
              ) : subject}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {priority ? (
              <Badge variant="outline" className={PRIORITY_CLASS[priority] ?? PRIORITY_CLASS.medium}>
                {priority} priority
              </Badge>
            ) : null}
            {slaState ? (
              <Badge variant="outline" className={SLA_CLASS[slaState] ?? SLA_CLASS.paused}>
                <Clock className="mr-1 h-3 w-3" />{SLA_LABEL[slaState] ?? slaState}
                {slaDueAt ? ` · ${formatDateTime(slaDueAt)}` : ''}
              </Badge>
            ) : null}
            {actions}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t pt-3 md:grid-cols-6">
          <Field label="Stage">{stageLabel ?? '—'}</Field>
          <Field label="Status">{statusLabel ?? '—'}</Field>
          <Field label="Owner">
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3 text-muted-foreground" />{ownerName ?? 'Unassigned'}
            </span>
          </Field>
          <Field label="Team">{team ?? '—'}</Field>
          <Field label="Waiting on">{waitingOn ?? '—'}</Field>
          <Field label="Last activity">{lastActivityAt ? formatDateTime(lastActivityAt) : '—'}</Field>
        </div>

        {nextActionLabel ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Next required action: </span>
            <span className="font-medium">{nextActionLabel}</span>
          </div>
        ) : null}

        {blockers.length ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
            <div className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Before this case can progress:
            </div>
            <ul className="mt-1 space-y-0.5 pl-5">
              {blockers.map((b) => (
                <li key={`${b.code}-${b.label}`} className="list-disc text-muted-foreground">
                  {b.href ? <Link to={b.href} className="underline hover:no-underline">{b.label}</Link> : b.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
