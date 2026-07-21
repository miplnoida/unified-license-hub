import { scanRepo } from '../src/lib/rbac/audit.ts';
const s = scanRepo().filter(x=>!x.protected);
for (const u of s) console.log(`${u.category}\t${u.file}:${u.line}\t"${u.button}"`);
