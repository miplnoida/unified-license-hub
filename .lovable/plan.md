## Fix tab value mismatch in ApplicationDetail

**File:** `src/pages/applications/ApplicationDetail.tsx`

**Change (line 852):**
```diff
- onJumpToFormsTab={() => setActiveTab('forms')}
+ onJumpToFormsTab={() => setActiveTab('form')}
```

The Submitted Forms `TabsTrigger` (line 595) and `TabsContent` (line 665) both use `value="form"`, but the callback was passing `'forms'`, so clicking "View full responses" in the Decision-Ready Summary did nothing.

**Verification:**
- Run `tsgo --noEmit` to confirm it still compiles.
- Confirm the callback string matches the `TabsTrigger`/`TabsContent` value (`form`).

No other files or behaviors touched.