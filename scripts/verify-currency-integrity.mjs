#!/usr/bin/env node
/**
 * Static currency guard.
 *
 * Fails when executable application code re-introduces a hardcoded currency,
 * a rupee/INR presentation, or a locale-dependent monetary formatter. Currency
 * must always come from configuration (`monetary_configs.base_currency`) or
 * from the record's own currency column, via `src/lib/money.ts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src', 'supabase/functions'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git']);
const SKIP_FILE = /(^src\/test\/|\.test\.ts$|\.spec\.ts$|src\/lib\/money\.ts$|form-builder\/FileImport\.tsx$)/;

const RULES = [
  { id: 'INR_LITERAL', re: /['"`]INR['"`]|₹/, msg: 'Indian Rupee presentation is not a configured currency' },
  { id: 'INDIA_LOCALE', re: /en-IN/, msg: 'India locale must never drive financial formatting' },
  {
    id: 'HARDCODED_CURRENCY_FORMATTER',
    re: /currency:\s*['"][A-Z]{3}['"]/,
    msg: "hardcoded currency in a formatter — use formatRecordMoney/formatBaseMoney",
  },
  {
    id: 'CURRENCY_STYLE_WITHOUT_CODE',
    re: /style:\s*['"]currency['"](?![\s\S]{0,120}currencyCode)/,
    msg: 'Intl currency formatting outside src/lib/money.ts',
  },
];

const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
}
for (const root of ROOTS) walk(root);

const violations = [];
for (const file of files) {
  const rel = relative('.', file);
  if (SKIP_FILE.test(rel)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) violations.push(`${rel}:${i + 1} [${rule.id}] ${rule.msg}\n    ${line.trim()}`);
    }
  });
}

console.log(`currency guard: scanned ${files.length} executable files`);
if (violations.length) {
  console.error(`\nFAIL — ${violations.length} currency violation(s):\n`);
  for (const v of violations) console.error(v);
  process.exit(1);
}
console.log('PASS — no hardcoded, rupee, or locale-derived currency formatting');
