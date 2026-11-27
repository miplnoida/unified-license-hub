# Phase 1a — backend security proposals (approval only)

Read-only review of `/dev-server`; no project files, data, grants, configuration or deployments changed. All SQL issued was SELECT. This document is a proposal, not an executable patch. Diffs are illustrative; named new helpers are proposed interfaces, not existing implementations. Do not deploy until the decisions and database contracts below are approved.

## Evidence coverage and hard limitations

Read both requested review documents, inspected all six handlers, searched `src/` and `supabase/functions/` for their names, queried live scan definitions/policies, scope values, permissions, queue indexes, enums and claim functions. Supporting evidence is alongside this file: `callers.txt`, `schema.txt`, `catalogue.txt`, `functions.jsonl`, `file-policies.txt`.

**BLOCKED: complete scheduler/caller attestation.** The required `select jobname,schedule,command from cron.job` was attempted but returned `permission denied for schema cron` as `sandbox_exec`. Do not interpret `cron.txt` as an empty scheduler. An authorized DBA must supply the SELECT result (redacting any embedded credentials), including indirect helper jobs. No role changes or alternative privileged connection were attempted. A SELECT of visible function definitions containing `net.http_post` found public `notification_worker_kick(_function_name)` and extension machinery, not hardcoded direct calls to the six targets. The helper builds `/functions/v1/` plus a parameter, obtains `issue_worker_token(_function_name)`, and sends `x-worker-token`. Its possible target set cannot be established without cron jobs and indirect callers. Database visibility is limited; absence of visible definitions is not proof of absence.

Source searches establish all literal callers found, not unknown third-party clients or dynamically assembled URLs. No real external sends, AI calls, scanner calls or mutation-based tests were run. Live edge secrets are not readable from this review: local environment presence is not proof of deployed configuration. Existing unrelated worktree changes were left untouched.

## SEC-09 — document extraction: scope and authoritative malware release

**Existing code evidence — `supabase/functions/document-extract/index.ts`:**

```ts
52:   const __authzGate = await requireUserPermission(req, "application_management", "edit");
53:   if (!__authzGate.ok) return __authzGate.response;
```

```ts
79:     const { file_upload_id, preset = "generic", source_type, source_id } = await req.json();
80:     if (!file_upload_id) {
81:       return new Response(JSON.stringify({ ok: false, error: "file_upload_id required" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
82:     }
83: 
84:     const { data: file, error: fErr } = await admin
85:       .from("file_uploads")
86:       .select("id, file_name, file_path, mime_type, bucket_name")
87:       .eq("id", file_upload_id)
88:       .maybeSingle();
```

```ts
111:     // Sign a URL for the model
112:     const bucket = (file as any).bucket_name || "secure-files";
113:     const { data: signed, error: sErr } = await admin
114:       .storage.from(bucket)
115:       .createSignedUrl((file as any).file_path, 60 * 15);
```

**Root cause.** Global application edit permission is not authority over a file or its referenced source. Service-role lookup bypasses ownership and scan release; caller source metadata is persisted without binding it to the file.

**Actual lifecycle / authoritative evidence.** Live `file_uploads` has `scan_status`, `is_quarantined`, `scan_provider`, `scanned_at`, `scan_detail`, plus object path/bucket and entity reference. CHECK permits exactly `pending_scan`, `scanning`, `clean`, `suspicious`, `infected`, `scan_error`, `quarantined`, `legacy_unverified`. SELECT DISTINCT returned `(clean,false,NULL)`, `(legacy_unverified,false,NULL)`, `(pending_scan,false,NULL)`; no scan-event rows were visible. Thus existing `clean` alone is NOT authoritative scanner proof. The enqueue trigger queues a deduplicated pending/processing `file_processing` malware-scan job when entering `pending_scan`. `processFileJob` (process-queue:199–290) has a real HTTP adapter, not a simulated scanner: posts raw object bytes to FILE_SCAN_PROVIDER_URL, optional bearer FILE_SCAN_PROVIDER_KEY; accepts JSON infected:boolean or verdict clean/infected/suspicious. Missing provider or malformed response records `scan_error` and fails closed. `scanning` is recorded before scanning; verdict RPC records time, provider, event and audit and sets quarantine for suspicious/infected/quarantined. Provider errors can retry up to job max_attempts; stale processing jobs currently remain stuck.

Live `file_upload_record_scan` authorizes trusted service requests or super-admin, locks the file and requires a nonblank provider for clean. Live `file_uploads_scan_status_guard` forces normal inserts to pending and prevents status changes, but trusted roles bypass it and it does not protect every provenance/object column against later edits. A matching audit event alone does not prove immutable bytes. `file_upload_release_state` currently regards BOTH clean and legacy_unverified, nonquarantined, as released: **do not reuse that boolean for extraction**. Review environment has no FILE_SCAN_PROVIDER_URL/KEY/NAME; deployed commissioning is UNKNOWN. No provider-tagged clean file or event was observed, so scanner adapter existence must not be represented as operational scanner assurance.

**Callers.** `src/components/documents/DocumentExtractionPanel.tsx:46` (user session). No other literal invocation found, nor imports/usages of that panel beyond its definition. All direct external HTTP callers remain unknowable. DB/cron caveat above applies.

