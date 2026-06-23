# generate-application-ai-assessment

Advisory AI Analyst Assessment generator. Produces findings, identified risks,
and a routing recommendation for an application. Never mutates application or
workflow state — analysts retain full control via the WorkflowPanel.

## Required secrets

| Secret                       | Required | Notes |
|------------------------------|----------|-------|
| `LOVABLE_API_KEY`            | **Yes**  | Auto-provisioned by Lovable Cloud. If missing, the function marks the assessment row as `failed` with `error_message = "LOVABLE_API_KEY is not configured"` and returns HTTP 500. **Application submission is NOT affected** — `verify-and-submit` dispatches this function in the background and swallows errors. |
| `SUPABASE_URL`               | Yes      | Provided by the platform. |
| `SUPABASE_SERVICE_ROLE_KEY`  | Yes      | Provided by the platform. Used to bypass RLS for reading application data and writing assessment rows. |
| `SUPABASE_ANON_KEY`          | Yes      | Provided by the platform. Used to validate internal-staff bearer tokens for manual retries. |

If `LOVABLE_API_KEY` ever needs to be rotated, use the Lovable
`lovable_api_key--rotate_lovable_api_key` tool and redeploy.

## Reliability

`verify-and-submit` inserts a `pending` row in `application_ai_assessments`
synchronously, then dispatches this function via `EdgeRuntime.waitUntil(...)`
so the runtime keeps the background promise alive after the HTTP response is
returned. Failures (including missing `LOVABLE_API_KEY`, AI gateway 4xx/5xx,
or unparseable JSON) are recorded on the row and never block submission.

## Document loading

The function reads documents from **both** sources used by the app UI:

1. `documents` — matched by `application_id` OR `(entity_type='application', entity_id=application_id)`.
2. `file_uploads` — matched by `(entity_type='application', entity_id=application_id)`.

This mirrors `src/components/documents/DocumentList.tsx`.
