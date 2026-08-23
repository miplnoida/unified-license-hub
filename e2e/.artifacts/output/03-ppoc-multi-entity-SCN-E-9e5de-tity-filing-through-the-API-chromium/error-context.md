# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-ppoc-multi-entity.spec.ts >> SCN-E10-02: PPOC cannot read an unrelated entity filing through the API
- Location: e2e/cert-v2/03-ppoc-multi-entity.spec.ts:29:1

# Error details

```
Error: [{"id":"cca9afa5-dcd4-4fd6-af23-da256c7e324c","filing_reference":"CV2-E01-2024-Q1"}, 
 {"id":"fc79f720-7377-48c5-a34a-59c3bb1fe1c4","filing_reference":"CV2-E01-2024-Q2"}, 
 {"id":"9cf813fd-be3a-4881-aeee-b178815f411b","filing_reference":"CV2-E01-2024-Q3"}, 
 {"id":"ea059ef0-98cc-4a3e-a979-96a7aa118759","filing_reference":"CV2-E01-2024-Q4"}, 
 {"id":"7969dd1f-9e31-4cd5-a28b-b90f781b131a","filing_reference":"CV2-E01-2025-Q1"}, 
 {"id":"8e7f0c23-c60b-4420-a5fc-32e91415a8bc","filing_reference":"CV2-E01-2025-Q2"}, 
 {"id":"be4e2131-f904-4cf7-aacf-0eeb3128850c","filing_reference":"CV2-E01-2025-Q3"}, 
 {"id":"caf83e70-e4f9-4652-a7cd-bf3e76d22a13","filing_reference":"CV2-E01-2025-Q4"}]

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { PERSONAS } from './support/personas';
  3  | import { loginAs, probeRoute } from './support/auth';
  4  | import { ENT } from './support/entities';
  5  | import { restSelect, isDenied } from './support/api';
  6  | 
  7  | /**
  8  |  * WAVE 3A / SCN-E10 — the multi-entity PPOC must see exactly the two seeded
  9  |  * entities, with the correct different capability on each, and must not reach a
  10 |  * third entity through the portal, a direct route, or the API.
  11 |  */
  12 | 
  13 | test('SCN-E10-01: PPOC server-side relationships are exactly two, with different access types', async () => {
  14 |   const r = await restSelect(
  15 |     PERSONAS.entityPpoc,
  16 |     'entity_user_access?select=entity_id,access_type,is_active&is_active=eq.true',
  17 |   );
  18 |   expect(r.status, r.bodyText).toBe(200);
  19 |   const rows = (r.body as Array<{ entity_id: string; access_type: string }>) || [];
  20 |   const own = rows.filter(x => [ENT.E10_PPOC.id, ENT.E19_GROUP_SUB.id].includes(x.entity_id));
  21 |   expect(own.map(x => `${x.entity_id}:${x.access_type}`).sort()).toEqual([
  22 |     `${ENT.E19_GROUP_SUB.id}:secondary_contact`,
  23 |     `${ENT.E10_PPOC.id}:primary_user`,
  24 |   ].sort());
  25 |   // No relationship to any third entity.
  26 |   expect(rows.filter(x => x.entity_id === ENT.E01_HEALTHY.id)).toEqual([]);
  27 | });
  28 | 
  29 | test('SCN-E10-02: PPOC cannot read an unrelated entity filing through the API', async () => {
  30 |   const r = await restSelect(
  31 |     PERSONAS.entityPpoc,
  32 |     `return_filings?select=id,filing_reference&entity_id=eq.${ENT.E01_HEALTHY.id}`,
  33 |   );
  34 |   const leaked = r.status === 200 && Array.isArray(r.body) && (r.body as unknown[]).length > 0;
> 35 |   expect(leaked || !isDenied(r) && r.status === 200 && !Array.isArray(r.body), r.bodyText).toBe(false);
     |                                                                                            ^ Error: [{"id":"cca9afa5-dcd4-4fd6-af23-da256c7e324c","filing_reference":"CV2-E01-2024-Q1"}, 
  36 | });
  37 | 
  38 | test('SCN-E10-03: PPOC direct URL to an unrelated Entity 360 is refused', async ({ page }) => {
  39 |   await loginAs(page, PERSONAS.entityPpoc);
  40 |   const r = await probeRoute(page, `/entities/${ENT.E01_HEALTHY.id}/360`);
  41 |   const blocked = r.denied || r.notFound || r.redirected;
  42 |   const showsUnrelatedEntity = r.text.includes(ENT.E01_HEALTHY.name);
  43 |   expect(
  44 |     blocked || !showsUnrelatedEntity,
  45 |     `PPOC saw unrelated entity ${ENT.E01_HEALTHY.name} at /entities/:id/360`,
  46 |   ).toBe(true);
  47 | });
  48 | 
  49 | test('SCN-E10-04: PPOC can open its own entity context', async ({ page }) => {
  50 |   await loginAs(page, PERSONAS.entityPpoc);
  51 |   const r = await probeRoute(page, '/entity/returns');
  52 |   expect(r.denied, `PPOC denied on its own external returns surface: ${r.text.slice(0, 200)}`).toBe(false);
  53 | });
  54 | 
```