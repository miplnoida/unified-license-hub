/**
 * Regenerates docs/rbac/action-audit.{md,csv}. Run:
 *   bunx tsx scripts/generate-rbac-audit.ts
 * or via npm script.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanRepo, renderMarkdown, renderCsv, summarize } from '../src/lib/rbac/audit';

const sites = scanRepo();
const outDir = join(process.cwd(), 'docs', 'rbac');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'action-audit.md'), renderMarkdown(sites), 'utf8');
writeFileSync(join(outDir, 'action-audit.csv'), renderCsv(sites), 'utf8');
const { total, protectedCount } = summarize(sites);
 
console.log(`rbac-audit: ${protectedCount}/${total} protected (${total === 0 ? 100 : ((protectedCount / total) * 100).toFixed(1)}%)`);
