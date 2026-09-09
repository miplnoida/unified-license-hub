import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * AML/CFT authority UX parity — the browser must never select, assert or
 * reconstruct the supervisory methodology. It shows the server's preview and
 * lets the server bind the version.
 */
const hook = readFileSync('src/hooks/useAmlLifecycle.ts', 'utf8');
const dialog = readFileSync('src/components/supervision/aml/AmlNewAssessmentDialog.tsx', 'utf8');

describe('methodology preview is server-derived', () => {
  it('resolves the preview through the governed entity-context operation only', () => {
    expect(hook).toContain('supervisory_methodology_resolve_for_entity');
  });

  it('does not read sector or methodology tables directly to build the preview', () => {
    const preview = hook.slice(hook.indexOf('export function useResolvedAmlMethodology'));
    expect(preview).not.toMatch(/from\('licensees'\)/);
    expect(preview).not.toMatch(/from\('supervisory_methodology'\)/);
    expect(preview).not.toContain('supervisory_methodology_resolve(');
  });

  it('carries the resolution status so ambiguity is distinguishable from nothing applying', () => {
    expect(hook).toContain("status: r?.status ?? 'NONE_APPLICABLE'");
  });
});

describe('assessment creation carries no methodology selection', () => {
  it('sends no methodology id to the creation operation', () => {
    const create = hook.slice(
      hook.indexOf('export function useCreateAmlAssessment'),
      hook.indexOf('/* ------------------------------------------------- methodology resolution'),
    );
    expect(create).toContain('supervisory_assessment_create');
    expect(create).not.toContain('_methodology_id');
  });

  it('has no methodology field on the creation input at all', () => {
    const input = hook.slice(
      hook.indexOf('export interface CreateAmlAssessmentInput'),
      hook.indexOf('export function useCreateAmlAssessment'),
    );
    expect(input).not.toMatch(/methodology/i);
  });
});

describe('the officer is never offered a version choice', () => {
  // The dialog carries no methodology identifier at all, so there is nothing a
  // version chooser could be bound to. The rendered proof that no methodology
  // or version control is offered, and that creation is blocked while the
  // server resolution is missing or ambiguous, lives in
  // src/test/amlNewAssessmentAuthority.test.tsx (behavioural, not source text).
  it('carries no methodology identifier the browser could choose from', () => {
    expect(dialog).not.toMatch(/methodology_id|methodologyId/);
  });

  it('distinguishes an ambiguous server resolution from nothing applying', () => {
    expect(dialog).toContain("resolved?.status === 'AMBIGUOUS'");
  });

  it('confirms the version the server actually bound', () => {
    expect(dialog).toContain('result?.methodology_version');
  });
});
