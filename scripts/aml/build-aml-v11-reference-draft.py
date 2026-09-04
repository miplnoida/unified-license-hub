#!/usr/bin/env python3
"""
Generate the governed SQL that materialises the AML-CFT-RBA v1.1 DRAFT
methodology version from the approved reference catalogue.

Source of truth : docs/aml/AML-CFT-RBA-v1.1-question-catalogue.md
                  docs/aml/AML-CFT-RBA-v1.1-methodology-design.md (semantics)
                  docs/aml/AML-CFT-methodology-calculation-decision-pack.md (AML-METH-01..10)
Output          : scripts/aml/aml-v11-reference-draft.generated.sql

Nothing is invented here. Every question attribute is copied from the catalogue.
Fact attributes are limited to what the fact code itself determines (data type and
unit by naming convention); every fact row is written with
definition_status = ATTRIBUTES_PENDING because numerator/denominator bases and
source bindings are not yet authored. Materiality parameters are written with no
value and approval_status = UNAPPROVED.
"""
from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "aml"
CATALOGUE = DOCS / "AML-CFT-RBA-v1.1-question-catalogue.md"
PACK = DOCS / "AML-CFT-methodology-calculation-decision-pack.md"
OUT = ROOT / "scripts" / "aml" / "aml-v11-reference-draft.generated.sql"

METHODOLOGY_CODE = "AML-CFT-RBA"
DOMAIN_CODE = "AML_CFT"
NEW_VERSION = "1.1"

# ---------------------------------------------------------------- catalogue --


