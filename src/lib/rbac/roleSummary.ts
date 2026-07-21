/**
 * Build a plain-language "Can / Cannot" summary of a role from its
 * resolved permission set. Consumed by the Role Management UI so business
 * users never see raw permission keys.
 */

import { SENSITIVE_ACTION_NAMES, sensitiveActionLabel } from './accessLevels';
import type { PermissionLike } from './roleClassification';

export interface RoleSummary {
  can: string[];
  cannot: string[];
}

/** Humanise `application_management` → "Application Management". */
const moduleLabel = (key: string): string =>
  key.split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ');

const CAN_TEMPLATES: Record<string, (mod: string) => string> = {
  view: (m) => `View ${m}`,
  create: (m) => `Create ${m}`,
  edit: (m) => `Edit ${m}`,
  submit: (m) => `Submit ${m}`,
  review: (m) => `Review ${m}`,
  approve: (m) => `Approve ${m}`,
  reject: (m) => `Reject ${m}`,
  assign: (m) => `Assign ${m}`,
  escalate: (m) => `Escalate ${m}`,
  close: (m) => `Close ${m}`,
  reopen: (m) => `Reopen ${m}`,
  configure: (m) => `Configure ${m}`,
  import: (m) => `Import ${m}`,
  export: (m) => `Export ${m}`,
  upload_documents: (m) => `Upload documents in ${m}`,
  respond_rfi: (m) => `Respond to RFIs in ${m}`,
  add_comment: (m) => `Comment on ${m}`,
};

/** Highlight actions that are notably absent — shown in "Cannot" list. */
const HIGHLIGHT_MISSING_ACTIONS = ['delete', 'approve', 'reject', 'publish', 'manage_users', 'manage_roles', 'view_all_entities'];

export function buildRoleSummary(
  selectedPermissionIds: string[],
  allPermissions: PermissionLike[],
): RoleSummary {
  const selected = new Set(selectedPermissionIds);
  const grantedByModule = new Map<string, Set<string>>();
  const availableByModule = new Map<string, Set<string>>();

  for (const p of allPermissions) {
    const name = p.name.toLowerCase();
    if (!availableByModule.has(p.module)) availableByModule.set(p.module, new Set());
    availableByModule.get(p.module)!.add(name);
    if (selected.has(p.id)) {
      if (!grantedByModule.has(p.module)) grantedByModule.set(p.module, new Set());
      grantedByModule.get(p.module)!.add(name);
    }
  }

  const can: string[] = [];
  const cannot: string[] = [];

  for (const [module, actions] of grantedByModule) {
    const label = moduleLabel(module);
    const sortedActions = [...actions].sort();
    for (const action of sortedActions) {
      const tpl = CAN_TEMPLATES[action];
      if (tpl) {
        can.push(tpl(label));
      } else if (SENSITIVE_ACTION_NAMES.has(action)) {
        can.push(`${sensitiveActionLabel(action)} — ${label}`);
      }
    }
  }

  // Cannot list: highlight missing high-signal actions across modules.
  for (const [module, actions] of availableByModule) {
    const granted = grantedByModule.get(module) ?? new Set();
    for (const action of HIGHLIGHT_MISSING_ACTIONS) {
      if (actions.has(action) && !granted.has(action)) {
        const label = moduleLabel(module);
        const tpl = CAN_TEMPLATES[action];
        const phrase = tpl ? tpl(label) : `${sensitiveActionLabel(action)} — ${label}`;
        cannot.push(phrase);
      }
    }
  }

  // Dedupe preserving order.
  const dedupe = (xs: string[]) => Array.from(new Set(xs));
  return { can: dedupe(can), cannot: dedupe(cannot) };
}
