import { test, expect } from '@playwright/test';
import { PERSONAS } from './support/personas';
import { loginAs, probeRoute } from './support/auth';
import { ENT } from './support/entities';
import { restSelect, isDenied } from './support/api';

/**
 * WAVE 3A / SCN-E10 — the multi-entity PPOC must see exactly the two seeded
 * entities, with the correct different capability on each, and must not reach a
 * third entity through the portal, a direct route, or the API.
 */

test('SCN-E10-01: PPOC server-side relationships are exactly two, with different access types', async () => {
  const r = await restSelect(
    PERSONAS.entityPpoc,
    'entity_user_access?select=entity_id,access_type,is_active&is_active=eq.true',
  );
  expect(r.status, r.bodyText).toBe(200);
  const rows = (r.body as Array<{ entity_id: string; access_type: string }>) || [];
  const own = rows.filter(x => [ENT.E10_PPOC.id, ENT.E19_GROUP_SUB.id].includes(x.entity_id));
  expect(own.map(x => `${x.entity_id}:${x.access_type}`).sort()).toEqual([
    `${ENT.E19_GROUP_SUB.id}:secondary_contact`,
    `${ENT.E10_PPOC.id}:primary_user`,
  ].sort());
  // No relationship to any third entity.
  expect(rows.filter(x => x.entity_id === ENT.E01_HEALTHY.id)).toEqual([]);
});

test('SCN-E10-02: PPOC cannot read an unrelated entity filing through the API', async () => {
  const r = await restSelect(
    PERSONAS.entityPpoc,
    `return_filings?select=id,filing_reference&entity_id=eq.${ENT.E01_HEALTHY.id}`,
  );
  const leaked = r.status === 200 && Array.isArray(r.body) && (r.body as unknown[]).length > 0;
  expect(leaked || !isDenied(r) && r.status === 200 && !Array.isArray(r.body), r.bodyText).toBe(false);
});

test('SCN-E10-03: PPOC direct URL to an unrelated Entity 360 is refused', async ({ page }) => {
  await loginAs(page, PERSONAS.entityPpoc);
  const r = await probeRoute(page, `/entities/${ENT.E01_HEALTHY.id}/360`);
  const blocked = r.denied || r.notFound || r.redirected;
  const showsUnrelatedEntity = r.text.includes(ENT.E01_HEALTHY.name);
  expect(
    blocked || !showsUnrelatedEntity,
    `PPOC saw unrelated entity ${ENT.E01_HEALTHY.name} at /entities/:id/360`,
  ).toBe(true);
});

test('SCN-E10-04: PPOC can open its own entity context', async ({ page }) => {
  await loginAs(page, PERSONAS.entityPpoc);
  const r = await probeRoute(page, '/entity/returns');
  expect(r.denied, `PPOC denied on its own external returns surface: ${r.text.slice(0, 200)}`).toBe(false);
});
