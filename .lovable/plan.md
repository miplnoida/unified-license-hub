# Fix empty "Security Verification" box

## What we know

The active configuration is a reCAPTCHA v2 (checkbox) provider with a site key, and CAPTCHA is on. The widget now renders its frame with an empty area inside and no error text — so `CaptchaWidget` reached the render stage but the reCAPTCHA checkbox never appeared.

The root cause is not yet confirmed. Two candidates, both consistent with "frame present, no checkbox, no error":

1. **Render throws silently.** In the v2 path the render call runs inside `grecaptcha.ready(render)`, which is outside the promise chain, so any exception there is never caught and no message is shown. The effect's cleanup also resets the widget guard to `null` without telling reCAPTCHA to reset, so a second effect run (StrictMode double-mount, or a new `config` object identity from the query) wipes the container with `innerHTML = ''` and calls `render` on an element reCAPTCHA still considers rendered — which throws and leaves the box blank.
2. **Key type / domain mismatch.** The configured key is not valid for this domain, or the key does not match the provider selected in settings. The widget must keep honouring whatever the admin configures (v2, v3, hCaptcha, Turnstile) — nothing gets hardcoded to one provider; it only needs to report clearly when the configured pair is rejected.

## Plan

1. **Verify first.** Load the registration page in a headless browser, capture console errors and the reCAPTCHA network calls, and screenshot the widget area. This tells us which of the two causes is real (an "already been rendered" / "Invalid site key" / "Invalid domain" message is decisive).
2. **Fix the render lifecycle** in `src/components/shared/CaptchaWidget.tsx`, provider-agnostically (same code path for v2, hCaptcha and Turnstile; v3 path untouched):
   - Wrap the checkbox-provider `render` call in try/catch and surface a real error instead of a silent blank box.
   - On cleanup, call the provider's `reset`/`remove` for the stored widget id before clearing the guard, so remounts re-render cleanly.
   - Stabilise the effect dependency on the config's identifying fields (id, provider, site key) instead of the whole object, so a refetch doesn't force a re-render of the challenge.
   - Show a clear, actionable error when the provider reports an invalid key or domain.
3. **If the cause is the key**, report exactly what the provider said and what needs changing in the CAPTCHA settings (the domains registered with the key). The widget stays driven purely by the active configuration — currently reCAPTCHA v2 — and no code change can substitute for a key valid on this domain.
4. **Re-verify** on the registration page with the configured provider: challenge visible, passing it shows "Verification complete.", and navigating away and back re-renders it without error.

## Notes

No change to the verification contract: the provider token is still exchanged via `manage-captcha` for a single-use verification id, and there is still no checkbox fallback.