**Proposed authorization contract.** Require existing application_management/edit AND explicit authoritative file/source access under verified actor; derive source from canonical file relationship, reject mismatched source_type/id, invalid preset and unknown entity types. Caller-scoped lookup is necessary but insufficient: live SELECT policies are permissive, including `NOT has_external_role(...)`, broadening internal reads. Apply explicit entity/application assignment checks rather than treating RLS as definitive. Before any signing/download/AI call or extraction insert, require `scan_status='clean'`, `is_quarantined=false`, nonblank provider, scanned_at, and trusted successful scan evidence bound to the exact immutable storage object version. Reject NULL/unknown/missing evidence. Do not accept user-writable metadata as proof. Prevent object overwrite/scan-state races with immutable versioned paths and a release authorization snapshot bound to that version.

**DECISION REQUIRED.** Approve exact per-entity access rules and immutable object/provenance contract (digest/version binding is not in the inspected file columns). Approve stronger extraction-only release rule versus globally changing legacy download behavior. Restrict scan fields and object-reference updates to trusted commands. Commission scanner and rescan eligible old files; never bulk relabel legacy rows clean.

**Incompatible workflows.** Legacy-unverified downloads formerly treated released; all current providerless clean rows; newly uploaded pending files; scanning/error/quarantine/infected/suspicious files; anonymous registration/form_field/document_version uploads without authenticated authority; extraction for non-application sources under only application edit permission; immediate extraction before worker completion; mutable object replacement; currently uncommissioned scanner environments. UI must show held/pending/unavailable, not fake extraction success.

**Illustrative diff — document-extract/index.ts:84–115 (new helper requires approved implementation):**
```diff
- const { data: file, error: fErr } = await admin.from("file_uploads")...
+ const file = await authorizeFileAndSource(__authzGate, file_upload_id, source_type, source_id);
+ await requireAuthoritativeCleanObjectVersion(file); // clean only; no legacy allowance
+ // Derive source fields from authorized canonical relationship, not request body.
  // only now insert extraction and sign the authorized immutable object
```
**DB dependencies.** Existing file/scan/event tables, enqueue/verdict RPCs and trigger/index; approved source authorization resolver; immutable content provenance and protected fields likely require migration. Existing schema alone does not establish authoritative clean bytes.
**Config/secrets.** SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY, LOVABLE_API_KEY; scanner URL/name/key and provider TLS/egress contract. No secret values collected.
**Affected functionality.** Document intelligence and source-linked extraction history; scanner queue is shared with uploads.
**Tests.** Positive: authorized assigned actor + provider-verified clean immutable object yields one extraction. Negative: other entity/uploader, forged source, permissive-RLS-only access, legacy, providerless clean, all other existing states, quarantined clean, missing event/time/provider, overwrite after scan, bad provider response and missing scanner: no signed URL or AI request. Test worker clean/infected/error and real staging EICAR fixture with commissioned scanner.
**Deployment.** Approve rules → DB provenance/field protections and migrations → scanner staging commissioning → rescan/backfill by actual scan → tests → deploy gate → enable UI extraction. Do not weaken gate to avoid a backlog.
**Rollback.** Disable extraction/AI route while retaining scan protections and audit rows; keep additive schema, never restore unscanned signing.
**Post-deploy verification.** SELECT count/group by scan state/provider and event linkage; test held files cannot reach storage/AI, eligible clean file can; monitor failed/stuck file jobs and quarantine/audit transitions.

## SEC-10 — send-notification: governed dispatch and delivery integrity

**Existing code evidence — `supabase/functions/send-notification/index.ts`:**

```ts
23:   // Accept either a worker/cron invocation (service key or worker token) OR a
24:   // signed-in user session — client screens (FPA declarations/invitations,
25:   // settings tests) invoke this function with their user JWT.
26:   const __workerGate = requireWorkerInvocation(req);
27:   if (!__workerGate.ok) {
28:     const authHeader = req.headers.get("Authorization") || "";
```

```ts
39:         authorizedUser = !error && !!data?.claims?.sub;
40:       } catch {
41:         authorizedUser = false;
42:       }
43:     }
44:     if (!authorizedUser) return __workerGate.response;
45:   }
46: 
47: 
```

```ts
56:     // ─── Direct email send path (used by dispatch-notification-event and admin Retry) ───
57:     if (body?.type === "email" && body?.to && body?.subject) {
58:       const emailConfig: EmailDeliveryConfig = await loadEmailDeliveryConfig(supabase);
59:       const logId: string | undefined = body.dispatch_log_id;
60:       const sendStarted = Date.now();
61:       const attemptNo = Number(body.attempt ?? 0) || null;
62: 
63:       const result = await sendEmailWithFallback(emailConfig, {
64:         to: body.to,
65:         subject: body.subject,
66:         text: body.body || "",
67:         html: body.html,
68:       });
```

```ts
74:             .update({
75:               // The provider accepted the message. This is `sent`, never `delivered`:
76:               // delivery confirmation can only come from a provider callback.
77:               status: "sent",
78:               provider: result.provider,
79:               provider_message_id: result.messageId,
80:               sent_at: new Date().toISOString(),
81:               last_attempt_at: new Date().toISOString(),
82:               next_attempt_at: null,
83:               claimed_at: null,
84:               claimed_by: null,
85:               error: null,
86:               error_details: null,
87:             })
88:             .eq("id", logId);
```

```ts
251:       const { data: queued } = await supabase
252:         .from("notifications")
253:         .select("*, notification_templates:template_id(*)")
254:         .eq("delivery_status", "queued")
255:         .limit(50);
256: 
257:       let processed = 0;
258:       const emailConfig: EmailDeliveryConfig = await loadEmailDeliveryConfig(supabase);
259: 
```

