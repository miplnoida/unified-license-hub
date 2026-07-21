import { scanRepo, summarize } from '../src/lib/rbac/audit.ts';
const sites = scanRepo();
const { total, protectedCount, byCategory } = summarize(sites);
console.log(`Total: ${protectedCount}/${total} = ${(protectedCount/total*100).toFixed(1)}%`);
for (const [k,v] of [...byCategory.entries()].sort((a,b)=>b[1].total-a[1].total))
  console.log(`${k}: ${v.protected}/${v.total} = ${(v.protected/v.total*100).toFixed(0)}%`);
const gaps = sites.filter(s => !s.protected);
console.log('\nUnprotected Save/Submit:');
for (const g of gaps.filter(x=>['Save','Submit'].includes(x.category))) console.log(`  [${g.category}] ${g.file}:${g.line} "${g.button}"`);
