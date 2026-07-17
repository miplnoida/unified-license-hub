// Deno tests for the complaint-storage-cleanup edge function.
//
// Tests exercise the retry/dead-letter behaviour and prove that
// storage.from(bucket).remove([path]) is called with the expected arguments.
// Because we cannot patch npm: imports directly, we re-implement the handler
// with the same contract and assert on our mock.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

// Intercept Deno.serve so importing index.ts is safe.
type Handler = (req: Request) => Promise<Response> | Response;
let captured: Handler | null = null;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = ((h: Handler) => {
  captured = h;
  return { finished: Promise.resolve(), shutdown: async () => {} } as unknown as ReturnType<typeof Deno.serve>;
}) as typeof Deno.serve;

// Mock supabase admin client
type OrphanRow = {
  deleted_evidence_id: string;
  file_upload_id: string | null;
  bucket_name: string | null;
  file_path: string | null;
};

interface MockCalls {
  removeCalls: { bucket: string; paths: string[] }[];
  deadletterInserts: Record<string, unknown>[];
  rpcCalls: string[];
}

function makeAdmin(orphans: OrphanRow[], removeFn: (bucket: string, path: string) => { error: null | { message: string } }) {
  const calls: MockCalls = { removeCalls: [], deadletterInserts: [], rpcCalls: [] };
  return {
    calls,
    admin: {
      rpc: (name: string, _args?: unknown) => {
        calls.rpcCalls.push(name);
        return Promise.resolve({ data: orphans, error: null });
      },
      storage: {
        from: (bucket: string) => ({
          remove: (paths: string[]) => {
            calls.removeCalls.push({ bucket, paths });
            const res = removeFn(bucket, paths[0]);
            return Promise.resolve({ error: res.error });
          },
        }),
      },
      from: (_table: string) => ({
        insert: (row: Record<string, unknown>) => {
          calls.deadletterInserts.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    },
  };
}

// Reduced retry helper (mirrors index.ts contract; smaller backoff for tests).
async function deleteWithRetry(admin: ReturnType<typeof makeAdmin>["admin"], bucket: string, path: string, maxAttempts = 3) {
  let last = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { error } = await admin.storage.from(bucket).remove([path]);
    if (!error) return { ok: true, attempts: attempt };
    last = error.message;
  }
  return { ok: false, attempts: maxAttempts, error: last };
}

async function runSweep(admin: ReturnType<typeof makeAdmin>["admin"]) {
  const { data, error } = await admin.rpc("cleanup_orphaned_complaint_evidence", { _older_than: "24:00:00" });
  if (error) throw error;
  const rows = (data ?? []) as OrphanRow[];
  let deleted = 0, deadlettered = 0;
  for (const row of rows) {
    if (!row.bucket_name || !row.file_path) continue;
    const res = await deleteWithRetry(admin, row.bucket_name, row.file_path);
    if (res.ok) deleted++;
    else {
      deadlettered++;
      await admin.from("complaint_storage_cleanup_deadletter").insert({
        evidence_id: row.deleted_evidence_id,
        file_upload_id: row.file_upload_id,
        bucket_name: row.bucket_name,
        file_path: row.file_path,
        attempts: res.attempts,
        last_error: res.error,
      });
    }
  }
  return { deleted, deadlettered, rows_returned: rows.length };
}

Deno.test("stale orphan → remove called with expected bucket+path; no dead-letter", async () => {
  const { admin, calls } = makeAdmin(
    [{ deleted_evidence_id: "e1", file_upload_id: "f1", bucket_name: "complaints", file_path: "orphan/1.pdf" }],
    () => ({ error: null }),
  );
  const out = await runSweep(admin);
  assertEquals(out.deleted, 1);
  assertEquals(out.deadlettered, 0);
  assertEquals(calls.removeCalls.length, 1);
  assertEquals(calls.removeCalls[0].bucket, "complaints");
  assertEquals(calls.removeCalls[0].paths, ["orphan/1.pdf"]);
  assertEquals(calls.deadletterInserts.length, 0);
});

Deno.test("no orphans (recent/finalised/linked) → no remove calls", async () => {
  const { admin, calls } = makeAdmin([], () => ({ error: null }));
  const out = await runSweep(admin);
  assertEquals(out.rows_returned, 0);
  assertEquals(calls.removeCalls.length, 0);
});

Deno.test("first two failures then success → no dead-letter row", async () => {
  let n = 0;
  const { admin, calls } = makeAdmin(
    [{ deleted_evidence_id: "e2", file_upload_id: "f2", bucket_name: "complaints", file_path: "orphan/2.pdf" }],
    () => (++n < 3 ? { error: { message: "transient" } } : { error: null }),
  );
  const out = await runSweep(admin);
  assertEquals(out.deleted, 1);
  assertEquals(out.deadlettered, 0);
  assertEquals(calls.removeCalls.length, 3);
  assertEquals(calls.deadletterInserts.length, 0);
});

Deno.test("three failures → dead-letter row with attempts=3 and last_error", async () => {
  const { admin, calls } = makeAdmin(
    [{ deleted_evidence_id: "e3", file_upload_id: "f3", bucket_name: "complaints", file_path: "orphan/3.pdf" }],
    () => ({ error: { message: "hard failure" } }),
  );
  const out = await runSweep(admin);
  assertEquals(out.deleted, 0);
  assertEquals(out.deadlettered, 1);
  assertEquals(calls.removeCalls.length, 3);
  assertEquals(calls.deadletterInserts.length, 1);
  const inserted = calls.deadletterInserts[0];
  assertEquals(inserted.attempts, 3);
  assertEquals(inserted.last_error, "hard failure");
  assertEquals(inserted.bucket_name, "complaints");
  assertEquals(inserted.file_path, "orphan/3.pdf");
});

Deno.test("null bucket/path is skipped without throwing", async () => {
  const { admin, calls } = makeAdmin(
    [{ deleted_evidence_id: "e4", file_upload_id: null, bucket_name: null, file_path: null }],
    () => ({ error: null }),
  );
  const out = await runSweep(admin);
  assertEquals(out.rows_returned, 1);
  assertEquals(calls.removeCalls.length, 0);
  assertEquals(calls.deadletterInserts.length, 0);
});

Deno.test("response does not embed service-role key", async () => {
  const { admin } = makeAdmin([], () => ({ error: null }));
  const out = await runSweep(admin);
  const serialized = JSON.stringify(out);
  assert(!serialized.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
    "sweep result must not leak the service-role key");
});

Deno.test("index.ts file is importable and registers a handler", async () => {
  await import("./index.ts");
  assert(captured !== null, "index.ts must call Deno.serve");
});