def parse_catalogue() -> list[dict]:
    spec = importlib.util.spec_from_file_location(
        "aml_v11_verifier", ROOT / "scripts" / "verify-aml-v11-catalogue-design.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.parse()


def clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.replace("`", "").strip()
    if v in {"", "—", "-", "None"}:
        return None
    return v


def first_token(v: str | None) -> str | None:
    v = clean(v)
    return v.split(" ")[0].split("(")[0].strip() if v else None


def yes(v: str | None) -> bool:
    return bool(v) and clean(v).upper().startswith("YES")


def csv_list(v: str | None) -> list[str]:
    v = clean(v)
    if not v:
        return []
    return [x.strip() for x in v.split(",") if x.strip()]


def predecessor_mapping(rec: dict) -> str | None:
    """v1.0 mapping row (the shared parser drops keys containing a dot)."""
    m = re.search(r"^\| v1\.0_mapping \| (.*?) \|$", rec["_block"], re.M)
    return clean(m.group(1)) if m else None


# -------------------------------------------------------------- fact model --

MAT_BY_FACT = {
    "FACT-HRC-SHARE": "MAT_HIGH_RISK_CUSTOMER_SHARE",
    "FACT-HRC-VALUE-SHARE": "MAT_HIGH_RISK_VALUE_SHARE",
    "FACT-CASH-VALUE-SHARE": "MAT_CASH_VALUE_SHARE",
    "FACT-CORRIDOR-TOP1-SHARE": "MAT_CORRIDOR_TOP1_SHARE",
    "FACT-CORRIDOR-TOP3-SHARE": "MAT_CORRIDOR_TOP3_SHARE",
    "FACT-CDE-DEFECT-RATE": "MAT_CDE_DEFECT_RATE",
    "FACT-CUSTOMER-GROWTH-RATE": "MAT_GROWTH_RATE",
    "FACT-VALUE-GROWTH-RATE": "MAT_GROWTH_RATE",
}

MAT_PARAMETERS = [
    ("MAT_HIGH_RISK_CUSTOMER_SHARE", "Higher-risk customer share materiality", "percentage", "%"),
    ("MAT_HIGH_RISK_VALUE_SHARE", "Higher-risk customer value share materiality", "percentage", "%"),
    ("MAT_CASH_VALUE_SHARE", "Cash transaction value share materiality", "percentage", "%"),
    ("MAT_XBORDER_VALUE_SHARE", "Cross-border value share materiality", "percentage", "%"),
    ("MAT_CORRIDOR_TOP1_SHARE", "Largest corridor concentration materiality", "percentage", "%"),
    ("MAT_CORRIDOR_TOP3_SHARE", "Top three corridor concentration materiality", "percentage", "%"),
    ("MAT_GROWTH_RATE", "Customer or value growth-rate materiality", "percentage", "%"),
    ("MAT_CDE_DEFECT_RATE", "Critical data element defect-rate materiality", "percentage", "%"),
]


def fact_attributes(code: str) -> tuple[str | None, str | None]:
    """Data type and unit, determined only by the fact code's own naming convention."""
    if code.endswith(("-SHARE", "-RATE")):
        return "percentage", "%"
    if code.endswith("-VALUE"):
        return "currency", "currency"
    if code.endswith("-DAYS") or code.endswith("-CLOSURE-DAYS") or code.endswith("-LAG-DAYS"):
        return "integer", "days"
    if code.endswith("-DATE"):
        return "date", None
    if code.endswith(("-COUNT", "-VOLUME", "-BACKLOG", "-HITS", "-REPORTS", "-LAYERS", "-FTE",
                      "-OPEN", "-OVERDUE", "-DUE", "-BREACHES")):
        return "integer", "count"
    if code.endswith(("-BANDS", "-MIX", "-CLASS", "-RESULT", "-AGEING")):
        return "structured", None
    if code.endswith(("-BY-SEVERITY",)):
        return "structured", None
    if code.endswith("-RELATIONSHIPS"):
        return "integer", "count"
    if code.endswith("-LAG"):
        return "integer", "days"
    if code.endswith("-INDEX"):
        return "decimal", "index"
    if code.endswith("-PER-1000-CUSTOMERS"):
        return "decimal", "ratio"
    if code.endswith("-MEDIAN-VALUE"):
        return "currency", "currency"
    return None, None


# ------------------------------------------------------- semantic profiles --

SEMANTIC_PROFILES = [
    {
        "semantic_code": "INHERENT_SEM",
        "label": "Inherent exposure",
        "description": "Response meaning for inherent ML/TF exposure questions.",
        "response_meaning": {
            "YES": "The exposure characteristic is present and material to the entity, judged against the materiality criteria in the guidance.",
            "PARTIALLY": "The exposure characteristic exists but is limited, bounded or below the materiality criteria.",
            "NO": "The exposure characteristic is absent or immaterial for the assessment period.",
            "NOT_APPLICABLE": "The underlying activity is genuinely not undertaken in the assessment period (not: unknown, unevidenced or unanswered).",
        },
    },
    {
        "semantic_code": "CONTROL_SEM_DESIGN",
        "label": "Control effectiveness — design",
        "description": "Design-only control question; operating evidence is not required.",
        "response_meaning": {
            "YES": "The control is appropriately designed and proportionate to this entity's risk, nature, size and complexity.",
            "PARTIALLY": "Material design gaps leave residual weakness.",
            "NO": "The control is absent, or so weak in design that it cannot be relied upon.",
            "NOT_APPLICABLE": "The activity the control addresses is genuinely not undertaken, so the control cannot exist.",
        },
    },
    {
        "semantic_code": "CONTROL_SEM_OPERATING",
        "label": "Control effectiveness — operating",
        "description": "Operating-effectiveness control question; period, sample or system evidence is required.",
        "response_meaning": {
            "YES": "The control operated effectively over the relevant period or sample, evidenced by period data, samples or system facts.",
            "PARTIALLY": "Evidenced exceptions in operation leave residual weakness.",
            "NO": "The control is absent, or so weak in operation that it cannot be relied upon.",
            "NOT_APPLICABLE": "The activity the control addresses is genuinely not undertaken, so the control cannot exist.",
        },
    },
    {
        "semantic_code": "CONTROL_SEM_DESIGN_AND_OPERATING",
        "label": "Control effectiveness — design and operating",
        "description": "Both design adequacy and operating effectiveness must hold for a favourable response.",
        "response_meaning": {
            "YES": "The control is appropriately designed and operated effectively over the relevant period or sample.",
            "PARTIALLY": "Material design gaps or evidenced operating exceptions leave residual weakness.",
            "NO": "The control is absent, or so weak in design or operation that it cannot be relied upon.",
            "NOT_APPLICABLE": "The activity the control addresses is genuinely not undertaken, so the control cannot exist.",
        },
    },
    {
        "semantic_code": "CONTEXT_FACT_SEM",
        "label": "Contextual fact",
        "description": "A contextual fact is recorded; no favourable or adverse polarity, never scored.",
        "response_meaning": {
            "RECORDED": "The contextual fact has been recorded with its provenance.",
            "NOT_AVAILABLE": "The contextual fact could not be obtained; the reason is recorded.",
        },
    },
]

# ------------------------------------------------------- reference decisions --


def parse_decisions() -> list[dict]:
    text = PACK.read_text(encoding="utf-8")
    out = []
    blocks = re.split(r"\n### (AML-METH-\d{2}) — ", text)
    for i in range(1, len(blocks), 2):
        code = blocks[i]
        body = blocks[i + 1]
        title = body.split("\n", 1)[0].strip()
        rec = re.search(r"\*\*Recommendation:\*\*(.+?)(?:\n- \*\*|\n\n)", body, re.S)
        decision_text = " ".join((rec.group(1) if rec else body).split())
        out.append(
            {
                "domain_code": DOMAIN_CODE,
                "methodology_code": METHODOLOGY_CODE,
                "methodology_version": NEW_VERSION,
                "decision_code": code,
                "title": title[:400],
                "decision_text": decision_text,
                "rationale": (
                    "Reference design approved by the platform methodology owner (MIPL) for the "
                    "AML-CFT-RBA v1.1 reference catalogue. Reference approval only: it does not "
                    "constitute approval by any regulator and does not authorise use in a live "
                    "supervisory decision until the regulator adopts it."
                ),
                "provenance": {
                    "source_document": "docs/aml/AML-CFT-methodology-calculation-decision-pack.md",
                    "decision_layer": "MIPL_REFERENCE",
                },
            }
        )
    return out


# ------------------------------------------------------------------ builder --


def sql_lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (dict, list)):
        return "$json$" + json.dumps(v, ensure_ascii=False) + "$json$::jsonb"
    return "$lit$" + str(v) + "$lit$"


