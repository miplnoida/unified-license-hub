import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isApplicationEditable } from '@/lib/applicationStatus';

const source = readFileSync('src/pages/NewApplication.tsx', 'utf8');

describe('NewApplication — closed application must not bind the wizard', () => {
  it('treats withdrawn / decided applications as non-editable', () => {
    for (const status of ['withdrawn', 'rejected', 'approved', 'cancelled', 'submitted']) {
      expect(isApplicationEditable(status)).toBe(false);
    }
    for (const status of ['draft', 'in_progress', 'query_raised', 'info_requested']) {
      expect(isApplicationEditable(status)).toBe(true);
    }
  });

  it('guards draft hydration with isApplicationEditable and drops the draft/step params', () => {
    expect(source).toContain("if (draft && !isApplicationEditable((draft as any).status))");
    expect(source).toContain("params.delete('draft')");
    expect(source).toContain("params.delete('step')");
    // The closed record must never be adopted as the wizard's application id.
    const guardIndex = source.indexOf('!isApplicationEditable((draft as any).status)');
    const adoptIndex = source.indexOf('setApplicationId((draft as any).id)');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(adoptIndex).toBeGreaterThan(guardIndex);
  });

  it('shows a start-a-new-request notice instead of a dead form', () => {
    expect(source).toContain('closedApplicationNotice');
    expect(source).toContain('can no longer be edited');
  });

  it('never surfaces the raw APPLICATION_NOT_EDITABLE code to the applicant', () => {
    expect(source).toContain('friendlyApplicationError');
    expect(source).not.toContain("toast.error(error?.message || 'Failed to save draft')");
    expect(source).not.toContain("toast.error(error?.message || 'Failed to save form')");
  });

  it('revalidates a stale payment-page session before invoking final submission', () => {
    const handlerStart = source.indexOf('const handleFinalSubmit = async');
    const invokeIndex = source.indexOf("supabase.functions.invoke('verify-and-submit'", handlerStart);
    const statusCheckIndex = source.indexOf(".select('id, application_number, status')", handlerStart);
    const staleGuardIndex = source.indexOf('!isApplicationEditable(currentApplication.status)', handlerStart);
    const detachIndex = source.indexOf('setApplicationId(null)', staleGuardIndex);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(statusCheckIndex).toBeGreaterThan(handlerStart);
    expect(staleGuardIndex).toBeGreaterThan(statusCheckIndex);
    expect(detachIndex).toBeGreaterThan(staleGuardIndex);
    expect(invokeIndex).toBeGreaterThan(detachIndex);
  });

  it('extracts structured function errors before showing the fallback SDK message', () => {
    expect(source).toContain('edgeFunctionErrorDetail');
    expect(source).toContain('response.clone().json()');
    expect(source).toContain("data.code ? `${data.code}: ${data.error}` : data.error");
  });
});
