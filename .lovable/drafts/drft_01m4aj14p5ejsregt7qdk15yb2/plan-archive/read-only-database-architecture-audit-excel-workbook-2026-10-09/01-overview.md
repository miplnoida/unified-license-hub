# Read-only database architecture audit — Excel workbook

## Goal
Produce one downloadable Excel workbook that audits every database table and how the app uses it. Nothing in the app, database, migrations, functions or settings is changed.

## Evidence sources (read-only)
- **Database metadata** (SELECT-only queries): tables, columns, primary and foreign keys, unique, check and NOT NULL constraints, indexes, triggers, access policies, grants, row counts, views, functions, and the tables each function body references.
- **Source code**: pages, hooks, services and components under `src/`; `supabase/functions/`; `supabase/migrations/`; `supabase/baseline/`; the route files (`src/App.tsx`, `src/routes/*`); existing architecture and access-control docs.
- **Static scan** of every `.from('<table>')` call with its operation (select, insert, update, upsert, delete), every `.rpc('<fn>')` call, and edge-function usage. Each hit keeps its file:line and is mapped to a page URL through the route files.
- **Indirect usage**: function-to-table references, triggers, views and access-policy helper functions.

## Workbook sheets
Every sheet has filters, frozen headers and consistent formatting.

1. **Summary**: scope, method, overall counts, key findings by severity, and the confidence legend.
2. **Table Inventory**: table, schema, purpose, type (Master, Transaction, Mapping, Configuration, Audit, Staging or Certification), column count, row count, access-policy status, usage summary, evidence, confidence.
3. **Module-Table Mapping**: module, submodule, page URL, file:line, access path (direct, function, edge function, trigger or view), create/read/update/delete flags, evidence.
4. **Relationships**: primary key, foreign key column, parent table, cardinality (from unique constraints), on-delete rule, dependency depth.
5. **Normalization Audit**:
   - 1NF: arrays or JSON storing repeating data.
   - 2NF and 3NF: duplicated or derived attributes, such as names stored next to their ID.
   - Missing constraints: primary keys, foreign keys, unique and NOT NULL rules.
   - Likely-duplicate tables and foreign keys without an index.
6. **Dependency & Impact**: shared tables (used by 3 or more modules), critical tables, legacy candidates and unused candidates, with the impact of modifying or deleting their data.
   - Critical tables include those with the most inbound links, sign-in and access-control tables, and official risk-of-record tables.
7. **Recommendations**: issue, affected tables, severity (Critical, High, Medium or Low), evidence and suggested improvement. These are advice only; none are carried out.
8. **Evidence Log**: the queries and scans used, with timestamps.

## Accuracy rules
- A table is marked "Unused" only when it has zero rows **and** no code, function, trigger, view, policy or edge function references it. Otherwise it is "Unused candidate (unverified)", with the reason.
- Every row carries a confidence value: Verified (metadata plus code), Code-only, Metadata-only or Inferred.
- Purposes and module names taken only from naming are marked Inferred.

## Technical details
- The workbook is generated in `/tmp` with Python (openpyxl and pandas) and saved to `/mnt/documents/database-architecture-audit.xlsx`. No project files are written and no commits are made.
- Database access is limited to SELECT queries on catalog views plus row counts. There are no migrations, writes or state-changing function calls.
- The project has about 760 tables and over 3,600 functions, so the mapping sheet may run to many thousands of rows. Very long cells are shortened, with a pointer to the Evidence Log.

## Deliverable
One workbook attached in chat, with a short summary of the main findings.
