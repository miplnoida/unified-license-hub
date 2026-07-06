# 15 — Error Handling

## Error Hierarchy
```ts
class AppError extends Error { code: string; details?: unknown; correlationId?: string; }
class ValidationError extends AppError {}
class NotFoundError extends AppError {}
class PermissionDeniedError extends AppError {}
class ConflictError extends AppError {}
class RepositoryError extends AppError {}       // wraps supabase/postgres errors
class RemoteServiceError extends AppError {}    // edge function / external
class UnexpectedError extends AppError {}
```

## Boundaries
- `ErrorBoundary` at the route root (present) — logs to `platform/logger` and shows a friendly fallback.
- Per-feature ErrorBoundary permitted for isolated widgets (dashboards).
- Query errors surface via `useQuery` `error`; mutation errors via `onError` + toast.

## Edge Function Contract
- Return `{ ok: false, error: { code, message, details? } }` for expected failures (HTTP 200).
- Return non-200 only for auth failures or unhandled infra errors.
- `platform/http/invokeFn` throws typed `AppError` derived from `error.code`.

## Toasts
- Use `sonner` for transient, `Toaster` (radix) for persistent.
- `errorToToast(err)` centralises message formatting; never surface raw Postgres errors to users.

## Logging
- Every caught error logged with `logger.error(err, { context, correlationId })` unless it is a `ValidationError` shown inline.
- Silent `catch {}` is forbidden.

## Retry Policy
- Reads: retry up to 2 (already default in `App.tsx`), exponential backoff.
- Writes: retry once on network error only; never retry on validation or conflict.

## User Messaging
- Codes translated in `platform/errors/messages.ts`. No stack traces to end users.
- Include correlation ID in error toasts for support: "Error CID-abcd1234".
