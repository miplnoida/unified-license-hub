import { scanRepo } from '../src/lib/rbac/audit.ts';
const sites = scanRepo();
const total = sites.length;
const prot = sites.filter(s => s.protected).length;
console.log(`Total: ${total}, Protected: ${prot}, Pct: ${(prot/total*100).toFixed(1)}%`);
const CRIT = new Set(['Delete','Approve','Reject','Assign','Escalate','Publish','Archive','Configure','Bulk','Resubmit','Issue','Reopen','Close','Import','Export']);
const unguarded = sites.filter(s => !s.protected && CRIT.has(s.category));
console.log(`\nCritical unguarded: ${unguarded.length}`);
const byFile = {};
for (const s of unguarded) { byFile[s.file] = (byFile[s.file]||0)+1; }
const top = Object.entries(byFile).sort((a,b)=>b[1]-a[1]).slice(0,30);
for (const [f,c] of top) console.log(`  ${c}  ${f}`);
console.log('\n--- Sample entries ---');
for (const s of unguarded.slice(0,20)) console.log(`${s.category} | ${s.button} | ${s.file}:${s.line}`);
