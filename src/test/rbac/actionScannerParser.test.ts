/**
 * Guards the brace/quote-aware JSX opening-tag scanner used by the RBAC action
 * audit. A naive `indexOf('>')` stops inside `onClick={() => ...}` and so both
 * misses `data-rbac` markers written after the handler and mis-reads the button
 * label. Both defects produced false "unguarded action" reports before, so the
 * parser keeps explicit regression coverage.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanFile } from '@/lib/rbac/audit';

const dirs: string[] = [];

function scanSource(source: string) {
  const dir = mkdtempSync(join(tmpdir(), 'rbac-scan-'));
  dirs.push(dir);
  const file = join(dir, 'Fixture.tsx');
  writeFileSync(file, source, 'utf8');
  return scanFile(file);
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('RBAC action scanner opening-tag parser', () => {
  it('reads a marker placed after an arrow-function handler', () => {
    const [site] = scanSource(`
export function F() {
  return (
    <Button onClick={() => save({ a: 1 })} data-rbac="aml_supervision.manage_config">Save details</Button>
  );
}
`);
    expect(site.button).toBe('Save details');
    expect(site.reason).toBe('data-rbac');
    expect(site.module).toBe('aml_supervision');
    expect(site.action).toBe('manage_config');
  });

  it('still reports a button whose arrow handler carries no marker', () => {
    const [site] = scanSource(`
export function F() {
  return <Button onClick={() => remove(t)}>Remove</Button>;
}
`);
    expect(site.button).toBe('Remove');
    expect(site.reason).toBe('');
  });

  it('is not confused by comparison operators or quoted angle brackets', () => {
    const [site] = scanSource(`
export function F() {
  return (
    <Button
      title="Move item > down"
      disabled={items.length > 2 && !ready}
      onClick={() => reorder(i, i + 1)}
      data-rbac="supervisory_spine.workflow_action"
    >
      Move down
    </Button>
  );
}
`);
    expect(site.button).toBe('Move down');
    expect(site.reason).toBe('data-rbac');
    expect(site.module).toBe('supervisory_spine');
  });
});
