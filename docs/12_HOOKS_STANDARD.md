# 12 — Hooks Standard

## Naming
- `useXxx` — reactive data or state.
- `useXxxMutation` — imperative writes returning `mutateAsync`.
- `useXxxGuard` — read-only permission checks.

## Structure
```ts
export function useReturn(id: string) {
  return useQuery({
    queryKey: returnsKeys.byId(id),
    queryFn: () => returnsService.getById(id),
    staleTime: 30_000,
  });
}
```

## Rules
1. One responsibility per hook. Split composite hooks.
2. Query keys are exported from `features/<f>/queryKeys.ts`.
3. Hooks **never** call `supabase.*` directly.
4. Hooks **never** contain business branching beyond UI concerns (loading/error).
5. Return `{ data, isLoading, isError, error, refetch }` — do not rename.
6. Mutations return `{ mutate, mutateAsync, isPending }` and invalidate keys in `onSuccess`.
7. No side effects in render — subscriptions go in `useEffect` with cleanup.

## Guard Hooks
- `useLicenseeAccessGuard`, `useLicenseStatusGate` — return `{ verify() }` or booleans.
- Server-verified guards always call an RPC — never trust client context alone (as documented in `useLicenseeAccessGuard`).

## Anti-patterns
- Hooks that both read and mutate — split.
- Hooks that own dialog open state and data fetch — split.
- Hooks that accept `queryClient` as an arg — use the singleton via `useQueryClient`.

## Migration
- Existing 49 hooks audit: classify each as data/mutation/guard/legacy.
- Legacy hooks that embed supabase logic → move logic into services (per `11_SERVICE_LAYER_STRATEGY.md`); keep the hook as a thin wrapper.
