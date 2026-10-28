import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

describe('executive AI fact assembly RPC contract', () => {
  it('passes the database argument names using the caller-scoped client', async () => {
    const source = readFileSync('supabase/functions/generate-supervisory-ai-analysis/index.ts', 'utf8');
    const functionSource = source.slice(source.indexOf('async function assembleFacts('), source.indexOf('Deno.serve('));
    const js = ts.transpileModule(functionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const assemble = new Function(`${js}; return assembleFacts;`)();
    const rpc = vi.fn().mockResolvedValue({ data: { fingerprint: 'test' }, error: null });
    const serviceRpc = vi.fn();
    await assemble({ rpc: serviceRpc }, 'user', 'executive', 'executive_briefing', 'portfolio', null,
      { context: { window_days: 90, sector_id: 'sector' } }, [], { rpc });
    expect(rpc).toHaveBeenCalledWith('executive_dashboard_snapshot', { _window_days: 90, _sector_id: 'sector' });
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});