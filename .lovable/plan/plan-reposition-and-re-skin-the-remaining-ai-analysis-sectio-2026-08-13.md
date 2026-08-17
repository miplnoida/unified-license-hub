# Plan: Reposition and re-skin the remaining AI analysis sections

Presentation-only work. No changes to hooks, edge functions, prompts, RPCs, permissions, decision actions or feature flags — same data, same behaviour, new placement and look. Reuses the existing report kit at `src/components/ai/report/AiReportKit.tsx` already used by the prudential and supervisory panels.

## Current state (confirmed by reading the code)

1. `src/pages/returns-mgmt/PrudentialAnalytics.tsx` renders `AdvisoryAiPanel` (`peer_divergence`) at line 259 — i.e. above the "Peer comparison settings" card and above the "Peer Comparison" chart card that follow it.
2. `src/components/applications/ApplicationAiAssessmentPanel.tsx` (850 lines, mounted from `ApproverDecisionView.tsx`) renders as a plain card: `Alert` intro, decision bar, then three flat `<section>` blocks of headings, `<ul>` bullet lists and `Separator`s, plus a small text footer. It does not use the new report kit.

## What will change

### 1. Prudential Analytics — move the AI section below peer comparison

Relocate the `AdvisoryAiPanel` block so page order becomes: filters -> trend chart -> Peer comparison settings -> Peer Comparison chart -> AI-assisted trend and peer commentary. Props, facts object and staleness inputs are moved verbatim.

### 2. Prudential Analytics AI visuals

The panel already composes the report kit; on this page it will additionally get a section wrapper consistent with the rest of the page (report-style header strip, "Advisory" badge, produced-at line) so it reads as a report block rather than a loose card — no logic touched.

### 3. Application detail AI analysis — visual upgrade

`ApplicationAiAssessmentPanel` is re-skinned with the same kit so it matches the other AI reports:

- Report header strip: sparkle mark, title, Advisory badge, confidence/model chips, produced-at line.
- Summary/recommendation rendered as a highlighted lead callout instead of a plain `Alert`.
- The three flat sections (findings by severity, section-status list, routing/evidence) become kit `AiReportSection` blocks with a coloured left rail per tone and one finding per row with severity marker and evidence chips.
- "What this is based on" evidence stays collapsible, restyled as chips.
- Footer (model, generated at, fingerprint, feedback) moves into the kit meta row.
- Loading, pending, stale-pending and error states use the kit skeleton/empty-state styling instead of bare sentences.

Unchanged: `AnalystDecisionBar`, `AIRoutingDecisionActions`, retry generation, stale reconciliation, all mutations and permission gates — only their surrounding markup and classes change.

## Technical notes

- Files touched: `src/pages/returns-mgmt/PrudentialAnalytics.tsx` (move one JSX block), `src/components/applications/ApplicationAiAssessmentPanel.tsx` (markup swap), and possibly small additions to `src/components/ai/report/AiReportKit.tsx` if a tone/variant is missing.
- Styling only via existing semantic tokens (`primary`, `muted`, `warning`, `destructive`, `success`) — light/dark safe, no hardcoded colours.
- Verification: open Prudential Analytics and confirm the AI commentary now sits after the peer comparison chart and still generates/refreshes; open an application detail Decision view and confirm findings, routing actions, retry and analyst decision behave exactly as before.
