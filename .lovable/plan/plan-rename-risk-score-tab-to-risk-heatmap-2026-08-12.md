# Plan: Rename "Risk Score" tab to "Risk Heatmap"

## Change
Rename the tab label in `src/pages/prudential/PrudentialEntityProfile.tsx` (line 301) from `Risk Score` to `Risk Heatmap`.

```diff
- <TabsTrigger value="risk">Risk Score</TabsTrigger>
+ <TabsTrigger value="risk">Risk Heatmap</TabsTrigger>
```

No other logic, routing, or component changes — only the visible tab label.
