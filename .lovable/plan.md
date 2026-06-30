# Fix: Digital signature box not accepting strokes

## Problem
On the application detail page, when a workflow action requires a digital signature, the signature canvas appears but the user cannot draw in it.

## Root cause
`WorkflowActionPreviewDialog.tsx` initializes the canvas inside a `useEffect` that depends only on `[open, requireSignature]`. The effect runs immediately when the dialog opens, but at that moment Radix's `DialogContent` is still animating in and `canvas.offsetWidth` / `offsetHeight` are `0`. The code then sets:

```
canvas.width  = canvas.offsetWidth  * dpr   // → 0
canvas.height = canvas.offsetHeight * dpr   // → 0
```

A zero-sized backing buffer means strokes have nowhere to render, and pointer events on a 0×0 drawable surface produce no visible ink. The effect never re-runs after layout settles, so the canvas stays unusable for the lifetime of the dialog.

## Fix (scoped, presentation-layer only)
Edit only `src/components/applications/WorkflowActionPreviewDialog.tsx`:

1. Extract the canvas init (size, white fill, stroke style) into a small `initCanvas()` helper that reads the current `offsetWidth/offsetHeight` and bails when either is `0`.
2. Replace the one-shot init with a `ResizeObserver` on the canvas element so `initCanvas()` runs the first time the canvas actually has non-zero dimensions (and again if the dialog is resized). Preserve any already-drawn ink across resizes by snapshotting `toDataURL()` before resize and re-drawing via `drawImage` after, so the in-progress signature is not lost.
3. Keep pointer event registration as-is, but only attach handlers after the first successful init so early `pointerdown` events on a 0×0 canvas are ignored cleanly.
4. Leave everything else untouched: `signatureDataUrl` state, `sigHasInk`, `clearSignature`, `handleConfirm`, `signatureMissing` gating, props, parent wiring in `WorkflowPanel.tsx`, and the edge-function signature persistence path.

## Out of scope (do NOT change)
- `WorkflowPanel.tsx`, `perform-workflow-action`, `perform_workflow_transition` RPC.
- Signature storage / audit record format.
- Renewal flow, notifications, RLS, or any backend SQL.

## Acceptance
- Opening any workflow action that requires a signature renders a usable canvas; strokes appear immediately on first pointer down, even on the first open after a fresh page load.
- `Clear` still resets the canvas and disables `Confirm & Send` until re-signed.
- Confirming sends a non-empty `signature_data_url` to `perform-workflow-action` exactly as before.
- No regression for actions that do not require a signature.
