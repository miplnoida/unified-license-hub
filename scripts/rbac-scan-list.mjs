import { scanRepo } from '../src/lib/rbac/audit.ts';
const CRIT = new Set(['Delete','Approve','Reject','Assign','Escalate','Publish','Archive','Configure','Bulk','Resubmit','Issue','Reopen','Close','Import','Export']);
const sites = scanRepo().filter(s => !s.protected && CRIT.has(s.category));
for (const s of sites) console.log(`${s.category}\t${s.file}:${s.line}\t${s.button}`);
