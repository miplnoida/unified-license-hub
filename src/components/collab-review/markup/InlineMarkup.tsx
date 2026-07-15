import { Fragment } from 'react';
import type { ReviewComment, ReviewSuggestion } from '@/hooks/useCollabReview';
import type { ViewMode } from './ViewModeToggle';

interface Props {
  text: string;
  suggestions: ReviewSuggestion[];
  comments: ReviewComment[];
  mode: ViewMode;
  colorForAuthor: (userId: string, roleId: string | null) => string;
  commentAnchorNumbers: Map<string, number>; // comment id -> pin number
  onAnchorClick?: (commentId: string) => void;
  highlightAuthorId?: string | null;
}

type Segment =
  | { kind: 'text'; start: number; end: number }
  | { kind: 'ins'; start: number; end: number; color: string; text: string; suggestionId: string; pending: boolean; dim: boolean }
  | { kind: 'del'; start: number; end: number; color: string; suggestionId: string; pending: boolean; dim: boolean }
  | { kind: 'comment'; start: number; end: number; color: string; commentId: string; pinNumber: number; dim: boolean };

// Build a flat, ordered list of render segments over [0, text.length].
function buildSegments({
  text,
  suggestions,
  comments,
  mode,
  colorForAuthor,
  commentAnchorNumbers,
  highlightAuthorId,
}: Props): Segment[] {
  const len = text.length;
  const events: Segment[] = [];

  // Only pending suggestions render inline. Accepted/rejected are shown in the sidebar only.
  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');

  for (const s of pendingSuggestions) {
    const color = colorForAuthor(s.author_user_id, s.author_role_id);
    const dim = !!highlightAuthorId && highlightAuthorId !== s.author_user_id;
    const start = s.selection_start ?? 0;
    const end = s.selection_end ?? start;

    if (s.type === 'insert') {
      if (mode === 'original') continue;
      events.push({
        kind: 'ins',
        start,
        end: start, // zero-width anchor
        color,
        text: s.suggested_text ?? '',
        suggestionId: s.id,
        pending: true,
        dim,
      });
    } else if (s.type === 'delete') {
      if (end <= start) continue;
      if (mode === 'original') continue;
      if (mode === 'final') {
        // deletion applied: hide original range by marking as del but consumed as text elsewhere;
        // simplest: emit a del segment that renders nothing in final mode
        events.push({ kind: 'del', start, end, color, suggestionId: s.id, pending: true, dim });
      } else {
        events.push({ kind: 'del', start, end, color, suggestionId: s.id, pending: true, dim });
      }
    } else if (s.type === 'replace') {
      if (mode === 'original') continue;
      if (end > start) {
        events.push({ kind: 'del', start, end, color, suggestionId: s.id, pending: true, dim });
      }
      events.push({
        kind: 'ins',
        start: end,
        end,
        color,
        text: s.suggested_text ?? '',
        suggestionId: s.id,
        pending: true,
        dim,
      });
    }
  }

  // Comment anchors (non-blocking spans that highlight the referenced text).
  for (const c of comments) {
    if (c.parent_comment_id) continue;
    const start = c.selection_start ?? -1;
    const end = c.selection_end ?? -1;
    if (start < 0 || end <= start) continue;
    const color = colorForAuthor(c.author_user_id, c.author_role_id);
    const pin = commentAnchorNumbers.get(c.id);
    if (!pin) continue;
    const dim = !!highlightAuthorId && highlightAuthorId !== c.author_user_id;
    events.push({
      kind: 'comment',
      start: Math.max(0, Math.min(start, len)),
      end: Math.max(0, Math.min(end, len)),
      color,
      commentId: c.id,
      pinNumber: pin,
      dim,
    });
  }

  return events;
}

