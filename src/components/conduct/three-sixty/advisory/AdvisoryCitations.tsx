/**
 * MC-07.5 — Citation drill-down.
 *
 * A citation is only ever a pointer back to a record that already exists in the
 * register. Where the server supplied a link, it is clickable; where it did not,
 * the reference is shown as plain text. No advisory-only evidence is created.
 */
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { citationSectionLabel, referenceTypeLabel } from '@/lib/conductAdvisoryLabels';
import type { AdvisoryCitation } from '@/hooks/useConductAdvisory';

export function CitationChip({ citation }: { citation: AdvisoryCitation }) {
  const reference = String(citation.reference ?? '').trim();
  if (!reference) return null;
  const title = `${referenceTypeLabel(reference, citation.section)} · ${citationSectionLabel(citation.section)}`;

  if (typeof citation.href === 'string' && citation.href) {
    return (
      <Link
        to={citation.href}
        title={`Open ${title}`}
        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:underline"
      >
        {reference}
        <ExternalLink className="h-3 w-3" />
      </Link>
    );
  }
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
    >
      {reference}
    </span>
  );
}

/** Renders the references cited by one advisory statement. */
export function CitationList({
  references,
  citations,
  emptyMessage = 'No records cited for this statement.',
}: {
  references?: string[];
  citations: AdvisoryCitation[];
  emptyMessage?: string;
}) {
  const wanted = (references ?? []).map((r) => String(r).trim()).filter(Boolean);
  const resolved = wanted.map(
    (ref) => citations.find((c) => String(c.reference ?? '') === ref) ?? { reference: ref, section: null, href: null },
  );

  if (resolved.length === 0) {
    return <p className="text-[11px] text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Cites</span>
      {resolved.map((c, i) => (
        <CitationChip key={`${c.reference}-${i}`} citation={c} />
      ))}
    </div>
  );
}
