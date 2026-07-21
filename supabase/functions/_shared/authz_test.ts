// Basic sanity tests for the shared authz helper. Runs without network
// dependencies — asserts the shape of the 401 response for missing/invalid JWT.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { requireUserPermission } from './authz.ts';

Deno.test('requireUserPermission → 401 when Authorization header missing', async () => {
  const req = new Request('http://local/test', { method: 'POST' });
  const res = await requireUserPermission(req, 'audit_management', 'export');
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.response.status, 401);
    const body = await res.response.json();
    assertEquals(body.error, 'Unauthorized');
  }
});

Deno.test('requireUserPermission → 401 when Bearer prefix missing', async () => {
  const req = new Request('http://local/test', {
    method: 'POST',
    headers: { Authorization: 'not-a-bearer-token' },
  });
  const res = await requireUserPermission(req, 'audit_management', 'export');
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.response.status, 401);
});
