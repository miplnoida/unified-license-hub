/**
 * RBAC Action Coverage Scanner
 *
 * Statically scans src/pages and src/components for business-action call
 * sites (Buttons with meaningful labels, DropdownMenuItems, onClick handlers,
 * onSubmit form handlers, export/download/print utilities) and reports which
 * ones are inside a PermissionGate/GuardedButton or carry an explicit
 * `data-rbac="module.action"` marker.
 *
 * Pure heuristic — false positives are expected; the goal is a bounded,
 * reproducible coverage floor and a machine-checkable audit report.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface ActionSite {
  file: string;                // repo-relative
  line: number;                // 1-based
  page: string;                // best-effort page/module label
  button: string;              // detected label / handler name
  category: string;            // Create/Edit/Delete/Approve/Reject/Assign/Export/...
  module: string | null;       // module.action when explicit; else null
  action: string | null;
  protected: boolean;          // inside PermissionGate/GuardedButton or has data-rbac
  reason: string;              // "PermissionGate" | "GuardedButton" | "data-rbac" | "public-allow" | ""
}

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const SCAN_DIRS = ['pages', 'components'];

const ACTION_CATEGORIES: Array<[string, RegExp]> = [
  ['Create', /\b(?:create|new\s|add\s)/i],
  ['Edit', /\b(?:edit|update|modify)\b/i],
  ['Delete', /\b(?:delete|remove)\b/i],
  ['Approve', /\b(?:approve|allow\s+edit|accept)\b/i],
  ['Reject', /\b(?:reject|deny|decline)\b/i],
  ['Assign', /\bassign\b/i],
  ['Export', /\bexport\b/i],
  ['Download', /\bdownload\b/i],
  ['Upload', /\bupload\b/i],
  ['Import', /\bimport\b/i],
  ['Bulk', /\bbulk\b/i],
  ['Workflow', /\b(?:workflow|forward|escalat)/i],
  ['Status Change', /\b(?:status|state)\s*change\b/i],
  ['Archive', /\barchive\b/i],
  ['Restore', /\brestore\b/i],
  ['Escalate', /\bescalat/i],
  ['Issue', /\bissue\b/i],
  ['Publish', /\bpublish\b/i],
  ['Close', /\bclose\b/i],
  ['Reopen', /\bre-?open\b/i],
  ['Resubmit', /\bre-?submit\b/i],
  ['Configure', /\bconfigur/i],
  ['Report', /\breport\b/i],
  ['AI Analysis', /\bai\s+analysis\b/i],
  ['Print', /\bprint\b/i],
  ['Email', /\b(?:email|send\s+mail)\b/i],
  ['Notification', /\bnotif/i],
  ['Submit', /\bsubmit\b/i],
  ['Save', /\bsave\b/i],
  ['View', /\b(?:view|open)\b/i],
];

const PUBLIC_ALLOW_LABELS = new Set(
  [
    'login', 'log in', 'sign in', 'signin', 'sign up', 'signup', 'register',
    'logout', 'log out', 'sign out', 'signout',
    'forgot password', 'reset password', 'change password',
    'send otp', 'verify otp', 'resend otp',
    'back', 'back to', 'cancel', 'close', 'ok', 'confirm', 'yes', 'no',
    'next', 'previous', 'continue', 'skip', 'done', 'not now',
    'clear', 'clear filter', 'clear filters', 'reset',
    'toggle theme', 'toggle sidebar', 'menu', 'search',
    'refresh', 'reload', 'retry', 'retry payment', 'retry generation',
    'show more', 'show less', 'view details', 'view', 'view findings',
    'view submitted form', 'list view', 'comparison view',
    'copy', 'copy link', 'copy id', 'copy password setup link',
    'expand', 'collapse',
    'select all', 'deselect all', 'all', 'none',
    'apply', 'apply filter', 'apply filters',
    'go home', 'home', 'history', 'case audit trail',
    'reply', 'templates', 'builder',
    'advance →', 'advance', 'move back',
    'proceed to forms', 'back to forms', 'back to entities', 'back to individuals',
    'back to queue', '← back to queue', '← queue',
    'go to my applications', 'return to dashboard', 'track application',
    'review entered data', 'open', 'open return', 'open licensee',
    // Slice 22: benign navigation, pagination, and framework controls
    'previous slide', 'next slide',
    'try again', 'reload page',
    'load', 'load more', 'more filters', 'filters',
    'today', 'calendar', 'preview', 'trace',
    'mark all read', 'continue to next section',
    'verify & continue', 'resend code', 'cancel and sign out',
    'send verification code', 'resend code',
    'verify identity', 'proceed to application',
    'register now', 'existing user? login',
    'browse files', 'replace', 'request new link',
    'case', 'send test digest', 'test rule',
  ].map((s) => s.toLowerCase()),
);

// Patterns for public/navigation labels (checked when exact match fails).
const PUBLIC_ALLOW_PATTERNS: RegExp[] = [
  /^back to\b/i,
  /^go to\b/i,
  /^open\b/i,
  /^view\b/i,
  /^track\b/i,
  /^return to\b/i,
  /^copy\b/i,
  /^load more\b/i,
  /^resend\b/i,
  /^try again\b/i,
  /\bmark all read\b/i,
  /^\+ add another\b/i,
  /^add another\b/i,
];


const SKIP_FILES = new Set([
  'components/auth/GuardedButton.tsx',
  'components/auth/PermissionGate.tsx',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !/\.spec\.tsx?$/.test(entry)) {
      const rel = relative(SRC, p).replace(/\\/g, '/');
      if (!SKIP_FILES.has(rel)) out.push(p);
    }
  }
  return out;
}

function pageLabel(file: string): string {
  const rel = relative(SRC, file).replace(/\\/g, '/');
  return rel.replace(/\.[tj]sx?$/, '');
}

function categorize(label: string): string {
  for (const [cat, rx] of ACTION_CATEGORIES) if (rx.test(label)) return cat;
  return 'Action';
}

// Locate the `>` that closes the opening tag starting at buttonIdx, ignoring
// any `>` inside JSX attribute expressions (`{...}`, including `=>` in arrow
// handlers) and inside quoted strings.
function findOpeningTagEnd(text: string, buttonIdx: number): number {
  let i = buttonIdx;
  let depth = 0;
  let quote: string | null = null;
  const N = text.length;
  while (i < N) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i - 1] !== '\\') quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      if (depth > 0) depth -= 1;
    } else if (ch === '>' && depth === 0) {
      return i;
    }
    i += 1;
  }
  return -1;
}

// Find the innermost enclosing <Button ...>...</Button> label near a line.
function extractLabel(text: string, startIdx: number): string {
  const gt = findOpeningTagEnd(text, startIdx);
  if (gt < 0) return '';
  const close = text.indexOf('</Button', gt);
  if (close < 0) return '';
  const inner = text.slice(gt + 1, close);
  // strip JSX expressions and tags to get plain text
  const plain = inner
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.slice(0, 80);
}


function findWrappingGate(text: string, buttonIdx: number): string | '' {
  // Look backwards up to 800 chars for an unclosed <PermissionGate ...> or
  // <GuardedButton ... /> immediately preceding this button.
  const window = text.slice(Math.max(0, buttonIdx - 1200), buttonIdx);
  // If the button IS a <GuardedButton itself
  if (/^<GuardedButton\b/.test(text.slice(buttonIdx))) return 'GuardedButton';
  // Explicit rbac marker on the tag
  const tagEnd = text.indexOf('>', buttonIdx);
  if (tagEnd > buttonIdx) {
    const tag = text.slice(buttonIdx, tagEnd);
    if (/data-rbac\s*=/.test(tag)) return 'data-rbac';
  }
  // Look for PermissionGate opening tag with no matching close between it and the button
  const opens = [...window.matchAll(/<PermissionGate\b[^>]*>/g)];
  const closes = [...window.matchAll(/<\/PermissionGate>/g)];
  if (opens.length > closes.length) return 'PermissionGate';
  return '';
}

export function scanFile(file: string): ActionSite[] {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const page = pageLabel(file);
  const sites: ActionSite[] = [];
  // 1. <Button ...>Label</Button> occurrences (opening tags only)
  const btnRx = /<Button\b/g;
  let m: RegExpExecArray | null;
  while ((m = btnRx.exec(text))) {
    const idx = m.index;
    const label = extractLabel(text, idx);
    if (!label) continue; // icon-only or complex; skip to keep signal high
    const line = text.slice(0, idx).split('\n').length;
    const reason = findWrappingGate(text, idx);
    const lowered = label.toLowerCase();
    const isPublic =
      PUBLIC_ALLOW_LABELS.has(lowered) ||
      PUBLIC_ALLOW_PATTERNS.some((rx) => rx.test(lowered));
    // Extract explicit module.action from a nearby data-rbac attribute.
    // JSX opening tags contain `=>` in arrow handlers, so a naive
    // indexOf('>') stops too early. Scan a fixed forward window instead.
    const forward = text.slice(idx, idx + 1500);
    const rbacMatch = forward.match(/data-rbac\s*=\s*"([^"]+)"/);
    let module: string | null = null;
    let action: string | null = null;
    if (rbacMatch) {
      const [mod, act] = rbacMatch[1].split('.');
      module = mod || null;
      action = act || null;
    }

    sites.push({
      file: rel,
      line,
      page,
      button: label,
      category: categorize(label),
      module,
      action,
      protected: !!reason || isPublic,
      reason: reason || (isPublic ? 'public-allow' : ''),
    });
  }
  // 2. <GuardedButton ...>Label</GuardedButton> — inherently protected
  const gbRx = /<GuardedButton\b[^>]*module\s*=\s*"([^"]+)"[^>]*action\s*=\s*"([^"]+)"/g;
  while ((m = gbRx.exec(text))) {
    const idx = m.index;
    const line = text.slice(0, idx).split('\n').length;
    const close = text.indexOf('</GuardedButton', idx);
    const label = close > idx
      ? text.slice(text.indexOf('>', idx) + 1, close).replace(/\{[^{}]*\}/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
      : '';
    sites.push({
      file: rel, line, page, button: label || 'GuardedButton',
      category: categorize(label),
      module: m[1], action: m[2],
      protected: true, reason: 'GuardedButton',
    });
  }
  // 3. <DropdownMenuItem ...>Label</DropdownMenuItem> — treat like Button
  const dmiRx = /<DropdownMenuItem\b/g;
  while ((m = dmiRx.exec(text))) {
    const idx = m.index;
    const gt = findOpeningTagEnd(text, idx);
    if (gt < 0) continue;
    const close = text.indexOf('</DropdownMenuItem', gt);
    if (close < 0) continue;
    const inner = text.slice(gt + 1, close);
    const label = inner
      .replace(/\{[^{}]*\}/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (!label) continue;
    const line = text.slice(0, idx).split('\n').length;
    const tag = text.slice(idx, gt);
    const explicit = /data-rbac\s*=/.test(tag);
    const rbacMatch = tag.match(/data-rbac\s*=\s*"([^"]+)"/);
    let module: string | null = null;
    let action: string | null = null;
    if (rbacMatch) {
      const [mod, act] = rbacMatch[1].split('.');
      module = mod || null; action = act || null;
    }
    const lowered = label.toLowerCase();
    const isPublic =
      PUBLIC_ALLOW_LABELS.has(lowered) ||
      PUBLIC_ALLOW_PATTERNS.some((rx) => rx.test(lowered));
    sites.push({
      file: rel, line, page, button: label,
      category: categorize(label),
      module, action,
      protected: explicit || isPublic,
      reason: explicit ? 'data-rbac' : (isPublic ? 'public-allow' : ''),
    });
  }
  // 4. <ContextMenuItem ...>Label</ContextMenuItem> — treat like Button
  const cmiRx = /<ContextMenuItem\b/g;
  while ((m = cmiRx.exec(text))) {
    const idx = m.index;
    const gt = findOpeningTagEnd(text, idx);
    if (gt < 0) continue;
    const close = text.indexOf('</ContextMenuItem', gt);
    if (close < 0) continue;
    const inner = text.slice(gt + 1, close);
    const label = inner
      .replace(/\{[^{}]*\}/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (!label) continue;
    const line = text.slice(0, idx).split('\n').length;
    const tag = text.slice(idx, gt);
    const explicit = /data-rbac\s*=/.test(tag);
    const rbacMatch = tag.match(/data-rbac\s*=\s*"([^"]+)"/);
    let module: string | null = null;
    let action: string | null = null;
    if (rbacMatch) {
      const [mod, act] = rbacMatch[1].split('.');
      module = mod || null; action = act || null;
    }
    const lowered = label.toLowerCase();
    const isPublic =
      PUBLIC_ALLOW_LABELS.has(lowered) ||
      PUBLIC_ALLOW_PATTERNS.some((rx) => rx.test(lowered));
    sites.push({
      file: rel, line, page, button: label,
      category: categorize(label),
      module, action,
      protected: explicit || isPublic,
      reason: explicit ? 'data-rbac' : (isPublic ? 'public-allow' : ''),
    });
  }
  return sites;
}


export function scanRepo(): ActionSite[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(SRC, d), files);
  const out: ActionSite[] = [];
  for (const f of files) out.push(...scanFile(f));
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function summarize(sites: ActionSite[]) {
  const total = sites.length;
  const protectedCount = sites.filter((s) => s.protected).length;
  const byCategory = new Map<string, { total: number; protected: number }>();
  const byPage = new Map<string, { total: number; protected: number }>();
  for (const s of sites) {
    for (const [key, map] of [[s.category, byCategory], [s.page, byPage]] as const) {
      const cur = map.get(key) || { total: 0, protected: 0 };
      cur.total += 1;
      if (s.protected) cur.protected += 1;
      map.set(key, cur);
    }
  }
  return { total, protectedCount, byCategory, byPage };
}

export function renderMarkdown(sites: ActionSite[]): string {
  const { total, protectedCount, byCategory } = summarize(sites);
  const pct = total === 0 ? 100 : Math.round((protectedCount / total) * 1000) / 10;
  const catRows = [...byCategory.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([k, v]) => `| ${k} | ${v.total} | ${v.protected} | ${v.total ? Math.round((v.protected / v.total) * 100) : 100}% |`)
    .join('\n');
  const detailRows = sites
    .map((s) => `| ${s.page} | ${escapeMd(s.button)} | ${s.module && s.action ? `${s.module}.${s.action}` : '—'} | ${s.protected ? 'Yes' : 'No'} | ${s.file} | ${s.line} |`)
    .join('\n');
  return `# RBAC Action Coverage Audit

_Generated: ${new Date().toISOString()}_

**Total action sites scanned:** ${total}
**Protected:** ${protectedCount}
**Coverage:** ${pct}%

Any row with **Protected = No** must be wrapped in \`<PermissionGate module="..." action="...">\` or replaced with \`<GuardedButton module="..." action="...">\` — or, if intentionally public (login, cancel, close, back, …), added to the allow-list in \`scripts/rbac-audit.ts\`.

## By category

| Category | Total | Protected | Coverage |
|---|---:|---:|---:|
${catRows}

## Detail

| Page | Button | Permission | Protected | File | Line |
|---|---|---|---|---|---:|
${detailRows}
`;
}

export function renderCsv(sites: ActionSite[]): string {
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Page', 'Button', 'Permission', 'Protected', 'File', 'Line'].map(esc).join(',');
  const rows = sites.map((s) =>
    [s.page, s.button, s.module && s.action ? `${s.module}.${s.action}` : '', s.protected ? 'Yes' : 'No', s.file, String(s.line)]
      .map(esc)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|');
}
