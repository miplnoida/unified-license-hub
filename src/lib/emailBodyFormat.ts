/**
 * Client-side mirror of the section/list/emphasis formatting applied by the
 * transactional email shell (`supabase/functions/_shared/email-layout.ts`).
 * Used by admin previews so what a reviewer sees matches what is dispatched.
 *
 * All content is HTML-escaped before any markup is added, so template copy can
 * never inject markup into the preview.
 */

const SECTION_LABELS = new Set([
  'action required', 'no action required', 'action taken', 'deadline', 'due date',
  'what happens next', 'next steps', 'reason', 'reasons', 'grounds', 'remark',
  'remarks', 'comments', 'summary', 'summary of the request', 'information required',
  'documents required', 'requirements', 'outstanding items', 'decision',
  'determination', 'outcome', 'conditions', 'payment details', 'amount payable',
  'right of review', 'right of appeal', 'review and appeal',
  'consequence of non-compliance', 'consequences of non-compliance',
  'effective date', 'period', 'reporting period', 'reference', 'details',
  'your login details', 'how to respond', 'security', 'important',
]);

const BULLET = /^\s*(?:[-*•])\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(line: string): string {
  let html = escapeHtml(line);
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 font-mono text-[12px]">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground">$1</strong>');
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  html = html.replace(
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline break-all">$1</a>',
  );
  return html;
}

function isHeadingLine(line: string, nextLine: string | undefined): boolean {
  const trimmed = line.trim();
  const raw = trimmed.replace(/:$/, '');
  if (!raw || raw.length > 64) return false;
  if (/\{\{/.test(raw)) return false;
  if (SECTION_LABELS.has(raw.toLowerCase())) return true;
  if (!nextLine) return false;
  if (trimmed.endsWith(':')) return false;
  if (BULLET.test(nextLine) || NUMBERED.test(nextLine)) return false;
  return !/[.,;!?]$/.test(raw) && raw.split(/\s+/).length <= 5;
}

/** Returns sanitised HTML for a plain-text notification body. */
export function formatEmailBodyHtml(text: string): string {
  const blocks = String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .filter((b) => b.trim().length > 0);

  const out: string[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length > 0);
    let i = 0;
    const paragraph: string[] = [];

    const flush = () => {
      if (paragraph.length) {
        out.push(`<p class="mb-3 leading-relaxed">${paragraph.join('<br/>')}</p>`);
        paragraph.length = 0;
      }
    };

    while (i < lines.length) {
      const line = lines[i];
      const bullet = BULLET.exec(line);
      const numbered = !bullet ? NUMBERED.exec(line) : null;

      if (bullet || numbered) {
        flush();
        const ordered = Boolean(numbered);
        const items: string[] = [];
        while (i < lines.length) {
          const m = ordered ? NUMBERED.exec(lines[i]) : BULLET.exec(lines[i]);
          if (!m) break;
          items.push(`<li>${renderInline(m[1])}</li>`);
          i += 1;
        }
        out.push(
          ordered
            ? `<ol class="mb-3 list-decimal pl-5 leading-relaxed">${items.join('')}</ol>`
            : `<ul class="mb-3 list-disc pl-5 leading-relaxed">${items.join('')}</ul>`,
        );
        continue;
      }

      if (paragraph.length === 0 && isHeadingLine(line, lines[i + 1])) {
        flush();
        out.push(
          `<p class="mb-1 mt-4 font-semibold text-foreground">${renderInline(line.trim().replace(/:$/, ''))}</p>`,
        );
        i += 1;
        continue;
      }

      paragraph.push(renderInline(line));
      i += 1;
    }

    flush();
  }

  return out.join('');
}
