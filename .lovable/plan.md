## Goal

Clean up the "Type" column badge on `/applications/queue` so repeated taxonomy segments collapse — e.g. `Commercial Bank - Commercial Bank - Commercial Bank` → `Commercial Bank`, `Insurance - Domestic Insurance - Local` stays as-is.

## Change — `src/pages/applications/ApplicationQueue.tsx`

Add a small helper and use it when rendering the Type badge:

```ts
function formatLicenseType(raw?: string | null): string {
  if (!raw) return '—';
  const parts = raw.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  const dedup: string[] = [];
  for (const p of parts) {
    if (dedup[dedup.length - 1]?.toLowerCase() !== p.toLowerCase()) dedup.push(p);
  }
  return dedup.join(' - ');
}
```

Behavior:
- Splits on `-` with optional surrounding whitespace.
- Collapses consecutive duplicates case-insensitively (keeps first occurrence's casing).
- `Commercial Bank - Commercial Bank - Commercial Bank` → `Commercial Bank`
- `Insurance - Domestic Insurance - Local` → unchanged.
- `Cooperative - Credit Union - Credit Union` → `Cooperative - Credit Union`.
- Empty/undefined → `—`.

Replace the Type cell rendering:
```tsx
<TableCell><Badge variant="outline">{formatLicenseType(r.license_type)}</Badge></TableCell>
```

Also update the search filter so users can still match on either the raw or formatted value (both are checked). Nothing else changes — no other columns, no fetch, no permissions, no backend.

## Verification

- Open `/applications/queue`: rows previously showing `Commercial Bank - Commercial Bank - Commercial Bank` now render just `Commercial Bank`. `Insurance - Domestic Insurance - Local` and other non-duplicated types are unaffected.
- Searching "commercial bank" still matches those rows.
