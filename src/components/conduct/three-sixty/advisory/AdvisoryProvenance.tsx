/**
 * MC-07.5 — Advisory provenance.
 *
 * Supervisor-facing provenance stays visible (when it was prepared, from which
 * window and snapshot, how confident, what it could not see). Provider, model
 * and prompt template detail sit behind "Technical provenance" so the normal
 * supervisory read stays clean.
 */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, Info } from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/conductFactLabels';
import { confidenceLabel } from '@/lib/conductAdvisoryLabels';
import type { AdvisoryInsight } from '@/hooks/useConductAdvisory';
import { aiServiceLabel } from '@/lib/ai/aiServiceLabel';

export function AdvisoryProvenance({ insight }: { insight: AdvisoryInsight }) {
  const limitations = (insight.limitations ?? []).filter(Boolean);

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Prepared" value={formatDateTime(insight.generated_at)} />
        <Field label="Facts window" value={`${formatDate(insight.window_start)} to ${formatDate(insight.window_end)}`} />
        <Field label="Source" value="Conduct 360 recorded facts" />
        <Field label="Confidence stated" value={confidenceLabel(insight.confidence)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What is uncertain</p>
          <p className="mt-1 text-sm">{insight.uncertainty?.trim() || 'Not stated.'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limitations</p>
          {limitations.length === 0 ? (
            <p className="mt-1 text-sm">Not stated.</p>
          ) : (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
              {limitations.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </div>
      </div>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <Info className="mr-1 h-3.5 w-3.5" />
            Technical provenance
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t pt-3">
            <Field label="Assistance provider" value={providerLabel(insight.provider)} />
            <Field label="Model" value={insight.model ?? 'Not recorded'} mono />
            <Field
              label="Instruction template"
              value={`${insight.prompt_template_code ?? 'Not recorded'}${insight.prompt_template_version ? ` (${insight.prompt_template_version})` : ''}`}
              mono
            />
            <Field label="Facts signature" value={(insight.snapshot_fingerprint ?? 'Not recorded').slice(0, 16)} mono />
            <Field label="Freshness last checked" value={insight.staleness_checked_at ? formatDateTime(insight.staleness_checked_at) : 'Not checked since preparation'} />
            <Field label="External data used" value="None — recorded regulatory facts only" />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

const providerLabel = (value?: string | null) => aiServiceLabel(value);

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  );
}
