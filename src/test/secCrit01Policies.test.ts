import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** SEC-CRIT-01 regression: the fact-source selector must fail closed while permitted sources load. */
describe('SEC-CRIT-01 fact source fail-closed', () => {
  const src = readFileSync('src/components/supervision/aml/AmlFactRegisterPanel.tsx', 'utf8');
  it('only opens the editable fact form once the configuration authority has loaded', () => {
    expect(src).toContain('target && authority.data ?');
  });
  it('shows a disabled, non-submittable source field while loading or on failure', () => {
    expect(src).toContain('Fail closed');
    expect(src).toContain("disabled value=\"\"");
  });
});
