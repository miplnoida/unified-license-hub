import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('audit source coverage', () => {
  it('edge functions route audit writes through approved audit RPC helpers', () => {
    const workflow = readFileSync('supabase/functions/perform-workflow-action/index.ts', 'utf8');
    const license = readFileSync('supabase/functions/perform-license-action/index.ts', 'utf8');

    expect(workflow).not.toMatch(/\.from\(["']audit_logs["']\)\.insert/);
    expect(license).not.toMatch(/\.from\(["']audit_logs["']\)\.insert/);
    expect(workflow).toContain('logComplianceAudit');
    expect(workflow).toContain('logSecurityEvent');
    expect(license).toContain('logComplianceAudit');
    expect(license).toContain('logSecurityEvent');
  });

  it('admin compliance audit page reads the unified audit timeline', () => {
    const source = readFileSync('src/pages/admin/ComplianceAuditLogs.tsx', 'utf8');
    expect(source).toContain(".from('audit_timeline')");
    expect(source).not.toContain(".from('compliance_audit_logs' as any)");
  });
});