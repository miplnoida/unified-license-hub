/**
 * Presentation-only building blocks for AI analysis reports.
 *
 * These components render *already generated* advisory content in a report-like
 * layout. They hold no data-fetching, no mutation and no business logic — the
 * panels that use them keep every hook, flag and guard they had before.
 */
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { humanizeTimestamps } from '@/lib/datetime';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertTriangle,
  ChevronDown,
  CircleDot,
  Clock,
  FileSearch,
  Info,
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ tones */

type Tone = 'neutral' | 'primary' | 'warning' | 'positive' | 'danger' | 'info';

const TONE_RAIL: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/30',
  primary: 'bg-primary/60',
  warning: 'bg-warning/70',
  positive: 'bg-success/70',
  danger: 'bg-destructive/70',
  info: 'bg-primary/40',
};

const TONE_ICON: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  primary: 'text-primary',
  warning: 'text-warning',
  positive: 'text-success',
  danger: 'text-destructive',
  info: 'text-primary',
};

const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning/15 text-warning',
  positive: 'bg-success/15 text-success',
  danger: 'bg-destructive/15 text-destructive',
  info: 'bg-primary/10 text-primary',
};

/** Section styling by payload key — shared by both advisory panels. */
export const SECTION_STYLE: Record<string, { tone: Tone; icon: typeof CircleDot }> = {
  key_observations: { tone: 'primary', icon: FileSearch },
  deteriorating_indicators: { tone: 'danger', icon: TrendingDown },
  improving_indicators: { tone: 'positive', icon: TrendingUp },
  peer_observations: { tone: 'info', icon: Users },
  emerging_risks: { tone: 'warning', icon: AlertTriangle },
  chronology: { tone: 'info', icon: Clock },
  issues: { tone: 'warning', icon: AlertTriangle },
  risks: { tone: 'danger', icon: AlertTriangle },
  gaps: { tone: 'neutral', icon: Info },
};

export function sectionStyle(key: string) {
  return SECTION_STYLE[key] ?? { tone: 'neutral' as Tone, icon: CircleDot };
}

/* ------------------------------------------------------------------ shell */

interface ShellProps {
  title: string;
  description?: ReactNode;
  /** Right-hand action area (generate / refresh buttons). */
  actions?: ReactNode;
  /** Small chips under the title (confidence, produced at, period). */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Report frame: tinted header strip, title block, action rail, body. */
export function AiReportShell({ title, description, actions, meta, children, className }: ShellProps) {
  return (
    <Card className={cn('overflow-hidden border-primary/25', className)}>
      <div className="border-b border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-sm font-semibold tracking-tight sm:text-base">{title}</h3>
              <Badge variant="outline" className="border-primary/40 text-[10px] uppercase tracking-wide text-primary">
                Advisory
              </Badge>
            </div>
            {description && (
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p>
            )}
            {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
          </div>
          {actions && <div className="flex flex-col items-end gap-1">{actions}</div>}
        </div>
      </div>
      <CardContent className="space-y-5 pt-4">{children}</CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- summary */

export function AiReportSummary({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-4">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-primary">Summary</div>
      <p className="text-sm leading-relaxed text-foreground">{humanizeTimestamps(text)}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- section */

interface SectionProps {
  index?: number;
  label: string;
  sectionKey?: string;
  count?: number;
  children: ReactNode;
}

export function AiReportSection({ index, label, sectionKey = 'neutral', count, children }: SectionProps) {
  const { tone, icon: Icon } = sectionStyle(sectionKey);
  return (
    <section className="relative pl-4">
      <span className={cn('absolute left-0 top-1 h-[calc(100%-0.5rem)] w-1 rounded-full', TONE_RAIL[tone])} />
      <div className="mb-2 flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', TONE_ICON[tone])} />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {typeof index === 'number' ? `${index}. ` : ''}
          {label}
        </h4>
        {typeof count === 'number' && count > 0 && (
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', TONE_CHIP[tone])}>{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------ observation */

export interface ReportObservation {
  text: string;
  evidence?: string[];
}

export function AiReportObservations({
  items,
  sectionKey = 'neutral',
}: {
  items: ReportObservation[];
  sectionKey?: string;
}) {
  const { tone } = sectionStyle(sectionKey);
  return (
    <ul className="space-y-2">
      {items.map((o, i) => (
        <li
          key={i}
          className="rounded-md border bg-card/60 p-3 transition-colors hover:border-primary/30 hover:bg-accent/30"
        >
          <div className="flex items-start gap-2.5">
            <CircleDot className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', TONE_ICON[tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed">{humanizeTimestamps(o.text)}</p>
              {!!o.evidence?.length && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {o.evidence.slice(0, 6).map((e, j) => (
                    <span
                      key={j}
                      className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      title={e}
                    >
                      {humanizeTimestamps(e)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------- focus areas */

export function AiReportFocusAreas({
  items,
  label,
  note,
}: {
  items: string[];
  label: string;
  note?: string;
}) {
  return (
    <AiReportSection label={label} sectionKey="key_observations" count={items.length}>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((s, i) => (
          <div key={i} className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/[0.04] p-3">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-sm leading-relaxed">{s}</span>
          </div>
        ))}
      </div>
      {note && <p className="mt-2 text-[11px] text-muted-foreground">{note}</p>}
    </AiReportSection>
  );
}

/* ------------------------------------------------------------ notices */

export function AiReportNotice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning';
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border p-3 text-xs',
        tone === 'warning'
          ? 'border-warning/40 bg-warning/10 text-foreground'
          : 'border-border bg-muted/40 text-muted-foreground',
      )}
    >
      {tone === 'warning' ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      ) : (
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function AiReportLimitations({ items }: { items: string[] }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/40">
        <Info className="h-3.5 w-3.5" />
        What this analysis could not establish
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {items.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* --------------------------------------------------------------- states */

export function AiReportSkeleton({ message = 'Checking for a previous analysis…' }: { message?: string }) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {message}
      </p>
      <div className="space-y-2">
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function AiReportEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-4 w-4" />
      </span>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- meta */

export function AiReportMetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-border">
      {children}
    </span>
  );
}

export function AiReportFooter({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      {right}
    </div>
  );
}
