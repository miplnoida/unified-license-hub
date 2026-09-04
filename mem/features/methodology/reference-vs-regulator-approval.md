---
name: Methodology reference approval vs regulator approval
description: Two-layer methodology approval model — MIPL reference approval never counts as regulator or customer approval; reference-approved versions stay DRAFT
type: feature
---

Supervisory methodology content has two distinct approval layers, and they must
never be conflated:

1. **MIPL reference approval** — the platform methodology owner approves a
   reference design. Recorded in `supervisory_methodology_reference_decision`
   with `approval_scope = 'MIPL_REFERENCE_APPROVAL'`. Produces a **DRAFT**
   methodology version only.
2. **Regulator approval** — the adopting regulator's decision. Required before a
   version may move to REVIEW/APPROVED/ACTIVE or be used in any assessment.

Rules:
- `supervisory_methodology_reference_decision_record` refuses any payload with
  `REGULATOR_APPROVAL` or `CUSTOMER_POLICY_APPROVAL` scope.
- A reference row can never carry `regulator_approval_recorded` or
  `customer_adoption_recorded` (table constraint).
- Reference approval never sets a materiality value, band, weight or threshold —
  those stay `UNAPPROVED` with no value until a regulator calibrates them.
- Generic methodology registers (all domain-neutral, prudential included):
  `supervisory_methodology_semantic_profile`, `_fact_requirement`,
  `_question_fact`, `_parameter`, `_reference_decision`, plus extended
  descriptive columns on `supervisory_methodology_question`.
- The AML-CFT-RBA v1.1 draft is rebuilt only by
  `scripts/aml/build-aml-v11-reference-draft.py` → generated SQL → governed RPCs;
  never hand-edited.
