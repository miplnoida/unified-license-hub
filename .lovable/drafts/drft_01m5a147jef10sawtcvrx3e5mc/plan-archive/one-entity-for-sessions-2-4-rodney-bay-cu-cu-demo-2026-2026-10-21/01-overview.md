## One entity for Sessions 2–4: Rodney Bay CU (CU-DEMO-2026)

Every new record links to Rodney Bay's existing registry ID `cc331000-0000-4000-8000-000000000001`.
- No new entities. The Castries and Gros Islet entities are dropped.
- Registration and Entity Resolution are not restarted.
- Every record is tagged `CU-DEMO-2026` and inserted only if it doesn't already exist.

### Licence dependency check (confirmed from the table structure)
| Feature | Needs a licence? | Effect |
|---|---|---|
| Licence conditions | **Yes** (licence is required) | Blocked |
| Regulatory returns | Optional licence link | Can be created against the entity; return due dates may follow the licence (checked before insert) |
| Prudential assessments | Entity only | OK, kept in draft/review |
| Supervisory plans | Entity, licence optional | OK |
| Examinations and findings | Entity only | OK |
| Complaints | Licensee, licence holder optional | OK |
| Conduct investigations and findings | Entity or licensee | OK |
| Enforcement referrals | Checked before insert | TBC |

**Why there is no licence:** a licence can only come from the governed approval path. That path needs:
- an approved registration hand-off (Rodney Bay has none)
- a Credit Union fee
- a Credit Union approval workflow

None exist, so the licence, its conditions, the application approval and payment are **reported as blockers, not faked**.

The Licensing session can only show the parts that already exist: entity, people, F&P cases and documents. **No draft application can be created**, because the existing rule requires the hand-off.
