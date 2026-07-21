import { scanRepo } from '../src/lib/rbac/audit';
const sites = scanRepo();
const focus = new Set(['Save','Submit','Report','Print','Email','Notification','Download','Upload','Action','View','Edit','Create','Export','Import','Delete','Approve','Reject','Assign','Escalate','Publish','Archive','Configure','Bulk','Resubmit','Issue','Reopen','Close']);
const targets = process.argv.slice(2);
const gaps = sites.filter(x=>!x.protected && focus.has(x.category) && (targets.length===0 || targets.some(t=>x.file.includes(t))));
for (const g of gaps) console.log(`${g.file}:${g.line}\t${g.category}\t"${g.button}"`);
