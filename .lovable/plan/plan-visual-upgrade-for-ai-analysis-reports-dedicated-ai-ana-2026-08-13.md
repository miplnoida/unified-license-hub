# Plan: Visual upgrade for AI analysis reports + dedicated "AI Analysis Reports" tab

Purely presentational work. No changes to edge functions, RPCs, hooks, prompts, fingerprinting, permissions or feature flags. Same data, same generate/refresh/feedback behaviour — new look and a single place to present it.

## Current state (confirmed by reading the code)

Two panels render every AI analysis in the app:

- `src/components/prudential/AdvisoryAiPanel.tsx` (prudential: risk interpretation, trend commentary, EWI, peer, heatmap)
- `src/components/ai/SupervisoryAiPanel.tsx` (examination, enforcement, complaints, conduct, cross-module, executive)

Both output plain stacked text: a paragraph summary, uppercase section captions, and flat `<ul>` bullet lists. On the Prudential 360 profile the panels are scattered — two on Overview, one on Ratios & Trends, one on Peer Comparison — plus others living inside `EwiPanel` and `RiskScoreExplainer`.

## What will change

### 1. Shared report presentation kit (new)

`src/components/ai/report/` — presentation-only building blocks used by both panels:

- `AiReportShell` — report-style header: gradient/tinted header strip, sparkle mark, title, "Advisory" badge, confidence chip, produced-at line, and the action row (Generate / Refresh / feedback) in a consistent place.
- `AiReportSummary` — the summary rendered as a highlighted lead callout instead of a loose paragraph.
- `AiReportSection` — numbered/iconed section block with a coloured left rail per section type (observations, deteriorating, improving, peers, emerging risks, chronology, issues, gaps).
- `AiReportObservation` — one finding per row: severity/neutral marker, readable text, evidence rendered as compact chips.
- `AiReportFocusAreas` — "suggested areas to look at" as a card grid rather than a bullet list.
- `AiReportMeta` — confidence, limitations (collapsible), disclaimer, feedback footer.
- `AiReportEmptyState` / `AiReportSkeleton` — designed empty and loading states replacing the current bare sentences.

All styling via existing semantic tokens (`primary`, `muted`, `warning`, `destructive`, `success`) — no hardcoded colours; light/dark safe.

### 2. Re-skin both panels

`AdvisoryAiPanel` and `SupervisoryAiPanel` keep their exact props, hooks, flags and logic; their JSX is swapped to compose the kit above. `SupervisoryAiPanel` keeps its ask box, copy-draft and flag actions, restyled to match.

### 3. Dedicated "AI Analysis Reports" tab

`src/components/ai/report/AiReportsTab.tsx` — takes a list of report definitions and renders them as a presentation surface: a left-side section index (sticky on desktop) plus stacked, section-by-section report blocks, each block being an existing panel instance.

Mounted as a new tab, without removing the existing in-context panels' functionality:

- `PrudentialEntityProfile.tsx` — new `AI Analysis Reports` tab containing entity supervisory brief, ask-about-entity, risk interpretation, trend commentary and peer divergence. The four inline panels currently on Overview / Ratios / Peers are moved here so the same report is not duplicated in two tabs.
- `ExaminationWorkspace.tsx`, `EnforcementDetail.tsx`, `ComplaintDetail.tsx` — the same new tab collecting that page's panels (examination brief/scope/workpaper/report drafts; case chronology/evidence/precedent/sanction; complaint summary/classification/similar/resolution).
- `ConductDashboard.tsx`, `ConductEntityProfile.tsx`, `ExecutiveSupervisoryDashboard.tsx`, `RiskHeatmap.tsx`, `PrudentialAnalytics.tsx` — no tab shell to add to; panels there just get the new report styling.
- Panels embedded in `EwiPanel.tsx` and `RiskScoreExplainer.tsx` stay where they are (they are tightly coupled to that widget's data) and inherit the new styling.

## Technical notes

- Only files touched: new `src/components/ai/report/*`, the two panel components, and the tab wiring in the five tabbed pages.
- No prop signature changes on `AdvisoryAiPanel` / `SupervisoryAiPanel`, so every other call site keeps working untouched.
- `PRUDENTIAL_ADVISORY_AI_ENABLED` / `SUPERVISORY_ADVISORY_AI_ENABLED` still gate rendering; when off, the new tab renders nothing (tab hidden), as today.
- Verification: open the Prudential 360 profile and the complaint/enforcement/examination detail pages, generate one report, confirm content, feedback and refresh behave exactly as before in the new layout.
