import { ExternalLink } from 'lucide-react';

export interface LabelLink {
  /** The text segment to make clickable (must appear in the label) */
  text: string;
  /** URL to open */
  url: string;
  /** Whether to open in a new tab (default: true) */
  newTab?: boolean;
}

interface RichLabelProps {
  /** Full label text */
  label: string;
  /** Optional linked segments within the label */
  links?: LabelLink[];
  /** Additional CSS classes */
  className?: string;
  /** Whether to show an external-link icon after each link */
  showLinkIcon?: boolean;
}

/**
 * Renders a label string with zero or more clickable text segments.
 * If no links are configured or the link text isn't found in the label,
 * falls back to rendering plain text — fully backward compatible.
 *
 * Usage:
 *   <RichLabel
 *     label="I agree to the Terms & Conditions"
 *     links={[{ text: "Terms & Conditions", url: "https://example.com/terms" }]}
 *   />
 */
export function RichLabel({
  label,
  links,
  className,
  showLinkIcon = true,
}: RichLabelProps) {
  if (!links || links.length === 0) {
    return <span className={className}>{label}</span>;
  }

  // Build segments by splitting label on linked text portions
  const segments = buildSegments(label, links);

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.link ? (
          <a
            key={i}
            href={seg.link.url}
            target={seg.link.newTab !== false ? '_blank' : undefined}
            rel={seg.link.newTab !== false ? 'noopener noreferrer' : undefined}
            className="text-primary hover:underline inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {seg.text}
            {showLinkIcon && <ExternalLink className="h-3 w-3 inline-block" />}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}

interface Segment {
  text: string;
  link?: LabelLink;
}

/**
 * Splits the label into plain-text and linked segments.
 * Each link is matched once, in order of occurrence.
 */
function buildSegments(label: string, links: LabelLink[]): Segment[] {
  const segments: Segment[] = [{ text: label }];

  for (const link of links) {
    if (!link.text || !link.url) continue;

    const result: Segment[] = [];
    for (const seg of segments) {
      if (seg.link) {
        // Already a linked segment — don't split further
        result.push(seg);
        continue;
      }

      const idx = seg.text.indexOf(link.text);
      if (idx === -1) {
        result.push(seg);
        continue;
      }

      if (idx > 0) {
        result.push({ text: seg.text.slice(0, idx) });
      }
      result.push({ text: link.text, link });
      const after = seg.text.slice(idx + link.text.length);
      if (after) {
        result.push({ text: after });
      }
    }

    segments.length = 0;
    segments.push(...result);
  }

  return segments;
}
