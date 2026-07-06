# 07 — Component Guidelines

## Categories
1. **Primitives** (`src/ui/*`) — shadcn-derived, no domain logic, no data fetching.
2. **Shared** (`src/shared/*`) — composed primitives reused across features (e.g. `HistoryButton`, `RowActionsMenu`).
3. **Feature Components** (`features/<f>/components/*`) — domain-aware, consume feature hooks.
4. **Route Components** (`features/<f>/pages/*` or `src/routes` entries) — thin; compose feature components and DashboardLayout.

## Rules
- No component imports supabase directly.
- No component contains business rules (e.g. "if status == X and role == Y then …"); such logic lives in services or dedicated selectors.
- No component owns cross-feature state; use context or query cache.
- Presentational props only — no `supabase`, `session`, or `queryClient` in props.
- Every interactive control has `aria-label` or visible label.

## Styling
- Tailwind semantic tokens (per project memory: dark blue #1E3A8A, green #16A34A).
- No hardcoded colours (`text-white`, `bg-[#...]`) — use tokens from `index.css`.
- Font: Plus Jakarta Sans (UI), JetBrains Mono (data).

## Composition Patterns
- **Layout wrappers**: `DashboardLayout` (auth), `LandingNav` (public). New pages must pick exactly one.
- **Data tables**: Prefer existing table primitives; provide keyboard navigation and column sort.
- **Forms**: React Hook Form + zod resolvers; server errors mapped to field errors via `AppError.details`.
- **Dialogs**: `Dialog` for informational, `AlertDialog` for destructive — use SweetAlert2 pattern already in project for unsaved-changes flows.

## Anti-patterns
- Fetching in `useEffect` with `.then().catch()`.
- Passing full row objects deep — pass IDs and let child hooks fetch.
- Conditional hooks.
- 500-line components — split when passing 200 lines or 3 responsibilities.
