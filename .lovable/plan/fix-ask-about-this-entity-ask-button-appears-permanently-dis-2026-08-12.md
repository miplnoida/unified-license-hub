# Fix "Ask about this entity" — Ask button appears permanently disabled

## What's happening

On the entity profile, the "Ask about this entity" card renders its **Ask** button in the card header, while the question box sits lower down in the card body. The button is intentionally disabled until a question has been typed (`askable && !question.trim() && !hasContent` in `src/components/ai/SupervisoryAiPanel.tsx`), but nothing on screen says so — so it reads as broken, and the question box below it looks unrelated.

## What to change (UI only)

1. **Put the Ask action next to the question box.** For askable panels, hide the header button and render the question textarea with an inline **Ask** button directly beneath/beside it, so typing and asking are one visual step.
2. **Explain the disabled state.** While the box is empty, show a short hint ("Type a question to ask") and a tooltip on the disabled button instead of a silent grey button.
3. **Support keyboard submit.** Ctrl/Cmd+Enter in the textarea triggers the same action.
4. **Ask again rather than "Refresh".** When an answer already exists on an askable panel, the action stays "Ask" and requires a non-empty question, instead of switching to a generic "Refresh analysis" that re-runs the previous question. Show the question that produced the visible answer above it so the answer has context.
5. **Keep non-askable panels unchanged** — they continue to use the header Generate/Refresh button exactly as today.

## Notes

- Change is confined to `src/components/ai/SupervisoryAiPanel.tsx` (presentation and enablement logic). No edge function, permission, caching, fingerprint or fact-assembly change.
- If, after this, the Ask action fires but returns nothing, that is a separate backend path (`generate-supervisory-ai-analysis`, `supervisory_query` branch) and will be diagnosed separately.
