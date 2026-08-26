# MC-06 UI — Patterns & Clusters

Front-end only. No migrations, no backend changes, no detection-rule changes, no AI, no certification. All reads and writes go through the existing governed pattern RPCs.

## 1. Pattern Register (`/conduct/patterns`)

New page listing detected patterns from the server read model, styled like the existing Conduct Signals register.

Columns: pattern reference, pattern type, entity / sector / product / channel, rule (business name + version), metric vs threshold (e.g. "9 repeat complaints vs limit of 5"), contributing records count, severity, status, reviewer, first detected, last evaluated. A small marker shows when a Signal or Alert has already been raised from the pattern.

Filters: pattern type, status, severity, entity, rule, and a detection-date range. Plus reference/title search, paging with server total count, refresh, and a status tab strip with counts (Open / Under review / Confirmed / Dismissed / All).

Note: the read model accepts status, pattern type, severity, entity, rule, search, limit and offset. The date range is applied to the returned page in the UI (no backend change), and is labelled as filtering the loaded results.

## 2. Pattern Detail (`/conduct/patterns/:id`)

Header: pattern reference, business title, status badge, severity, entity/sector/product/channel, reviewer, detected and last-evaluated dates, plus prominent "Signal raised" / "Alert raised" chips linking to those records when present.

Explainability block — plain language, in this order:
- **What happened** — one-sentence narrative built from pattern type, entity/product/channel and member count.
- **Why this was detected** — rule name and version, evaluation window (dates + length in days), metric measured, threshold, comparison in words ("more than", "at least"), and the stored match explanation.
- **Measured vs threshold** — a compact comparison row with the measured value, unit and limit.
- **What to review next** — a short deterministic checklist derived from the current status (assess contributing records → record a review decision → link evidence → raise a Signal or Alert if the pattern is confirmed).

Tabs below:
- **Contributing records** — cluster members grouped by record kind (Signals, Complaints, Outcomes, other) into separate labelled sections, each row showing its business reference, occurrence date and severity/contribution, and deep-linking to the source record. Kinds stay visually distinct; nothing is merged.
- **Evidence** — reuses the existing conduct evidence engine and viewer; adds an evidence item to the pattern through the governed link RPC.
- **History** — merged evaluation history (metric runs over time) and review/activity log with business labels.

## 3. Officer actions

Only existing governed RPCs: review pattern (status change + note), link evidence, raise Conduct Signal, raise Conduct Alert. Each action is a dialog with a required rationale/note and confirmation. Nothing is created automatically.

Once a Signal or Alert exists on the pattern, its button is replaced by a link to the raised record with an explanatory note, so a second officer cannot duplicate it. Actions are gated by the existing permission gate; auditors and assignment-only users see the workspace fully read-only with no action buttons.

## 4. Object distinction

Pattern, Signal, Alert and Complaint each keep their own icon, colour treatment and one-line definition in the UI (a short legend on the register, and typed section headers on the detail page). Links navigate between them; records are never combined into one list.

## 5. States & language

Loading, error (with retry), empty and read-only states on every async section, reusing the shared section-state component used by the complaint workspace. No SQL, UUIDs, RPC names, table names, raw enums or dedupe keys are shown — all enums pass through a new label map. Severity/status badges reuse the existing conduct variants.

## 6. Navigation

Add a single "Pattern Detection" item to the existing Market Conduct group next to Conduct Signals (same icon catalogue, internal roles, `market_conduct` module). No new module or duplicate entry. Routes registered in the existing conduct route file, with breadcrumbs for register and detail.

## Technical notes

- `src/lib/conductPatternOps.ts` — thin governed wrappers for `conduct_cluster_review`, `conduct_cluster_link_evidence`, `conduct_cluster_raise_signal`, `conduct_cluster_raise_alert`.
- `src/hooks/useConductPatterns.ts` — `usePatternRegister(filters)` over `conduct_cluster_register`, `usePatternDetail(id)` over `conduct_cluster_detail`, plus mutations invalidating both keys.
- `src/lib/conductPatternLabels.ts` — labels for pattern type, metric, operator, status, member record kind; narrative and "review next" builders.
- Pages: `src/pages/conduct/ConductPatterns.tsx`, `src/pages/conduct/ConductPatternDetail.tsx`; panels under `src/components/conduct/patterns/`.
- Verification: typecheck and build only.
