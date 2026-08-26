/**
 * MC-07.5 — Flattens an advisory payload to plain narrative text for
 * side-by-side comparison in the review dialog and decision trail.
 */
import type { AdvisoryOutput } from '@/hooks/useConductAdvisory';

export function advisoryPlainText(output: AdvisoryOutput | null | undefined): string {
  if (!output) return '';
  const parts: string[] = [];
  if (output.advisory_text?.trim()) parts.push(output.advisory_text.trim());
  for (const s of output.sections ?? []) {
    const heading = s.heading?.trim();
    const body = s.body?.trim();
    if (heading || body) parts.push([heading, body].filter(Boolean).join('\n'));
  }
  for (const r of output.records ?? []) {
    if (r.reference || r.reason_to_review) {
      parts.push(`${r.reference ?? ''} — ${r.reason_to_review ?? ''}`.trim());
    }
  }
  for (const q of output.questions ?? []) {
    if (q.question?.trim()) parts.push(`Q: ${q.question.trim()}`);
  }
  for (const h of output.hypotheses ?? []) {
    if (h.hypothesis?.trim()) parts.push(`Hypothesis: ${h.hypothesis.trim()}`);
  }
  return parts.join('\n\n');
}
