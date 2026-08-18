# Fix "Security verification could not be initialised. Please retry."

## What is happening

The message comes from `CaptchaWidget` in the checkbox-provider path (reCAPTCHA v2 / hCaptcha / Turnstile). It is set when, immediately after the provider script `load` event fires, the widget looks for `window.grecaptcha.render` (or `hcaptcha` / `turnstile`) and does not find it yet.

Two flaws make this fire even though the CAPTCHA itself works:

1. Race on readiness — with `?render=explicit`, the global object can exist (or the `load` event can fire) a tick before `.render` is attached. The widget checks once and gives up. reCAPTCHA exposes `grecaptcha.ready()` for exactly this; the current code never uses it in the v2 path.
2. Sticky error text — the error message is stored in state and never cleared. Once set, it stays under the widget even after a later effect run successfully renders the challenge and verification completes. That is why the user sees a working CAPTCHA with a red error underneath.

A third, related weakness: `loadScript` resolves early only when a previous script tag has `data-loaded="true"`. If a tag was added by an earlier mount and its `load` event already fired before the new listener attached, the promise never settles and the widget silently hangs.

## The fix (frontend only, `src/components/shared/CaptchaWidget.tsx`)

- Wait for real readiness instead of checking once: after the script loads, poll for the provider global's `render` function for a short bounded window (e.g. every 50 ms up to ~5 s), and for reCAPTCHA v2 wrap the render call in `grecaptcha.ready(...)`. Only show the "could not be initialised" error if readiness never arrives.
- Clear `message` whenever a render or verification succeeds, and when the effect re-runs, so stale errors cannot linger under a working widget.
- Make `loadScript` robust: mark a script tag as loaded via a shared promise cache keyed by `src`, so repeated mounts reuse the same promise instead of relying on the `data-loaded` attribute and possibly-missed `load` events.
- Guard against React double-mount / effect re-runs: keep the existing `widgetIdRef` guard but also reset it on unmount so a remount re-renders the challenge instead of skipping it.

No change to the verification contract: the provider token is still exchanged via `manage-captcha` for a single-use verification id, and there is still no checkbox fallback.

## Verification

- Load `/register` with the active provider and confirm the challenge renders with no error text, and that "Verification complete." appears after passing it.
- Toggle between the settings page and the registration page (remount) and confirm the widget re-renders each time without the error.
