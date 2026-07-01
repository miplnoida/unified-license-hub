In `src/pages/licenses/LicenseDetail.tsx`:

1. Rename the "Signed Certificate" button label (line ~713) to "Download Certificate".
2. Remove the "Regenerate Certificate" button (lines ~716–718) and its surrounding wrapper if it becomes empty.
3. Remove the now-unused `regenerateCertificate` function (lines ~647+) and any imports only it uses.

No other files or behavior changes.