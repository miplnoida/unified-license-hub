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

function chain(value: any) {
  // Generic chainable that resolves to value at the end of any chain
  const handler: any = {
    get: (_t: any, p: string) => {
      if (p === 'then') return undefined;
      if (p === 'maybeSingle' || p === 'single') return async () => value;
      return (..._a: any[]) => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

function setupHappyPath() {
  sb().storage.upload.mockResolvedValue({ error: null });
  sb().storage.remove.mockResolvedValue({ error: null });

  sb().from.mockImplementation((table: string) => {
    if (table === 'document_groups') {
      return chain({ data: null, error: null });
    }
    if (table === 'file_uploads') {
      return {
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: 'file-1' }, error: null }) }),
        }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    if (table === 'document_versions') {
      return chain({ data: null, error: null });
    }
    return chain({ data: null, error: null });
  });

  sb().rpc.mockImplementation(async (name: string) => {
    if (name === 'create_document_version_metadata') {
      return {
        data: [{ document_upload_id: 'g-1', document_version_id: 'v-1', version_number: 1, current_version_id: 'v-1' }],
        error: null,
      };
    }
    return { data: null, error: null };
  });
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

  it('accepts DOCX and XLSX MIME types', async () => {
    setupHappyPath();
    const docx = makeFile('plan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const xlsx = makeFile('budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const results = await batchUploadDocuments({
      userId: 'u1',
      entityType: 'registration',
      entityId: 'reg-1',
      items: [
        { file: docx, documentType: 'plan' },
        { file: xlsx, documentType: 'budget' },
      ],
    });
    expect(results.every(r => r.success)).toBe(true);
  });

  it('propagates storage upload failures per file without aborting the batch', async () => {
    setupHappyPath();
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
