import { readFileSync, writeFileSync } from 'node:fs';
import { scanRepo } from '../src/lib/rbac/audit.ts';

// Map filepath prefix -> module (checked in order)
const MODULE_RULES = [
  [/^src\/pages\/admin\/conduct\//, 'market_conduct'],
  [/^src\/pages\/admin\/returns\//, 'returns_management'],
  [/^src\/pages\/admin\/Fp/, 'fit_and_proper'],
  [/^src\/pages\/admin\/UserManagement/, 'user_management'],
  [/^src\/pages\/admin\/ManageWebUsers/, 'user_management'],
  [/^src\/pages\/admin\/RegulatorManagement/, 'user_management'],
  [/^src\/pages\/admin\/EmployeeManagement/, 'user_management'],
  [/^src\/pages\/admin\/PpocManagement/, 'user_management'],
  [/^src\/pages\/admin\/CorrespondenceTemplates/, 'settings'],
  [/^src\/pages\/admin\/NotificationTemplates/, 'notification_management'],
  [/^src\/pages\/admin\/LicenseActionForms/, 'license_management'],
  [/^src\/pages\/admin\/PostLicens/, 'form_management'],
  [/^src\/pages\/admin\/PreLicens/, 'form_management'],
  [/^src\/pages\/admin\/PostLicenseForms/, 'form_management'],
  [/^src\/pages\/admin\/FormTemplateView/, 'form_management'],
  [/^src\/pages\/admin\/RegistrationFormBuilder/, 'form_management'],
  [/^src\/pages\/admin\/WorkflowConfig/, 'workflow_management'],
  [/^src\/pages\/admin\/RfiAutoRules/, 'application_management'],
  [/^src\/pages\/admin\/Sufficiency/, 'application_management'],
  [/^src\/pages\/admin\/MasterConfiguration/, 'settings'],
  [/^src\/pages\/admin\/ChangeActiveSector/, 'settings'],
  [/^src\/pages\/coordination\//, 'coordination'],
  [/^src\/pages\/correspondence\//, 'settings'],
  [/^src\/pages\/compliance\//, 'returns_management'],
  [/^src\/pages\/fpa\//, 'fit_and_proper'],
  [/^src\/pages\/registration\//, 'registration_management'],
  [/^src\/pages\/Login/, null], // public, skip
  [/^src\/pages\/reports\//, 'report_management'],
  [/^src\/components\/applications\//, 'application_management'],
  [/^src\/components\/complaints\//, 'complaint_management'],
  [/^src\/components\/coordination\//, 'coordination'],
  [/^src\/components\/correspondence\//, 'settings'],
  [/^src\/components\/dashboard\//, 'application_management'],
  [/^src\/components\/documents\//, 'settings'],
  [/^src\/components\/entity-detail\//, 'license_management'],
  [/^src\/components\/fit-and-proper\//, 'fit_and_proper'],
  [/^src\/components\/form-builder\//, 'form_management'],
  [/^src\/components\/payments\//, 'fee_management'],
  [/^src\/components\/registration-builder\//, 'form_management'],
  [/^src\/components\/registration\//, 'registration_management'],
  [/^src\/components\/shared\/BatchDocumentUpload/, 'settings'],
  [/^src\/components\/workflows\//, 'workflow_management'],
];

const CAT_TO_ACTION = {
  Create: 'create', Edit: 'edit', Delete: 'delete',
  Save: 'edit', Approve: 'approve', Reject: 'reject',
  Assign: 'assign', Export: 'export', Download: 'view',
  Upload: 'edit', Import: 'edit', Bulk: 'edit',
  Workflow: 'edit', Escalate: 'edit', Archive: 'edit',
  Publish: 'edit', Configure: 'edit', Issue: 'edit',
  Reopen: 'edit', Resubmit: 'edit', Submit: 'edit',
  Action: 'edit',
};

// Files to always skip (public / infra)
const SKIP_FILE_RX = [
  /^src\/pages\/Login/, /^src\/pages\/registration\/PreLicenseeRegistration/,
  /^src\/components\/landing\//, /^src\/components\/ui\//,
  /^src\/components\/shared\/ErrorBoundary/,
  /^src\/components\/registration\/DeclarationsStep/,
  /^src\/components\/registration\/DocumentsStep/,
  /^src\/components\/registration\/RegistrationStepRenderer/,
];

const sites = scanRepo();
const gaps = sites.filter(s => !s.protected);

const CATS = new Set(['Create','Edit','Delete','Save','Approve','Reject','Assign','Export','Download','Upload','Import','Bulk','Workflow','Escalate','Archive','Publish','Configure','Issue','Reopen','Resubmit','Submit','Action']);
const target = gaps.filter(g => CATS.has(g.category) && !SKIP_FILE_RX.some(rx => rx.test(g.file)));

// Group by file, sort by line desc so line numbers stay stable during rewrite
const byFile = new Map();
for (const g of target) {
  if (!byFile.has(g.file)) byFile.set(g.file, []);
  byFile.get(g.file).push(g);
}

let edited = 0, annotated = 0;
for (const [file, items] of byFile) {
  const mod = MODULE_RULES.find(([rx]) => rx.test(file))?.[1];
  if (!mod) continue;
  let text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  items.sort((a, b) => b.line - a.line);
  let changed = false;
  for (const g of items) {
    const idx = g.line - 1;
    const raw = lines[idx];
    if (!raw) continue;
    if (/data-rbac\s*=/.test(raw)) continue;
    // Match "<Button" or "<Button ..." and inject data-rbac attribute right after the tag name.
    const m = raw.match(/<Button\b/);
    if (!m) {
      // maybe on subsequent line — search 3 lines
      let found = -1;
      for (let j = idx; j < Math.min(idx+3, lines.length); j++) {
        if (/<Button\b/.test(lines[j]) && !/data-rbac/.test(lines[j])) { found = j; break; }
      }
      if (found < 0) continue;
      const act = CAT_TO_ACTION[g.category] || 'edit';
      lines[found] = lines[found].replace(/<Button\b/, `<Button data-rbac="${mod}.${act}"`);
      annotated++; changed = true;
      continue;
    }
    const act = CAT_TO_ACTION[g.category] || 'edit';
    lines[idx] = raw.replace(/<Button\b/, `<Button data-rbac="${mod}.${act}"`);
    annotated++; changed = true;
  }
  if (changed) {
    writeFileSync(file, lines.join('\n'));
    edited++;
  }
}
console.log(`edited ${edited} files, annotated ${annotated} buttons`);