```ts
334:         }
335:       }
336: 
337:       return new Response(JSON.stringify({ success: true, processed }), {
338:         headers: { ...corsHeaders, "Content-Type": "application/json" },
339:       });
```

**Root cause.** Worker gate exists, but ANY valid user JWT is an alternative; no dispatch/test permission, source scope or recipient/log binding. Service-role sends caller body and updates arbitrary log id. Batch reads queued notifications without claiming them; response hides failures.

**Every literal caller found:**
- Browser user JWT: RequestDeclarationDialog.tsx:200; ApplicationFormSettings.tsx:61; FpaDeclarations.tsx:403,506; FpaInvitationTracker.tsx:209 (all under src as listed in callers.txt).
- Edge workers/service clients: notification-email-retry-worker:82, notification-digest-run:109, create-web-user:296, run-scheduled-reports:96, toggle-user-status:84, notification-retry:124, notification-failure-sweep:74, dispatch-notification-event:1543, evaluate-prudential-early-warnings:42 (supabase/functions/*/index.ts). These use internal admin clients or fetch; preserve verified service/worker credential contract, not caller-supplied worker labels. A caller's own weak authorization is not repaired by trust downstream. Unknown external clients/cron remain unverified as in coverage limitation.

**Authorization contract.** Separate trusted worker delivery from user commands. Existing workerAuth accepts exact service credential in Bearer/apikey/x-internal-service-key or WORKER_INVOKE_TOKEN; no JWT decoding-only trust. Retain that trust boundary only for worker delivery. Browser actions require notification_management/dispatch, or notification_management/test_send for bounded administrative test; FPA invitations should invoke a scoped invitation command that derives recipients/content from the approved record. Never permit arbitrary user to select `to`, HTML, user_id or dispatch_log_id. Load durable dispatch by id, bind recipient/channel/source/content to authorized record and current attempt; reject mismatched ids and already-sent work. Worker credentials do not exempt payload consistency checks. API response must distinguish accepted/failed/suppressed counts and return retriable errors correctly.

**Provider/retry/idempotency (also applies SEC-18).** Existing `_shared/email-provider.ts` really sends via Resend then SMTP fallback. Direct success is already recorded `status='sent'` with provider message id, NOT delivered; preserve this correct behavior. Delivery needs authenticated provider callback matched by provider/message id; inspect and validate callback signature/replay contract before enabling DELIVERED. SMTP acceptance alone cannot confirm inbox delivery. Never fallback/retry blindly after an ambiguous acceptance timeout: provider may already have sent.

Live communication_state enum is exactly QUEUED, RETRYING, SENT_TO_PROVIDER, DELIVERED, FAILED, DEAD_LETTER, PROVIDER_NOT_CONFIGURED, SUPPRESSED. Do not substitute lowercase status strings for enum values. Existing status and communication_state must be updated consistently via one transition contract; approval required for exact mappings and callbacks.

Atomic mechanisms ALREADY exist: `claim_notification_outbox` and `claim_notification_event_queue` use FOR UPDATE SKIP LOCKED; `claim_email_retry_batch` atomically claims failed dispatches to processing and sets claimed_at/by. Its 10-minute stale predicate applies to failed rows only: a crashed processing row is NOT reclaimed by that RPC. Retry worker uses exponential backoff/max attempts/poisoning; also notification-retry and failure-sweep create competing retry paths. Consolidate their ownership. Unique notification_dispatch_log.dedupe_key and partial notifications.dedupe_key indexes exist; they prevent duplicate rows, not repeated provider sends. Batch `notifications` loop has no claim. Existing provider send helper has no evident provider idempotency parameter in the inspected implementation.

**DB idempotency IS REQUIRED.** Reuse durable dispatch dedupe and add/reuse one authoritative send-attempt claim with lease owner, expiry and fenced completion, bounded retries and unique logical message/recipient/channel key across all paths. Do not invent a second parallel outbox. Add provider idempotency support where offered, stable across retries; for SMTP/ambiguous sends choose reconciliation/manual hold policy. DB transactions cannot guarantee exactly-once external delivery across crash-after-acceptance. **DECISION REQUIRED:** unified queue ownership, state mapping, ambiguous-send/fallback policy, callback contract, invitation and test authorization limits.

**Illustrative diff — send-notification/index.ts:23–68,251–339:**
```diff
- if (!__workerGate.ok) { /* any authenticated user */ }
+ if (!__workerGate.ok) return await handleAuthorizedNotificationCommand(req);
- const logId = body.dispatch_log_id;
- const result = await sendEmailWithFallback(emailConfig, { to: body.to, ... });
+ const attempt = await claimAuthorizedDispatch(body.dispatch_log_id, body.attempt);
+ const result = await sendIdempotentAttempt(emailConfig, attempt);
+ await completeAttemptChecked(attempt, result); // lease fence, provider id, consistent state
- .from("notifications").select("*, notification_templates:template_id(*)").eq("delivery_status", "queued")
+ // Consume approved atomic claim RPC, not an unlocked select-and-send.
- { success: true, processed }
+ { success: failed === 0, accepted, failed, suppressed }
```
**DB deps.** Dispatch/outbox/notification tables, claim RPCs, enum, dedupe indexes, audit and retry fields; approved migration for unified claims/stale recovery/provider attempt persistence. **Config/secrets.** Supabase credentials, WORKER_INVOKE_TOKEN, email_provider_secrets (resend/smtp), RESEND_API_KEY or SMTP_PASSWORD fallbacks and site_settings sender/SMTP/provider config; webhook verification secret if used. Never put worker/provider credentials in browser.
**Affected functionality.** All listed invitation/settings/registration/status/report/digest/retry flows; removing user fallback without replacement breaks real UI callers.
**Tests.** Positive: scoped command and authenticated claimed worker send once; provider acceptance sets SENT_TO_PROVIDER/sent, verified callback sets delivered. Negative: ordinary user arbitrary recipient/log/content, wrong entity, spoofed worker header, duplicate commands, two workers, poisoned/terminal row, mismatched lease, provider 429/5xx, SMTP auth failure, callback replay/forgery, crash after acceptance, DB write failure; failures visible in response and no fan-out duplicate.
**Deployment.** Approve contracts → additive claim/attempt DB migration → provider support and staging tests → migrate browser commands and all workers → deploy strict gate/dispatcher → retire duplicate consumers and inspect held rows → gradual traffic.
**Rollback.** Pause delivery consumers and retain queued/attempt history, old additive schema and strict auth. Do not reinstate arbitrary authenticated send. Reconcile provider-accepted attempts before resuming.
**Post-deploy.** Inspect grouped communication_state/status mismatches, stale leases, dedupe conflicts, provider ids and retry counts; correlate one logical message to one accepted attempt, compare provider callbacks, run authorized/unauthorized smoke tests.

## SEC-11 — correspondence source authorization and honest transport state

**Existing code evidence — `supabase/functions/send-correspondence/index.ts`:**

```ts
36: async function loadSource(admin: any, source_type: string, source_id: string) {
37:   const table =
38:     source_type === "application" ? "applications"
39:     : source_type === "enforcement" ? "enforcement_actions"
40:     : source_type === "complaint" ? "complaints"
41:     : source_type === "fp_assessment" ? "fp_assessments"
42:     : source_type === "return" ? "returns_filed"
43:     : source_type === "licensee" ? "licensees"
44:     : null;
45:   if (!table) return null;
46:   const { data } = await admin.from(table).select("*").eq("id", source_id).maybeSingle();
47:   return data || null;
```

```ts
54:   const __authzGate = await requireUserPermission(req, "correspondence_management", "dispatch");
55:   if (!__authzGate.ok) return __authzGate.response;
```

```ts
105:     const channel = overrideChannel || template?.channel || "email";
106: 
107:     const record = await loadSource(admin, source_type, source_id);
108:     const vars = {
109:       ...(record || {}),
110:       recipient_name: recipient_name || "",
111:       recipient_email: recipient_email || "",
112:       today: new Date().toISOString().slice(0, 10),
113:       source_type,
114:       source_id,
115:       ...context,
```

```ts
145:         subject: renderedSubject,
146:         body: renderedBody,
147:         status: "sent",
148:         sent_by: userId,
149:         sent_at: new Date().toISOString(),
```

**Root cause.** Global dispatch gate does not scope service-role source lookup. Missing/unauthorized records still render; arbitrary context can override source tokens. A dispatch row is labeled sent without transport acceptance.
**Callers.** `src/components/correspondence/SendCorrespondenceDialog.tsx:90`, user JWT. No other literal invocation; external and cron caveats apply.
**Contract.** Keep correspondence dispatch authority and require canonical access to each source before rendering. Allowlist application→applications, enforcement→enforcement_actions, complaint→complaints, fp_assessment→fp_assessments, return→returns_filed, licensee→licensees. Resolve entity/return authority server-side, including assignments and external capability rules; unknown/missing/unauthorized sources fail closed. Existing authz scope `recordId` is not a generic arbitrary-source authorization mechanism: implement explicit resolver per type. Resolve recipients from approved source contacts; privileged overrides require an approved permission/audit rule. Allowlist nonauthoritative template context tokens. Queue a durable dispatch; in-app creation is not email/SMS/letter delivery.
**DECISION REQUIRED.** Live queried permission_modules/actions and permissions contained no correspondence_management dispatch entry, although source gate requests it. Confirm effective has_permission catalogue/super-admin behavior and seed approved permission, do not bypass. Approve six source rules, recipient overrides, letter/manual completion, unsupported SMS policy and renderer tokens.
**Illustrative diff — send-correspondence/index.ts:107,134–168:**
```diff
- const record = await loadSource(admin, source_type, source_id);
+ const record = await authorizeCorrespondenceSource(__authzGate, source_type, source_id);
- ...context,
+ ...allowlistedContext(context), // cannot override protected source tokens
- status: "sent",
- sent_at: new Date().toISOString(),
+ status: "queued",
+ sent_at: null,
+ // Persist dispatch + one deduplicated transport outbox item atomically.
```
**DB deps.** Permission catalogue approval, source resolvers, correspondence_dispatches + notification tables and transactional enqueue/idempotency; no existing correspondence dedupe index beyond primary key was found. Existing text status has no checked queued constraint in queried constraints, but consumers need audit before changing semantics.
**Config/secrets.** Supabase keys; email provider settings/secrets via SEC-10 pipeline; no transport exists in this handler. **Affected functionality.** All correspondence templates/source dialogs, dispatch history and in-app notices; SMS/letter must never pretend email delivery.
**Tests.** Positive authorized source renders only allowed tokens, queued dispatch/outbox once, provider acceptance advances sent. Negative each of six foreign sources, invalid type, missing source, context spoof, unrelated recipient, revoked permission, transaction failure, duplicate request, unavailable SMS; no data interpolation or false sent state.
**Deployment.** Approve catalogue/scope/channel contracts → resolver + transactional queue migration → UI queued status → scoped handler and dispatcher staged together → canary per source type.
**Rollback.** Pause correspondence transport, keep durable queued rows and scope gate; do not restore false sent. Preserve already accepted records/provider ids.
**Post-deploy.** Check unauthorized source matrix, rendered token audit, one outbox row per dispatch and sent_at only after acceptance; separately verify in-app versus external state.

## SEC-12 — returns analysis: scoped generation and server-authoritative ratios

**Existing code evidence — `supabase/functions/generate-return-analysis/index.ts`:**

```ts
116:   const __authzGate = await requireUserPermission(req, "returns_management", "view");
117:   if (!__authzGate.ok) return __authzGate.response;
```

```ts
132:     const body = await req.json().catch(() => ({}));
133:     const return_id: string | undefined = body.return_id;
134:     const computeAi: boolean = body.compute_ai_summary !== false;
135:     if (!return_id) return json({ error: "return_id is required" }, 400);
136: 
137:     const admin = createClient(url, service);
138: 
139:     // Load return + config
140:     const { data: rf, error: rfErr } = await admin.from("returns_filed")
141:       .select("id, entity_id, on_behalf_of_licensee_id, return_configuration_id, sector_id, period_end_date, unique_id")
142:       .eq("id", return_id).maybeSingle();
143:     if (rfErr) return json({ error: `Return lookup failed: ${rfErr.message}` }, 500);
144:     if (!rf) return json({ error: "Return not found" }, 404);
```

```ts
149:     // Ratio values are supplied by the caller (`evaluate-return-prudential`),
150:     // which computes them in-memory from the same `prudential_ratios`
151:     // configuration during the authoritative post-submit pass. No ratio value is
152:     // recalculated, re-derived or persisted here.
153:     const suppliedRatios: Array<{ ratio_key: string; value: number | null; null_reason?: string | null }> =
154:       Array.isArray(body.ratios) ? body.ratios : [];
155: 
156:     const [{ data: breachRows = [] }, { data: cfgRatios = [] }] = await Promise.all([
157:       admin.from("v_prudential_current_breaches").select("*").eq("return_id", return_id).order("detected_at", { ascending: false }),
158:       admin.from("prudential_ratios").select("*").eq("return_config_id", rf.return_configuration_id),
```

```ts
263:         actorId: actor.id,
264:         entityType: "return",
265:         entityId: return_id,
266:         error: ai_error,
267:         durationMs: Date.now() - aiStarted,
268:       });
269:     } else if (computeAi && !lovableKey) {
270:       ai_error = "missing_lovable_api_key";
271:     }
272: 
273:     // Persist row
274:     const inputs = {
275:       cfg_ratio_count: (cfgRatios as any[]).length,
276:       supplied_ratio_count: suppliedRatios.length,
277:       breach_count: breaches.length,
278:       trend_len: trend.length,
279:       trend_unavailable_reason,
280:       ratio_source: "evaluate-return-prudential:in-memory",
281:       ai_error,
```

**Root cause.** View permission authorizes a write/AI spend; no return scope. Client ratios become canonical inputs; failures in AI still allow success-shaped analysis persistence.
**Every discovered direct caller and actual trust mechanism.**
1. `src/pages/returns-mgmt/ReturnAnalysis.tsx:114`: browser user JWT, body return_id/compute_ai_summary only (no ratios). Its regeneration therefore presently produces missing/null ratio inputs.
2. `supabase/functions/evaluate-return-prudential/index.ts:569`: admin service-role client invokes after dispatch_notifications post-submit, sends in-memory computed ratios. Evaluator itself uses requireUserPermission returns_management/view (:183), not a cron-secret gate. The downstream generate handler uses requireUserPermission only: no service-role or cron-secret branch exists. A service JWT lacks the verified user sub expected by that gate and is not an established accepted analysis worker contract. Best-effort catch/ignored invoke errors can hide failure. Do not claim this internal path works.
3. Visible database HTTP helper is generic notification_worker_kick, not a proven direct analysis call; cron denied. Unknown direct external callers cannot be enumerated from repository. Indirect evaluator call found in `supabase/functions/resubmit-return/index.ts:53` using admin invocation; no other literal evaluator invocation found in src. Header comments mentioning FillReturnPage/Recompute are not caller evidence.

**Proposed contract (NO bypass).** Parse body once, require returns_management/edit plus existing `{returnId}` scope (can_view_entity_returns), and an approved generation state rule before reads/writes. No existing generate action was in live permission_actions. **DECISION REQUIRED** whether edit is sufficient or a dedicated catalogue action is needed; scoped readers alone must not generate. Preferred internal contract: have evaluator call a shared analysis computation routine inside its already scoped authorized request; strengthen evaluator scope/write authority too. Shared routine receives server-loaded inputs and explicit verified actor; never expose an unchecked HTTP trust flag. If retaining HTTP, propagate the original verified user Authorization and reapply the same scope/write gate; do not add service-role/cron bypass. Confirm original actor is available in resubmit/evaluator flows; otherwise hold generation for approved actor-bound command contract.

**Ratio authority.** Do NOT resurrect retired return_calculated_ratios/record_return_ratio. Extract evaluator's canonical ratio evaluation into shared server code and recompute from persisted return payload/configuration and frozen input revision, or consume an approved immutable server-authored evaluation snapshot bound to return/revision. First option needs no new ratio store; snapshot option needs schema approval. Ignore/reject body.ratios for all HTTP callers. Verify input revision before persistence so concurrent return edits do not write stale results. Return complete/partial/failed explicitly (AI skipped by request differs from AI requested but failed). UI checks those states rather than showing unconditional success.
**Illustrative diff — generate-return-analysis/index.ts:116,132–158, final response; evaluator:569:**
```diff
- const __authzGate = await requireUserPermission(req, "returns_management", "view");
+ const body = await req.json();
+ const __authzGate = await requireUserPermission(req, "returns_management", "edit", { returnId: body.return_id });
- const suppliedRatios = Array.isArray(body.ratios) ? body.ratios : [];
+ const suppliedRatios = await computeCanonicalRatiosForRevision(admin, body.return_id);
- await admin.functions.invoke("generate-return-analysis", { body: { return_id, ratios: computed, ... } });
+ await generateAnalysisFromAuthorizedEvaluation({ actor, returnId: return_id, revision, computed });
+ // shared server routine; evaluator must first enforce same scope/write contract
- return json({ ok: true, ... });
+ return json({ ok: !ai_error, status: ai_error ? "partial" : "complete", ... });
```
**DB deps.** returns_filed, prudential_ratios, v_prudential_current_breaches, return_consolidated_analysis, can_view_entity_returns and canonical evaluator input/config tables; approved revision consistency/write command or snapshot migration if chosen. **Config/secrets.** Supabase keys, LOVABLE_API_KEY and existing AI endpoint/model configuration; SEC-14 governance remains a separate unresolved dependency, not solved here.
**Affected functionality.** Return Analysis regenerate, post-submit evaluator, resubmit path, health/ratio summaries and AI/audit history. Current browser omission of ratios must be fixed server-side, not by trusting browser arithmetic.
**Tests.** Positive scoped writer and actor-preserving evaluator generate same server ratios for same revision; compute_ai_summary=false deterministic success. Negative view-only, foreign/draft-unassigned return, forged ratios, stale revision, service JWT/cron header sent to user route, missing config, gateway 402/429/5xx, missing key and DB failure; no false complete status. Assert evaluator invokes no recursive evaluation/generation cycle.
**Deployment.** Approve action/state/internal contracts → shared canonical calculator with parity fixtures → revision safeguards → scoped evaluator and analysis plus UI partial handling → test resubmit/browser/post-submit → canary.
**Rollback.** Disable generation while retaining last good analysis/read access and scoped calculator; do not restore view-only writes or body ratios. Preserve analysis history and classify partial records.
**Post-deploy.** Compare ratio results to independent canonical fixtures, actor/return/revision audit, response partial/error rates and visible UI failure; verify internal post-submit actually creates one expected record without a permission bypass.

## SEC-13 — developer API: endpoint-to-scope approval matrix

**Existing code evidence — `supabase/functions/developer-api/index.ts`:**

```ts
43:       const { data: keyRow } = await admin.from('api_keys')
44:         .select('id, key_hash, revoked, expires_at, scopes')
45:         .eq('key_prefix', prefix).maybeSingle();
46: 
47:       if (!keyRow || keyRow.key_hash !== keyHash) {
48:         status = 401; payload = { error: 'Invalid API key' };
49:       } else if (keyRow.revoked) {
50:         status = 403; payload = { error: 'API key revoked' };
51:       } else if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
52:         status = 403; payload = { error: 'API key expired' };
53:       } else {
54:         keyId = keyRow.id;
55: 
56:         if (resource === 'licensees') {
57:           if (id) {
58:             const { data } = await admin.from('licenses')
59:               // Canonical columns: issued_at / valid_until. The licensee is reached
60:               // through licensees.license_id (there is no licenses -> licensees FK).
```

```ts
65:           } else {
66:             const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
67:             const { data } = await admin.from('licenses')
68:               .select('id, license_number, status, issued_at, valid_until, licensee:licensees!licensees_license_id_fkey(name)')
69:               .in('status', ['active', 'suspended'])
70:               .order('issued_at', { ascending: false })
71:               .limit(limit);
72:             payload = { data: data ?? [] };
73:           }
74:         } else if (resource === 'enforcement') {
75:           const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
76:           const { data } = await admin.from('enforcement_actions')
77:             .select('id, case_number, enforcement_type, status, decision_at, penalty_amount, penalty_currency')
78:             .in('status', ['decided', 'closed'])
79:             .order('decision_at', { ascending: false, nullsFirst: false })
80:             .limit(limit);
81:           payload = { data: data ?? [] };
82:         } else if (resource === 'health') {
83:           payload = { ok: true, ts: new Date().toISOString() };
84:         } else {
85:           status = 404; payload = { error: 'Unknown resource' };
86:         }
87:       }
88:     }
89:   } catch (e: any) {
90:     status = 500; payload = { error: e?.message ?? 'error' };
```

**Root cause.** api_keys.scopes is fetched but never enforced. Supabase query errors are ignored; DB failure can look like []/{} or false 404. Method advertisement is not enforcement: non-GET requests currently enter read routes too.
**Catalogue/docs/live data.** `SELECT DISTINCT scopes FROM public.api_keys` returned **zero rows**, not an observed empty scope array, and no secrets/hashes were queried. `manage-api-key/index.ts:44–45` accepts arbitrary strings, defaults omitted/empty scopes to the sole concrete code-defined name `registry:read`. No approved endpoint scope allowlist is implemented. Live permission catalogue search for api modules returned none; notification/returns permissions are user permissions, not API-key scopes. `src/pages/admin/ApiKeys.tsx:110–113` documents exactly four routes below; issuance UI does not select scopes and issues default scope. Header comments call API public-registry-backed, but service-role detail reads and enforcement field disclosure still need explicit publication review.

**Full endpoint → scope table FOR APPROVAL (no invented scopes):**
| Method / route | Existing behavior / data | Proposed required existing scope | Approval status |
|---|---|---|---|
| GET /licensees | active/suspended licenses, licensee name | registry:read | Proposed interpretation of existing default; approve publication and scope coverage |
| GET /licensees/{id} | license record and licensee id/name/number, currently no publication/status restriction | registry:read | Approve; enforce same approved public status rule as list, prevent UUID-based unpublished disclosure |
| GET /enforcement | decided/closed case_number, type, penalty/currency, decision date | none specifically defined | **DECISION REQUIRED:** approve registry:read coverage OR add approved enforcement scope to catalogue/issuer/docs; deny until approved |
| GET /health | authenticated connectivity/time | none specifically defined | **DECISION REQUIRED:** approve registry:read OR explicit authenticated-key/no-data policy; no accidental scope exemption |
| OPTIONS /* | preflight only | none | Keep metadata-only CORS, never data |
| Other methods | currently not rejected | none | 405; GET/OPTIONS only |
| Unknown resource / unexpected extra path components | currently some trailing paths silently ignored | none | 404; exact route match |

**Authorization contract.** Keep full-key hash verification, expiry and revocation checks (already present). Validate scope array and deny missing/empty/malformed/unknown scopes, no wildcard behavior. Evaluate approved route scope before querying data, including health once approved. Issuer must validate against same approved catalogue; reject arbitrary strings rather than granting meaning later. Return sanitized 503/500 for key/DB lookup errors instead of 401/empty data, 404 only for authorized genuine missing public record, 403 for scope denial. Cap pagination with valid positive integer; do not echo SQL internals. Avoid exposing existence of nonpublic license records. Unknown routes/methods need no data query.
**Callers.** External developers are the runtime audience, not enumerable from source. `src/pages/admin/ApiKeys.tsx:90,110–113` is docs/base URL, NOT an invocation. manage-api-key provisions keys but does not call developer-api. No internal literal invocation found; cron/DB visibility caveat applies.
**Illustrative diff — developer-api/index.ts:43–90:**
```diff
- const { data: keyRow } = await admin.from('api_keys')...
+ const { data: keyRow, error: keyError } = await admin.from('api_keys')...
+ if (keyError) return unavailable();
+ // after key validity, before any resource query:
+ if (req.method !== 'GET') return methodNotAllowed();
+ const route = matchExactApprovedRoute(resourceParts);
+ if (!route) return notFound();
+ if (!approvedScopeAllows(keyRow.scopes, route)) return forbidden();
- const { data } = await admin.from('licenses')...
+ const { data, error } = await admin.from('licenses')... // approved public records only
+ if (error) return unavailable();
```
Apply checked error handling to both license branches and enforcement, not only the example. Preserve usage status logging for denied scopes, without logging full keys.
**DB deps.** api_keys.scopes text[], api_key_usage, licenses/licensees/enforcement_actions; no mandatory schema change for registry:read alone. Approved new scopes/catalogue/check constraint or issuer allowlist require separate migration/contract approval. No live rows to backfill observed, but recheck at deployment.
**Config/secrets.** Supabase URL/service key only in function; external API keys remain server-issued, hash-stored. No new secret for scope checking. **Affected functionality.** Developer integrations, key creation, usage analytics and API docs; clients relying on arbitrary scopes, unpublished detail or POST reads will fail intentionally.
**Tests.** Matrix every route with only approved scope, empty/null/unrelated scope, malformed key, revoked/expired key, query errors (including key lookup), unknown route, trailing segments, POST, negative/huge limit, nonpublic detail; assert no resource query on scope denial and no DB-error empty 200. No endorsement of unapproved scope map by tests.
**Deployment.** Approve complete matrix/publication rules → issuer validation and docs/key migration plan → staged route tests → deploy scope enforcement and proper error status → review external clients.
**Rollback.** Disable affected endpoints or retain strict approved allowlist while repairing routing; never revert to ignoring scopes. Preserve key rows/usage data; do not reissue secrets automatically.
**Post-deploy.** Scope denial/status metrics, documented calls with fresh staged scoped keys, revoked/expired rejection, induced staging DB error returns 5xx, no unpublished records via id.

## SEC-18 — process-queue: remove false delivery and unify send ownership

**Existing code evidence — `supabase/functions/process-queue/index.ts`:**

```ts
25:   const __workerGate = requireWorkerInvocation(req);
26:   if (!__workerGate.ok) return __workerGate.response;
```

```ts
75:       for (const job of (jobs || []) as QueueJob[]) {
76:         // Mark as processing
77:         const { data: claimed, error: claimError } = await supabase
78:           .from("job_queue")
79:           .update({ status: "processing", started_at: new Date().toISOString() } as any)
80:           .eq("id", job.id)
81:           .eq("status", "pending")
82:           .select('id')
83:           .maybeSingle();
84:         if (claimError) throw claimError;
85:         if (!claimed) continue;
```

```ts
102:           await supabase
103:             .from("job_queue")
104:             .update({
105:               status: "completed",
106:               completed_at: new Date().toISOString(),
107:               attempts: job.attempts + 1,
108:             } as any)
109:             .eq("id", job.id);
```

```ts
168: async function processEmailJob(supabase: any, job: QueueJob) {
169:   const { recipient_email, subject, body, template_id } = job.payload as any;
170:   console.log(`[EMAIL JOB ${job.id}] Sending to ${recipient_email}: ${subject}`);
171:   // Integration point for Resend/SendGrid/SMTP
172:   // For now, log and mark delivered
173:   if (template_id) {
174:     await supabase
175:       .from("notifications")
176:       .update({ delivery_status: "delivered" } as any)
177:       .eq("template_id", template_id)
178:       .eq("delivery_status", "queued");
179:   }
```

**Root cause.** Email processor does not call a provider; updates every queued notification sharing a template to delivered. Completion/error writes are not checked. Important correction to old proposal: job claiming already has a conditional atomic UPDATE WHERE status=pending + RETURNING, so simultaneous workers do not both claim the same pending job. It is not SKIP LOCKED and lacks lease fencing/reclaim; do not claim there is no atomic claim at all.
**Callers.** No runtime literal invocation found in src or other edge functions. `src/test/fileScanWorker.test.ts:4` reads source and is not a runtime caller. process-queue itself accepts enqueue/process/stats under requireWorkerInvocation; generic DB kicker could target it but cron inventory is blocked. Unreferenced literal name does not prove unused queue: database triggers enqueue file jobs directly. `file_upload_enqueue_scan` definitely writes file_processing jobs, not email jobs. Inspect live job_queue email producer inventory and authorized cron output before removing email functionality; arbitrary external schedulers cannot be ruled out.
**Contract.** Preserve trusted worker-only gate. Remove blanket template update. Each email job must resolve one durable dispatch/recipient/content reference from trusted canonical data and delegate to SEC-10 unified send engine; reject legacy payload with template only and no unique dispatch linkage. Mark job completed only after checked accepted/terminal outcome according to approved queue semantics; failure/retry must not overwrite accepted send as unsent. No fake delivered status. Validate job/action/type/batch bounds and check every completion/retry write.
**Idempotency/state.** SEC-10 assessment applies in full: reuse existing FOR UPDATE SKIP LOCKED outbox/event/retry claims where appropriate; no need to build competing email scheduler. job_queue currently has started_at/attempts/max_attempts, no explicit lease-owner/expiry columns, no email logical dedupe index; only pending-file scan uniqueness. **DB idempotency IS REQUIRED** for production delivery across this queue and direct/retry paths; job id alone is not logical-message dedupe. Template id is never a notification id. Add approved fenced lease/recovery if generic queue remains. Stale email processing must reconcile ambiguous provider acceptance before resending. Preserve scan worker behavior when changing this shared queue.
**DECISION REQUIRED.** Retire generic email jobs in favor of existing outbox, or retain as adapter with canonical dispatch id; approve existing payload migration/quarantine, state mapping and ambiguous delivery policy. No silent migration from template-wide status to inferred recipient.
**Illustrative diff — process-queue/index.ts:168–179,102–123:**
```diff
- const { recipient_email, subject, body, template_id } = job.payload;
- // log and mark delivered
- await supabase.from("notifications").update({ delivery_status: "delivered" })
-   .eq("template_id", template_id).eq("delivery_status", "queued");
+ const dispatch = await resolveCanonicalEmailDispatch(job); // requires unique approved linkage
+ await dispatchClaimedIdempotentEmail(dispatch); // SEC-10 engine, no duplicate consumer
- await supabase.from("job_queue").update({ status: "completed", ... }).eq("id", job.id);
+ await completeClaimedJobChecked(job.id, leaseFence, outcome);
```
**DB deps.** job_queue, notifications and unified dispatch/outbox schema, existing conditional claim; approved adapter link/logical dedupe/fenced recovery or retirement migration. Check UPDATE errors for all job types without making simulated report generation part of this email fix.
**Config/secrets.** Existing worker credentials and SEC-10 email provider configuration; scanner FILE_SCAN_PROVIDER_* must remain intact. No provider configured means failure/hold, never delivered. **Affected functionality.** Generic background email delivery, queue stats/retries; shared file scanning and report jobs regression risk.
**Tests.** Positive one linked notification accepted once; same-template different recipient untouched. Negative invalid legacy linkage, duplicate jobs, concurrent workers and alternate retry paths, crash after acceptance, stale lease worker completion, failed DB write/provider failure, exhausted attempts; job must not falsely complete/deliver. Regression: clean/infected/malformed scanner responses and file job retries, queue stats and report routing.
**Deployment.** Obtain cron/producers → approve retirement/adapter → pause email consumer only → migrate/quarantine legacy jobs without resending ambiguous historical rows → shared dispatcher/DB claim deployment → checked job adapter → canary single recipient → resume. Never pause malware scanning inadvertently.
**Rollback.** Pause email jobs; keep canonical dispatch/attempt records and scan/report consumers. Restore only a fail-closed adapter, not the blanket delivered implementation. Manually reconcile historical false-delivery rows using provider evidence, not template id.
**Post-deploy.** Verify exactly one notification changes per accepted job, no delivered without callback evidence, checked job terminal writes and bounded retry counters; monitor stale queue jobs; verify file scanning still runs. Run existing fileScanWorker tests when implementation is eventually changed; this read-only proposal changed no behavior and ran no mutation tests.

## Release approval checklist

All six remain **PROPOSAL ONLY / DEPLOYMENT APPROVAL REQUIRED**. Required before approval: authorized cron inventory and indirect callers; authoritative immutable clean-scan release; correspondence catalogue/source policy; analysis write permission and actor-preserving internal execution; complete developer scope matrix; unified notification ownership, DB idempotency/leases and provider ambiguity/callback policy. Database HTTP success and cron run success are not end-to-end delivery or authorization verification. No bypass, scanner state fabrication, scope fabrication or secret disclosure is proposed.
