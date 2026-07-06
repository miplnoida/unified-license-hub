# 08 — Data Flow

## Canonical Read Path
```text
Component
  └─ useXxx()  [TanStack Query hook, feature layer]
        └─ xxxService.get(...)  [pure TS]
              └─ xxxRepository.find(...)  [Supabase adapter]
                    └─ supabase.from('...').select(...)   ← ONLY here
                          └─ Postgres (RLS applies)
```

## Canonical Write Path
```text
Component (form submit)
  └─ useXxxMutation()
        └─ xxxService.update(cmd)
              ├─ validate (zod)
              ├─ xxxRepository.persist(...)
              ├─ platform/audit.record({...})
              └─ platform/notifications.dispatch({...})   [fire-and-forget]
                    └─ Edge Function: dispatch-notification-event
```

## Cross-Feature Communication
- **Preferred**: Emit a notification event; consumers subscribe via their own event configs.
- **Not allowed**: Feature A importing from Feature B's internals. Use `features/B/index.ts` public API.

## Edge Function Invocation
```text
Component/hook
  └─ platform/http/invokeFn<Req, Res>('fn-name', body, { correlationId })
        └─ supabase.functions.invoke(...)
              └─ Deno handler
                    ├─ verify JWT
                    ├─ zod-validate request
                    ├─ service call (may bypass RLS via service role)
                    └─ return EFResult<T>
```

## Correlation ID
- Generated in UI on user action (`crypto.randomUUID()`).
- Propagated as header + body field into EF calls.
- Written into every audit row.
- Surfaced in logger context.

## Caching & Invalidation
- Query keys: `['<feature>', '<view>', ...params]`.
- Mutations invalidate the minimal necessary set.
- Realtime subscriptions optional (per feature) — via `useEffect` subscribing to `postgres_changes`.

## File & Attachment Flow
```text
UI upload → platform/storage/upload()
  → validates size/type (fileValidation.ts)
  → uploads to bucket via Supabase Storage
  → writes row into documents / file_uploads
  → audit.record('document.uploaded', ...)
```
Signed URLs generated on read (≤5 min TTL).

## Workflow Trigger Flow
```text
Submit action
  └─ start_<domain>_workflow(entity_id)  [RPC]
        └─ resolve_<domain>_workflow(entity_id)  [RPC]
              └─ selects approval_workflow_version + first step
        └─ inserts workflow_instances row
        └─ sets entity.workflow_id, current_step_id
        └─ dispatch-notification-event (step-entry notifications)
```
