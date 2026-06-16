import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  const storage = { upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() };
  const from = vi.fn();
  const rpc = vi.fn();
  const auth = { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) };
  (globalThis as any).__sb = { storage, from, rpc, auth };
  return {
    supabase: {
      storage: { from: () => storage },
      from: (...args: any[]) => from(...args),
      rpc: (...args: any[]) => rpc(...args),
      auth,
    },
  };
});

const sb = () => (globalThis as any).__sb as {
  storage: { upload: any; remove: any; createSignedUrl: any };
  from: any;
  rpc: any;
  auth: any;
};

import { batchUploadDocuments } from '@/lib/documentVersioning';

function makeFile(name: string, type = 'application/pdf', size = 100) {
  return new File([new Uint8Array(size)], name, { type });
}

function setupHappyPath() {
  sb().storage.upload.mockResolvedValue({ error: null });
  sb().storage.remove.mockResolvedValue({ error: null });

  // chained `.from().insert().select().single()` for both document_groups and file_uploads
  sb().from.mockImplementation((table: string) => {
    if (table === 'document_groups') {
      return {
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: 'group-1' }, error: null }) }),
        }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    if (table === 'file_uploads') {
      return {
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: 'file-1' }, error: null }) }),
        }),
      };
    }
    if (table === 'document_versions') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          }),
        }),
      };
    }
    return {} as any;
  });

  sb().rpc.mockResolvedValue({ data: [{ version_id: 'v-1', version: 1 }], error: null });
}

describe('batchUploadDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports per-file results, succeeding valid files and failing invalid ones', async () => {
    setupHappyPath();
    const good = makeFile('contract.pdf', 'application/pdf');
    const badType = makeFile('script.exe', 'application/x-msdownload');

    const results = await batchUploadDocuments({
      userId: 'u1',
      entityType: 'registration',
      entityId: 'reg-1',
      items: [
        { file: good, documentType: 'contract' },
        { file: badType, documentType: 'contract' },
      ],
    });

    expect(results).toHaveLength(2);
    const okRow = results.find(r => r.fileName === 'contract.pdf');
    const badRow = results.find(r => r.fileName === 'script.exe');
    expect(okRow?.success).toBe(true);
    expect(okRow?.version).toBe(1);
    expect(badRow?.success).toBe(false);
    expect(badRow?.error).toMatch(/not allowed|MIME/i);
  });

  it('propagates storage upload failures per file without aborting the batch', async () => {
    setupHappyPath();
    // Make the second upload fail
    let call = 0;
    sb().storage.upload.mockImplementation(async () => {
      call += 1;
      return call === 2 ? { error: { message: 'disk full' } } : { error: null };
    });

    const a = makeFile('a.pdf');
    const b = makeFile('b.pdf');
    const results = await batchUploadDocuments({
      userId: 'u1',
      entityType: 'registration',
      entityId: 'reg-1',
      items: [
        { file: a, documentType: 'contract' },
        { file: b, documentType: 'contract' },
      ],
    });

    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toContain('disk full');
  });
});
