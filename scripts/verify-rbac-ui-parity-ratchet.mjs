#!/usr/bin/env node
// Ratchet: fail CI if UI→catalogue parity regresses beyond the tracked baseline.
// Baseline is intentionally high because the UI catalogue predates the RBAC
// hardening effort; it must never grow. See docs/rbac/completion-report.md § Phase 8.
import { execFileSync } from 'node:child_process';

const BASELINE = Number(process.env.RBAC_UI_PARITY_BASELINE ?? 306);

let out;
try {
  out = execFileSync('node', ['scripts/verify-rbac-parity.mjs', '--scope-only'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  // Scope parity itself failed — surface upstream.
  console.error(e.stdout ?? '');
  console.error(e.stderr ?? '');
  process.exit(e.status ?? 1);
}

// The scope-only mode logs JSON first, then a warn line. Extract JSON body.
const jsonEnd = out.lastIndexOf('}');
const json = JSON.parse(out.slice(0, jsonEnd + 1));
const current = Array.isArray(json.violations) ? json.violations.length : 0;

console.log(`UI parity: current=${current}, baseline=${BASELINE}`);
if (current > BASELINE) {
  console.error(`\nRBAC UI parity RATCHET FAILED — ${current} violations exceeds baseline ${BASELINE}. New UI references must point at catalogued permissions.`);
  process.exit(1);
}
if (current < BASELINE) {
  console.log(`Baseline improved by ${BASELINE - current}. Consider lowering RBAC_UI_PARITY_BASELINE to ${current} in .github/workflows/ci.yml.`);
}
