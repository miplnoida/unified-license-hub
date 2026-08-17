/**
 * Presentation surface that collects every AI analysis for a record into one
 * tab: a sticky section index plus stacked, section-by-section report blocks.
 *
 * Purely layout — each block is an existing advisory panel instance, so all
 * generation, permissions and feature-flag behaviour is unchanged.
 */
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

export interface AiReportBlock {
  /** Stable anchor id, used by the section index. */
  id: string;
  /** Short label shown in the index. */
  label: string;
  /** Optional one-line hint under the label. */
  hint?: string;
  /** The panel to render. */
  node: ReactNode;
}

interface Props {
  blocks: AiReportBlock[];
  title?: string;
  description?: string;
}

export function AiReportsTab({
  blocks,
  title = 'AI analysis reports',
  description = 'Every AI-assisted analysis available for this record, in one place. These reports interpret information the system already holds — they change no rating, finding, case or decision.',
}: Props) {
  const visible = blocks.filter((b) => !!b.node);
  if (!visible.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          AI-assisted analysis is not available for this record.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        </div>
        <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Report sections" className="hidden lg:block">
          <div className="sticky top-4 rounded-lg border bg-card p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Sections
            </div>
            <ol className="space-y-1">
              {visible.map((b, i) => (
                <li key={b.id}>
                  <a
                    href={`#${b.id}`}
                    className="block rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <span className="mr-1 tabular-nums">{i + 1}.</span>
                    {b.label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="min-w-0 space-y-5">
          {visible.map((b, i) => (
            <section key={b.id} id={b.id} className="scroll-mt-6">
              <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Section {i + 1}
                </span>
                <span className="text-sm font-medium">{b.label}</span>
                {b.hint && <span className="text-xs text-muted-foreground">— {b.hint}</span>}
              </div>
              {b.node}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
