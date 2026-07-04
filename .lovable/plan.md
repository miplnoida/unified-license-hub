## Goal
Export the existing `docs/DEMO_PRESENTATION_GUIDE_NON_TECHNICAL.md` as both a Word (`.docx`) and PDF file, and deliver them as downloadable artifacts.

## Steps
1. Read the current `docs/DEMO_PRESENTATION_GUIDE_NON_TECHNICAL.md`.
2. Convert it to `.docx` using pandoc (preserves headings, tables, lists — important for the 57-step script and the coverage matrix).
3. Convert the `.docx` to `.pdf` using LibreOffice headless (keeps table layout consistent with the Word version).
4. Save both files to `/mnt/documents/`:
   - `/mnt/documents/DEMO_PRESENTATION_GUIDE_NON_TECHNICAL.docx`
   - `/mnt/documents/DEMO_PRESENTATION_GUIDE_NON_TECHNICAL.pdf`
5. QA the PDF by rendering each page to an image and visually inspecting for clipped tables, overflowing rows in the coverage matrix, broken headings, or blank pages. Fix and re-render if issues appear.
6. Present both files with `<presentation-artifact>` tags so the user can preview/download.

## Notes
- No application code changes. Guide content is not modified — only reformatted.
- If the wide coverage matrix overflows PDF page width, switch that section (or the whole PDF) to landscape and re-render.
