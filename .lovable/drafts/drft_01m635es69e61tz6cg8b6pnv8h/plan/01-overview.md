# Application Status – "In Progress" after Submission Fix

## What is happening (APP-2026-000163)

Checked against the real records:

1. 12:43: the applicant saved the form. Status went from **draft** to **in_progress**. Here "in_progress" means "draft being filled".
2. 12:46: the applicant submitted. Status became **submitted**.
3. 12:57 and 12:58: the regulator took two workflow actions (comment/forward, then approve). The workflow engine moved the application to the next step and set the status back to **in_progress**. Here "in_progress" means "under regulator review".
4. The page then showed "In Progress", and it also re-opened editing. The detail page, list actions, dashboards and the server-side draft save all treat "in_progress" as an applicant draft that can still be edited.

**Root cause:** one status value, `in_progress`, has two meanings: "applicant is still filling" and "regulator is reviewing". The workflow step-transition function writes it whenever an application moves to the next review step. Every editability check then reads it as editable. The one reliable way to tell the two apart is the submission time: a submitted application always has it set.

Current data: 5 applications are `in_progress`. 4 are real drafts (never submitted). 1 is under review (this one).
