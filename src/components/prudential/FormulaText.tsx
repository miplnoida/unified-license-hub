import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FORMULA_TOKEN_RE, type FormulaLabelMap } from '@/hooks/useFormulaLabels';
import { cn } from '@/lib/utils';

interface FormulaTextProps {
  /** Raw stored formula / expression, e.g. "<uuid>.line_1_col_1 / <uuid>.line_3_col_1" */
  formula?: string | null;
  /** Token -> { form, field } map from useFormulaLabels */
  labels?: FormulaLabelMap;
  /** Optional ratio_key -> label map so `$other_ratio` references read nicely */
  ratioLabels?: Map<string, string>;
  className?: string;
  /** Render as a single line with truncation (table cells) */
  inline?: boolean;
}

interface Piece {
  text: string;
  kind: 'plain' | 'field' | 'ratio' | 'unresolved';
}

export function humanizeFormula(
  formula: string,
  labels?: FormulaLabelMap,
  ratioLabels?: Map<string, string>,
): Piece[] {
  const pieces: Piece[] = [];
  let cursor = 0;

  // Combined pass: field tokens and $ratio references.
  const re = new RegExp(`${FORMULA_TOKEN_RE.source}|\\$([A-Za-z0-9_-]+)`, 'gi');
  for (const m of formula.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > cursor) pieces.push({ text: formula.slice(cursor, start), kind: 'plain' });

    if (m[1] && m[2]) {
      const key = `${m[1].toLowerCase()}.${m[2]}`;
      const hit = labels?.get(key);
      if (hit) pieces.push({ text: `${hit.form} › ${hit.field}`, kind: 'field' });
      else pieces.push({ text: 'Unknown field', kind: 'unresolved' });
    } else if (m[3]) {
      const label = ratioLabels?.get(m[3]);
      pieces.push({ text: label ?? m[3].replace(/[_-]+/g, ' '), kind: label ? 'ratio' : 'unresolved' });
    }
    cursor = start + m[0].length;
  }
  if (cursor < formula.length) pieces.push({ text: formula.slice(cursor), kind: 'plain' });
  return pieces;
}

export function FormulaText({ formula, labels, ratioLabels, className, inline }: FormulaTextProps) {
  if (!formula) return <span className="text-muted-foreground">—</span>;

  const pieces = humanizeFormula(formula, labels, ratioLabels);
  const readable = pieces.map((p) => p.text).join('');
  const hasTokens = pieces.some((p) => p.kind !== 'plain');

  const body = (
    <span className={cn('text-xs', inline && 'block max-w-[340px] truncate', className)}>
      {pieces.map((p, i) =>
        p.kind === 'plain' ? (
          <span key={i} className="text-muted-foreground">{p.text}</span>
        ) : p.kind === 'unresolved' ? (
          <span key={i} className="text-destructive" title="The referenced form field no longer exists">
            {p.text}
          </span>
        ) : (
          <span key={i} className="font-medium text-foreground">{p.text}</span>
        ),
      )}
    </span>
  );

  // Plain arithmetic with no field references: show as-is, no tooltip needed.
  if (!hasTokens) {
    return <code className={cn('text-xs bg-muted px-2 py-1 rounded', inline && 'block max-w-[340px] truncate')}>{formula}</code>;
  }

  // Only truncated (inline) cells need a tooltip, and it shows the readable text.
  if (!inline) return body;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{body}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[420px]">
          <p className="text-xs break-words">{readable}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

