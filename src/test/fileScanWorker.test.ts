import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync('supabase/functions/process-queue/index.ts', 'utf8');
const js = ts.transpileModule(source.slice(source.indexOf('async function processFileJob(')), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function worker(url: string | undefined, response: unknown) {
  return new Function('Deno', 'fetch', `${js}; return processFileJob;`)(
    { env: { get: (key: string) => key === 'FILE_SCAN_PROVIDER_URL' ? url : undefined } },
    vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(response) }),
  );
}
function client() {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  return { rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { file_path: 'test', mime_type: 'text/plain' } }) }) }) }), storage: { from: () => ({ download: async () => ({ data: new Blob(['harmless']), error: null }) }) } };
}
const job = { id: 'test', payload: { file_upload_id: 'file', operation: 'malware_scan' } };
describe('file scan worker fail-closed outcomes', () => {
  it('unavailable provider fails the job for retry without releasing a file', async () => {
    const db = client();
    await expect(worker(undefined, null)(db, job)).rejects.toThrow(/not configured/);
    expect(db.rpc).toHaveBeenCalledWith('file_upload_record_scan', expect.objectContaining({ _verdict: 'scan_error' }));
  });
  it.each([[false, 'clean'], [true, 'infected']])('records the trusted infected=%s verdict', async (infected, verdict) => {
    const db = client();
    await worker('https://scanner.test', { infected })(db, job);
    expect(db.rpc).toHaveBeenLastCalledWith('file_upload_record_scan', expect.objectContaining({ _verdict: verdict }));
  });
  it('invalid provider verdict fails for retry instead of completing', async () => {
    const db = client();
    await expect(worker('https://scanner.test', {})(db, job)).rejects.toThrow(/no valid verdict/);
  });
});