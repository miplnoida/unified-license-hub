# 14 — State Management

## Categories
| Kind | Tool | Example |
|------|------|---------|
| Server state | TanStack Query | Lists, entity detail, dashboards |
| Global session/config | React Context | Auth, SiteSettings, Regulator, PPOC, ActiveSector |
| Ephemeral UI state | `useState` / `useReducer` | Dialog open, form drafts |
| URL state | React Router query params | Filters, tab, pagination |
| Cross-tab session | Supabase auth storage | JWT |

## Rules
1. Server state **must not** be duplicated in Context — use the query cache.
2. Contexts store only values that rarely change and are needed globally. Split ephemeral vs stable values.
3. No prop drilling beyond 3 levels — introduce a hook or context.
4. Forms use React Hook Form; do not mirror form state into Context.

## Context Inventory (current)
- `AuthContext` — user, session, sign-in/out. OK.
- `SiteSettingsContext` — dynamic branding/config. OK, but consider snapshotting into `platform/config` for read-heavy access.
- `RegulatorContext` — active regulator. OK.
- `PpocContext` — PPOC mapping / actingAs. OK.
- `ActiveSectorContext` — active sector filter. Consider merging with `RegulatorContext` into a `ScopeContext`.

## Provider Composition
- Provider order documented in `App.tsx`. Any change requires ADR (dependencies matter).
- Wrap each provider only where needed (some may not need to wrap the whole app).

## Anti-patterns
- Global state for "current row selected in a table" — use local `useState`.
- Context value objects rebuilt every render — memoise with `useMemo`.
- Reading `useContext` inside deep leaves for values used once — pass a prop.
