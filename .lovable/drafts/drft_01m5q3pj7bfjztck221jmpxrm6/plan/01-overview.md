## "Invalid token" in the Lovable preview

## What I checked
- The text "Invalid token" does not appear anywhere in the app's own code, so the app is not what shows it.
- The sign-in system has recorded no invalid-token errors.
- My last changes were one small page-forwarding fix and one registration record. Neither touches sign-in.
- Lovable has an ongoing platform incident: "Chat and project changes are currently failing for some users" (https://status.lovable.dev). That is the most likely cause of a preview-only problem.

Ctrl+F5 reloads the page but keeps your saved sign-in, so a stale session would survive it.

## Steps
1. You: sign out and sign back in, or open the preview in a private window. If the message goes away, it was a stale session and nothing else is needed.
2. If it stays: check the live site. If the live site works, wait for the platform incident to clear, because your app and data are very likely fine.
3. If it still shows after the incident clears, I will open the preview while signed in, capture the failing request and fix the cause. I won't change any code or data before that.