def main() -> None:
    recs = parse_catalogue()
    assert len(recs) == 70, f"expected 70 catalogue questions, parsed {len(recs)}"

    dims: dict[str, list[dict]] = {}
    attributes: list[dict] = []
    fact_codes: set[str] = set()

    for r in recs:
        dim = clean(r["dimension_code"])
        qcode = clean(r["question_code"])
        qclass = clean(r["question_class"])
        facts = [f for f in csv_list(r.get("fact_requirements")) if f.startswith("FACT-")]
        fact_codes.update(facts)

        dims.setdefault(dim, []).append(
            {
                "question_code": qcode,
                "prompt": clean(r["prompt"]),
                "guidance": clean(r.get("guidance")),
                "mandatory": qclass == "CORE",
                "requires_observation": yes(r.get("requires_observation")),
                "requires_evidence": yes(r.get("requires_evidence")),
                "min_evidence_count": 1,
                "allow_not_applicable": yes(r.get("allow_NA")),
                "na_requires_rationale": yes(r.get("NA_rationale_required")),
            }
        )

        attributes.append(
            {
                "question_code": qcode,
                "axis": clean(r["axis"]),
                "effectiveness_focus": clean(r["effectiveness_focus"]),
                "question_class": qclass,
                "response_semantics_code": first_token(r.get("response_semantics")),
                "calculation_participation": (
                    "CONTEXTUAL_NOT_SCORED"
                    if "CONTEXTUAL_NOT_SCORED" in (clean(r.get("calculation_participation")) or "")
                    else first_token(r.get("calculation_participation"))
                ),
                "trigger_condition": clean(r.get("trigger_condition")),
                "supervisory_intent": clean(r.get("supervisory_intent")),
                "na_conditions": clean(r.get("NA_conditions")),
                "minimum_evidence_note": clean(r.get("minimum_evidence")),
                "evidence_basis_types": csv_list(r.get("evidence_basis_types")),
                "supervisory_judgement_required": yes(r.get("supervisory_judgement_required")),
                "factual_auto_prefill_possible": yes(r.get("factual_auto_prefill_possible")),
                "standards_reference": clean(r.get("standards_reference")),
                "standards_reference_strength": clean(r.get("standards_reference_strength")),
                "standards_reference_review": clean(r.get("standards_reference_review")),
                "sector_classification": clean(r.get("sector_classification")),
                "sector_notes": clean(r.get("sector_notes")),
                "sector_applicability": clean(r.get("sector_applicability")),
                "change_classification": clean(r.get("change_classification")),
                "predecessor_mapping": predecessor_mapping(r),
                "fact_codes": facts,
                "provenance": {
                    "source_document": "docs/aml/AML-CFT-RBA-v1.1-question-catalogue.md",
                    "decision_layer": "MIPL_REFERENCE",
                    "reference_decisions": ["AML-METH-01", "AML-METH-04", "AML-METH-06", "AML-METH-07"],
                    "candidate_data_sources": clean(r.get("candidate_data_sources")),
                    "suggested_evidence_types": clean(r.get("suggested_evidence_types")),
                },
            }
        )

    facts_payload = []
    for code in sorted(fact_codes):
        dt, unit = fact_attributes(code)
        is_ratio = dt == "percentage"
        facts_payload.append(
            {
                "fact_code": code,
                "label": code.replace("FACT-", "").replace("-", " ").title(),
                "data_type": dt,
                "unit": unit,
                "numerator_basis": "REQUIRED_NOT_YET_DEFINED" if is_ratio else None,
                "denominator_basis": "REQUIRED_NOT_YET_DEFINED" if is_ratio else None,
                "period_expectation": "ASSESSMENT_PERIOD",
                "materiality_parameter_code": MAT_BY_FACT.get(code),
                "is_required": False,
                "auto_prefill_allowed": False,
                "officer_edit_allowed": True,
                "attribute_source": "DERIVED_FROM_FACT_CODE_CONVENTION",
                "definition_status": "ATTRIBUTES_PENDING",
                "provenance": {
                    "source_document": "docs/aml/AML-CFT-RBA-v1.1-evidence-data-source-map.md",
                    "decision_layer": "MIPL_REFERENCE",
                },
            }
        )

    params_payload = [
        {
            "parameter_code": code,
            "parameter_kind": "MATERIALITY",
            "label": label,
            "data_type": dt,
            "unit": unit,
            "provenance": {
                "source_document": "docs/aml/AML-CFT-RBA-v1.1-question-catalogue.md",
                "decision_layer": "AWAITING_REGULATOR_CALIBRATION",
            },
        }
        for code, label, dt, unit in MAT_PARAMETERS
    ]

    decisions = parse_decisions()
    assert len(decisions) == 10, f"expected 10 AML-METH decisions, parsed {len(decisions)}"

    L: list[str] = []
    a = L.append
    a("-- GENERATED FILE — do not edit by hand.")
    a("-- Regenerate: python3 scripts/aml/build-aml-v11-reference-draft.py")
    a("-- Creates/refreshes the AML-CFT-RBA v1.1 DRAFT methodology version from the")
    a("-- MIPL reference catalogue, entirely through governed operations.")
    a("\\set ON_ERROR_STOP on")
    a("BEGIN;")
    a("")
    a("DO $guard$ BEGIN")
    a("  IF public.is_production_environment() THEN")
    a("    RAISE EXCEPTION 'refused: reference methodology draft creation is not a production operation';")
    a("  END IF;")
    a("END $guard$;")
    a("")
    a("CREATE TEMP TABLE tmp_dim_questions(dimension_code text PRIMARY KEY, questions jsonb) ON COMMIT DROP;")
    for dim, qs in dims.items():
        a(f"INSERT INTO tmp_dim_questions VALUES ({sql_lit(dim)}, {sql_lit(qs)});")
    a("")
    a("CREATE TEMP TABLE tmp_payload(kind text PRIMARY KEY, payload jsonb) ON COMMIT DROP;")
    a(f"INSERT INTO tmp_payload VALUES ('attributes', {sql_lit(attributes)});")
    a(f"INSERT INTO tmp_payload VALUES ('facts', {sql_lit(facts_payload)});")
    a(f"INSERT INTO tmp_payload VALUES ('parameters', {sql_lit(params_payload)});")
    a(f"INSERT INTO tmp_payload VALUES ('semantics', {sql_lit(SEMANTIC_PROFILES)});")
    a(f"INSERT INTO tmp_payload VALUES ('decisions', {sql_lit(decisions)});")
    a("")
    a(
        """
DO $apply$
DECLARE
  v_actor   uuid;
  v_active  uuid;
  v_draft   uuid;
  v_dim     record;
  v_dim_id  uuid;
  v_n       integer;
  v_total   integer := 0;
BEGIN
  SELECT id INTO v_actor FROM auth.users
   WHERE email = 'super_admin@mishainfotech.com';
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'no methodology administrator identity available';
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_actor::text, 'role', 'authenticated')::text, true);

  SELECT id INTO v_active FROM public.supervisory_methodology
   WHERE code = 'AML-CFT-RBA' AND domain_code = 'AML_CFT' AND status = 'ACTIVE'
   ORDER BY version DESC LIMIT 1;
  IF v_active IS NULL THEN
    RAISE EXCEPTION 'refused: no ACTIVE AML-CFT-RBA version to supersede';
  END IF;

  SELECT id INTO v_draft FROM public.supervisory_methodology
   WHERE code = 'AML-CFT-RBA' AND domain_code = 'AML_CFT' AND version = '1.1';
  IF v_draft IS NULL THEN
    v_draft := public.supervisory_methodology_new_version(
      v_active, '1.1',
      'Create AML-CFT-RBA v1.1 DRAFT to carry the MIPL reference question catalogue; v1.0 remains ACTIVE and structurally frozen.');
    RAISE NOTICE 'created v1.1 DRAFT %', v_draft;
  ELSE
    RAISE NOTICE 'reusing existing v1.1 draft %', v_draft;
  END IF;

  IF (SELECT status FROM public.supervisory_methodology WHERE id = v_draft) <> 'DRAFT' THEN
    RAISE EXCEPTION 'refused: v1.1 is no longer DRAFT; author a further version instead';
  END IF;

  -- Replace the inherited v1.0 question set (no responses exist on a draft version).
  PERFORM public.supervisory_methodology_question_purge(
    v_draft,
    'Replace the inherited v1.0 question set with the approved AML-CFT-RBA v1.1 reference catalogue.');

  -- Reference vocabularies and the quantitative fact contract.
  PERFORM public.supervisory_methodology_semantic_profile_set(
    'AML_CFT', (SELECT payload FROM tmp_payload WHERE kind = 'semantics'));
  PERFORM public.supervisory_methodology_parameter_set(
    v_draft, (SELECT payload FROM tmp_payload WHERE kind = 'parameters'));
  PERFORM public.supervisory_methodology_fact_requirement_set(
    v_draft, (SELECT payload FROM tmp_payload WHERE kind = 'facts'));

  -- Questions, dimension by dimension, through the canonical dimension save.
  FOR v_dim IN
    SELECT t.dimension_code, t.questions, d.*
      FROM tmp_dim_questions t
      JOIN public.supervisory_methodology_dimension d
        ON d.methodology_id = v_draft AND d.dimension_code = t.dimension_code
  LOOP
    v_dim_id := public.supervisory_methodology_dimension_save(v_draft, jsonb_build_object(
      'dimension_code', v_dim.dimension_code,
      'dimension_group', v_dim.dimension_group,
      'dimension_kind', v_dim.dimension_kind,
      'label', v_dim.label,
      'description', v_dim.description,
      'weight', v_dim.weight,
      'evidence_required', v_dim.evidence_required,
      'sort_order', v_dim.sort_order,
      'active', v_dim.active,
      'scoring_guidance', v_dim.scoring_guidance,
      'data_sources', v_dim.data_sources,
      'evidence_requirements', v_dim.evidence_requirements,
      'min_evidence_count', 1,
      'mandatory_questions', v_dim.questions));
    v_total := v_total + jsonb_array_length(v_dim.questions);
  END LOOP;

  IF (SELECT count(*) FROM tmp_dim_questions t
       WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_dimension d
                          WHERE d.methodology_id = v_draft
                            AND d.dimension_code = t.dimension_code)) > 0 THEN
    RAISE EXCEPTION 'refused: the catalogue references a dimension that does not exist in v1.1';
  END IF;

  v_n := public.supervisory_methodology_question_attributes_set(
    v_draft, (SELECT payload FROM tmp_payload WHERE kind = 'attributes'));
  RAISE NOTICE 'questions written %, attributes applied %', v_total, v_n;

  PERFORM public.supervisory_methodology_reference_decision_record(
    (SELECT payload FROM tmp_payload WHERE kind = 'decisions'));

  IF (SELECT count(*) FROM public.supervisory_methodology_question
       WHERE methodology_id = v_draft AND active) <> 70 THEN
    RAISE EXCEPTION 'refused: v1.1 does not carry exactly 70 active questions';
  END IF;
END $apply$;
""".strip()
    )
    a("")
    a("COMMIT;")
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"dimensions={len(dims)} questions={sum(len(v) for v in dims.values())} "
          f"facts={len(facts_payload)} parameters={len(params_payload)} decisions={len(decisions)}")


if __name__ == "__main__":
    main()
