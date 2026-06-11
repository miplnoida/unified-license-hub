import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('return workflow runtime notification wiring', () => {
  it('fans out per-action notification bindings for return workflow actions', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/perform-return-workflow-action/index.ts'),
      'utf-8',
    );

    expect(src).toMatch(/approval_action_notifications/);
    expect(src).toMatch(/\.eq\("action_type",\s*action_type\)/);
    expect(src).toMatch(/action_notification_override:\s*true/);
  });
});