export function InlineMarkup(props: Props) {
  const { text, mode, onAnchorClick } = props;
  const segments = buildSegments(props);

  // Collect break-points to slice original text.
  const points = new Set<number>([0, text.length]);
  for (const s of segments) {
    points.add(Math.max(0, Math.min(s.start, text.length)));
    points.add(Math.max(0, Math.min(s.end, text.length)));
  }
  const sorted = [...points].sort((a, b) => a - b);

  const nodes: React.ReactNode[] = [];
  let keyIx = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const slice = text.slice(a, b);

    // Determine which segments overlap this range.
    const insertsAtA = segments.filter(s => s.kind === 'ins' && s.start === a) as Extract<Segment, { kind: 'ins' }>[];
    const delOver = segments.find(s => s.kind === 'del' && s.start <= a && s.end >= b) as Extract<Segment, { kind: 'del' }> | undefined;
    const commentOver = segments.find(s => s.kind === 'comment' && s.start <= a && s.end >= b && s.start < s.end) as Extract<Segment, { kind: 'comment' }> | undefined;

    // Render insertions anchored at point a first.
    for (const ins of insertsAtA) {
      if (mode === 'original') continue;
      const inline = mode === 'final';
      nodes.push(
        <ins
          key={`ins-${keyIx++}`}
          className="no-underline"
          style={{
            color: inline ? undefined : ins.color,
            borderBottom: inline ? undefined : `2px solid ${ins.color}`,
            background: inline ? undefined : `${ins.color}14`,
            opacity: ins.dim ? 0.35 : 1,
            padding: inline ? 0 : '0 2px',
            borderRadius: 2,
          }}
          title="Proposed insertion"
        >
          {ins.text}
        </ins>,
      );
    }

    if (slice.length === 0) continue;

    // Deletion in final mode → hide slice.
    if (delOver && mode === 'final') continue;

    if (delOver) {
      nodes.push(
        <del
          key={`del-${keyIx++}`}
          style={{
            color: delOver.color,
            background: `${delOver.color}14`,
            textDecorationColor: delOver.color,
            opacity: delOver.dim ? 0.35 : 1,
            padding: '0 2px',
            borderRadius: 2,
          }}
          title="Proposed deletion"
        >
          {slice}
        </del>,
      );
      continue;
    }

    if (commentOver && mode !== 'original') {
      nodes.push(
        <span
          key={`cm-${keyIx++}`}
          onClick={() => onAnchorClick?.(commentOver.commentId)}
          className="cursor-pointer rounded-sm"
          style={{
            background: `${commentOver.color}22`,
            borderBottom: `1.5px dotted ${commentOver.color}`,
            opacity: commentOver.dim ? 0.35 : 1,
            padding: '0 1px',
          }}
          title="Jump to comment"
        >
          {slice}
          <sup
            className="ml-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white align-super"
            style={{ background: commentOver.color }}
          >
            {commentOver.pinNumber}
          </sup>
        </span>,
      );
      continue;
    }

    nodes.push(<Fragment key={`t-${keyIx++}`}>{slice}</Fragment>);
  }

  return (
    <div className="min-h-[10rem] whitespace-pre-wrap rounded-md border bg-background p-3 font-mono text-sm leading-relaxed">
      {text.length === 0 ? (
        <div className="space-y-2 text-muted-foreground">
          <div className="text-sm font-sans font-medium text-foreground">No narrative yet</div>
          <div className="text-xs font-sans">
            Once this field has content, reviewer edits appear inline: insertions underlined, deletions struck through, comments highlighted with a numbered pin.
          </div>
          <div className="text-xs font-sans pt-1 opacity-70">
            Example: The applicant meets{' '}
            <ins className="no-underline" style={{ borderBottom: '2px solid #16A34A', background: '#16A34A14', padding: '0 2px', borderRadius: 2, color: '#16A34A' }}>the capital</ins>{' '}
            <del style={{ color: '#DC2626', background: '#DC262614', textDecorationColor: '#DC2626', padding: '0 2px', borderRadius: 2 }}>minimum</del>{' '}
            <span style={{ background: '#6366F122', borderBottom: '1.5px dotted #6366F1', padding: '0 1px', borderRadius: 2 }}>
              requirements
              <sup className="ml-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white align-super" style={{ background: '#6366F1' }}>1</sup>
            </span>.
          </div>
        </div>
      ) : (
        nodes
      )}
    </div>
  );
}
