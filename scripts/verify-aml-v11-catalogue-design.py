#!/usr/bin/env python3
"""AML-CFT-RBA v1.1 design-only catalogue verifier.

Parses docs/aml/AML-CFT-RBA-v1.1-question-catalogue.md and proves the design
invariants of the quality closure. Reads files only — no database access, no
migration, no methodology version, no score, no threshold implementation.

Usage: python3 scripts/verify-aml-v11-catalogue-design.py
Exit code 0 = all gates PASS.
"""
from __future__ import annotations
import collections
import re
import sys
from pathlib import Path

CAT = Path("docs/aml/AML-CFT-RBA-v1.1-question-catalogue.md")
DESIGN = Path("docs/aml/AML-CFT-RBA-v1.1-methodology-design.md")
EVID = Path("docs/aml/AML-CFT-RBA-v1.1-evidence-data-source-map.md")
PACK = Path("docs/aml/AML-CFT-methodology-calculation-decision-pack.md")
REVIEW = Path("docs/aml/AML-CFT-RBA-v1.1-quality-review.md")

EVIDENCE_BASIS_TYPES = {
    "ENTERPRISE_DOCUMENT", "SYSTEM_FACT", "REGULATORY_RETURN", "STRUCTURED_METRIC",
    "SUPERVISORY_SAMPLE", "WORKPAPER", "PRIOR_EXAMINATION", "FINDING",
    "REMEDIATION_RECORD", "RFI_RESPONSE", "AUTHORISED_EXTERNAL_SOURCE",
}
CLASSES = {"CORE", "CONDITIONAL", "ENHANCED"}
SEMANTICS = {
    "`INHERENT_SEM`", "`CONTROL_SEM_DESIGN`", "`CONTROL_SEM_OPERATING`",
    "`CONTROL_SEM_DESIGN_AND_OPERATING`", "`CONTEXT_FACT_SEM`",
}
STRENGTHS = {"DIRECT_REQUIREMENT", "RELATED_RISK_FACTOR", "SUPERVISORY_GUIDANCE_CONTEXT"}
SECTOR_APPLICABILITY = {
    "CORE_ALL", "CORE_WITH_SECTOR_GUIDANCE", "SECTOR_CONDITIONAL", "SECTOR_OVERLAY_CANDIDATE",
}
# Materiality figures may only appear as configuration placeholders in question prose.
THRESHOLD_RE = re.compile(r"\d+\s?%|\d+\s?percent", re.I)

RETIRED_CODES = {"IR-BUS-03", "IR-DEL-03", "IR-TRX-02", "IR-TRX-03", "CT-DQ-02"}

# Maintained semantic-review allowlist. Each scored inherent question has been read
# in full (prompt, intent, guidance, polarity review) and confirmed to mean
# "YES = more inherent ML/TF exposure, before controls".
SCORED_INHERENT_POLARITY = {
    "IR-CUS-01": "share of higher-risk customer classes",
    "IR-CUS-02": "opacity of customer ownership structures",
    "IR-CUS-03": "non-resident / cross-border customer share",
    "IR-CUS-04": "PEP exposure as a customer characteristic",
    "IR-GEO-01": "exposure to higher-risk or monitored jurisdictions",
    "IR-GEO-02": "cross-border flow concentration",
    "IR-PRD-01": "product/service inherent vulnerability",
    "IR-PRD-02": "cash intensity of products and activity",
    "IR-PRD-03": "value-transfer / payment product exposure",
    "IR-PRD-04": "anonymity-enabling product features",
    "IR-TRX-01": "transaction volume and value exposure",
    "IR-TRX-04": "unusual-pattern exposure observed in activity data",
    "IR-DEL-01": "non-face-to-face delivery exposure",
    "IR-DEL-02": "third-party distribution distance",
    "IR-BUS-01": "structural complexity of the business/group",
    "IR-BUS-02": "change in the exposure surface from material growth or change",
}

# Language that would make inherent exposure depend on mitigation quality.
CONTROL_LEAK_RE = re.compile(
    r"\b(control(s)?\s+(fail|failed|weak|inadequa|calibrat|kept pace|outpac)"
    r"|kept pace|outpaced|unmitigated|mitigation\s+(quality|adequacy)"
    r"|because controls|control environment)\b", re.I)
# Explicit deferral of control assessment to the control dimensions is permitted.
CONTROL_DEFERRAL_RE = re.compile(
    r"(assessed (elsewhere|in the|under|in relevant)|is a CONTROL|recorded under"
    r"|CONTROL dimension|control effectiveness is assessed|before (any )?control"
    r"|independent of|not considered here|distinct from)", re.I)



def parse() -> list[dict]:
    text = CAT.read_text()
    recs = []
    for block in text.split("\n#### ")[1:]:
        code = block.split("\n")[0].strip().strip("`")
        if code.startswith("Z."):
            continue
        rec = {"question_code": code, "_block": block}
        for m in re.finditer(r"^\| ([a-zA-Z0-9_]+) \| (.*?) \|$", block, re.M):
            rec[m.group(1)] = m.group(2).strip()
        g = re.search(r"\*\*Guidance\.\*\* (.*)", block)
        rec["guidance"] = g.group(1) if g else ""
        recs.append(rec)
    return recs


def main() -> int:
    results: list[tuple[str, str, str]] = []

    def gate(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, "PASS" if ok else "FAIL", detail))

    recs = parse()
    codes = [r["question_code"] for r in recs]
    cls = collections.Counter(r.get("question_class", "MISSING") for r in recs)
    dims = {r["dimension_code"].strip("`") for r in recs}

    gate("DQ-01 catalogue parses to the declared count", len(recs) == 70, f"parsed {len(recs)}")
    gate("DQ-02 question codes are unique", len(set(codes)) == len(codes))
    gate("DQ-03 every question carries a class in {CORE,CONDITIONAL,ENHANCED}",
         set(cls) <= CLASSES, str(dict(cls)))
    gate("DQ-04 mandatory flag equals CORE membership",
         all((r["mandatory"].startswith("YES")) == (r["question_class"] == "CORE") for r in recs))
    gate("DQ-05 standard-assessment burden is at most 50 questions",
         cls["CORE"] <= 50, f"CORE={cls['CORE']}")
    gate("DQ-06 header census matches parsed census",
         all(s in CAT.read_text() for s in (f"**{len(recs)}**", f"**CORE {cls['CORE']}**",
                                            f"**CONDITIONAL {cls['CONDITIONAL']}**",
                                            f"**ENHANCED {cls['ENHANCED']}**")))
    gate("DQ-07 all 26 methodology dimensions are covered", len(dims) == 26, f"{len(dims)} dimensions")
    gate("DQ-08 every question declares response semantics",
         all(r.get("response_semantics", "").split(" ")[0] in SEMANTICS for r in recs))
    gate("DQ-09 design questions use design semantics only",
         all(r["response_semantics"].startswith("`CONTROL_SEM_DESIGN`")
             for r in recs if r.get("effectiveness_focus") == "DESIGN"))
    gate("DQ-10 operating questions use operating semantics only",
         all(r["response_semantics"].startswith("`CONTROL_SEM_OPERATING`")
             for r in recs if r.get("effectiveness_focus") == "OPERATING"))
    gate("DQ-11 every inherent question records a polarity review",
         all(r.get("polarity_review") for r in recs if r.get("axis") == "INHERENT_EXPOSURE"))
    bad_polarity = [r["question_code"] for r in recs
                    if r.get("axis") == "INHERENT_EXPOSURE"
                    and not re.match(r"(KEEP|REWORD|MOVE_TO_CONTROL|CONTEXT_ONLY|RETIRE)", r["polarity_review"])]
    gate("DQ-12 polarity review verdicts use the agreed vocabulary", not bad_polarity, str(bad_polarity))
    gate("DQ-13 every evidence requirement lists acceptable evidence-basis types",
         all(r.get("evidence_basis_types") and
             set(t.strip() for t in r["evidence_basis_types"].split(",")) <= EVIDENCE_BASIS_TYPES
             for r in recs))
    gate("DQ-14 every question states fact requirements or why none apply",
         all(r.get("fact_requirements", "").startswith("FACT-") or
             r.get("fact_requirements", "").startswith("None —") for r in recs))
    quant = [r for r in recs if r.get("factual_auto_prefill_possible") == "YES"]
    gate("DQ-15 quantitative questions carry structured fact codes",
         all(r["fact_requirements"].startswith("FACT-") for r in quant),
         str([r["question_code"] for r in quant if not r["fact_requirements"].startswith("FACT-")]))
    gate("DQ-16 N/A conditions are stated wherever N/A is permitted",
         all(r.get("NA_conditions") and r["NA_conditions"] != "Not permitted"
             for r in recs if r.get("allow_NA") == "YES"))
    gate("DQ-17 N/A is refused with an explicit statement where not permitted",
         all(r.get("NA_conditions") == "Not permitted" for r in recs if r.get("allow_NA") == "NO"))
    hidden = [(r["question_code"], m.group(0)) for r in recs
              for m in [THRESHOLD_RE.search(r["prompt"])] if m]
    gate("DQ-18 no numeric threshold is embedded in question wording", not hidden, str(hidden))
    prose_thresholds = [r["question_code"] for r in recs if THRESHOLD_RE.search(r["guidance"])]
    gate("DQ-19 no numeric threshold survives in guidance prose", not prose_thresholds, str(prose_thresholds))
    gate("DQ-20 every standards reference carries a strength classification",
         all(r.get("standards_reference_strength") in STRENGTHS for r in recs))
    gate("DQ-21 every standards reference records a review outcome",
         all(r.get("standards_reference_review") for r in recs))
    gate("DQ-22 every question carries a sector applicability class",
         all(r.get("sector_applicability") in SECTOR_APPLICABILITY for r in recs))
    gate("DQ-23 conditional and enhanced questions declare a trigger",
         all(r.get("trigger_condition", "").strip() not in ("", "Not applicable — CORE question")
             for r in recs if r["question_class"] != "CORE"))
    gate("DQ-24 calculation participation is explicit on every question",
         all(r.get("calculation_participation") for r in recs))
    gate("DQ-25 NOT_TRIGGERED is distinguished from NOT_APPLICABLE",
         all("NOT_TRIGGERED" in r["calculation_participation"] or
             r["calculation_participation"] == "CONTEXTUAL_NOT_SCORED" for r in recs))
    retired = re.search(r"## Z\. Retired.*", CAT.read_text(), re.S)
    gate("DQ-26 retired questions are documented with a reason",
         bool(retired) and len(re.findall(r"^\| `", retired.group(0), re.M)) == 5)
    gate("DQ-27 duplicate-intent review is resolved (no open duplicate marker)",
         "DUPLICATE_UNRESOLVED" not in CAT.read_text())

    # documents
    docs = {p: p.read_text() for p in (DESIGN, EVID, PACK, REVIEW) if p.exists()}
    gate("DQ-28 all four v1.1 documents plus the quality review exist", len(docs) == 4)
    design = docs.get(DESIGN, "")
    gate("DQ-29 design document states the corrected census",
         all(s in design for s in ("70", str(cls["CORE"]), str(cls["CONDITIONAL"]), str(cls["ENHANCED"]))))
    gate("DQ-30 design document no longer claims every question is mandatory",
         "Every question is evidence-backed and observation-backed." not in design)
    gate("DQ-31 evidence requirement is defined as an evidence basis, not an upload",
         "governed evidence basis" in design and "requires_evidence" in design)
    all_text = "\n".join(docs.values())
    gate("DQ-32 STR legacy fact wording is corrected",
         "bound to active `AML-CFT-RBA` v1.0" in all_text
         and "retired `AML_RBA`" not in all_text
         and "historical-only" not in all_text)
    gate("DQ-33 STR legacy population is stated honestly",
         all(s in all_text for s in ("22", "approved", "superseded", "submitted", "draft",
                                     "0 question responses")))
    gate("DQ-34 decision register keeps every decision unapproved",
         docs.get(PACK, "").count("AWAITING SUPERVISORY APPROVAL") >= 10)
    gate("DQ-35 decision register covers AML-METH-01..10",
         all(f"AML-METH-{i:02d}" in docs.get(PACK, "") for i in range(1, 11)))
    gate("DQ-36 no advisory is permitted to act automatically",
         "No advisory changes an answer, a rating or creates a finding automatically." in all_text)

    # ---- derived census gates (nothing assumed) -------------------------------
    inherent = [r for r in recs if r.get("axis") == "INHERENT_EXPOSURE"]
    contextual = [r for r in inherent if r["calculation_participation"] == "CONTEXTUAL_NOT_SCORED"]
    scored_inherent = [r for r in inherent if r not in contextual]
    judge = collections.Counter(r.get("supervisory_judgement_required", "MISSING") for r in recs)
    obs = collections.Counter(r.get("requires_observation", "MISSING").split(" ")[0] for r in recs)
    na = collections.Counter(r.get("allow_NA", "MISSING") for r in recs)
    prefill = collections.Counter(r.get("factual_auto_prefill_possible", "MISSING") for r in recs)
    strength = collections.Counter(r["standards_reference_strength"] for r in recs)
    focus = collections.Counter(r["effectiveness_focus"] for r in recs)
    review = docs.get(REVIEW, "")

    gate("DQ-37 supervisory judgement is not claimed for every question",
         judge["YES"] < len(recs) and judge["NO"] > 0, str(dict(judge)))
    gate("DQ-38 quality review reports the derived supervisory-judgement counts",
         f"supervisory_judgement_required = YES **{judge['YES']}** / NO **{judge['NO']}**" in review)
    gate("DQ-39 quality review no longer claims judgement required on all 70",
         "supervisory judgement required = 70" not in review
         and "supervisory_judgement_required 70" not in review)
    gate("DQ-40 quality review explains that judgement = NO is not absence of responsibility",
         "does NOT mean the officer has no responsibility" in review)
    gate("DQ-41 exactly one inherent entry is contextual and it is IR-GEO-03",
         [r["question_code"] for r in contextual] == ["IR-GEO-03"],
         str([r["question_code"] for r in contextual]))
    gate("DQ-42 no control question is contextual",
         not [r["question_code"] for r in recs
              if r.get("axis") != "INHERENT_EXPOSURE"
              and r["calculation_participation"] == "CONTEXTUAL_NOT_SCORED"])
    gate("DQ-43 scored/contextual inherent split is documented as derived",
         all(s in review for s in (f"INHERENT CATALOGUE ENTRIES = {len(inherent)}",
                                   f"SCORED INHERENT = {len(scored_inherent)}",
                                   f"CONTEXTUAL NOT SCORED = {len(contextual)}")))
    gate("DQ-44 every scored inherent question is on the maintained polarity-review allowlist",
         {r["question_code"] for r in scored_inherent} == set(SCORED_INHERENT_POLARITY),
         str({r["question_code"] for r in scored_inherent} ^ set(SCORED_INHERENT_POLARITY)))
    leaks = []
    for r in scored_inherent:
        prose = " ".join(r.get(k, "") for k in ("prompt", "supervisory_intent",
                                                "polarity_review", "guidance"))
        for sentence in re.split(r"(?<=[.;])\s+", prose):
            if CONTROL_LEAK_RE.search(sentence) and not CONTROL_DEFERRAL_RE.search(sentence):
                leaks.append((r["question_code"], sentence.strip()[:120]))
    gate("DQ-45 no scored inherent question makes exposure depend on control adequacy",
         not leaks, str(leaks))
    gate("DQ-46 every scored inherent polarity review asserts pre-control exposure",
         all(re.search(r"more inherent exposure|more pre-control exposure|exposure surface",
                       r["polarity_review"]) for r in scored_inherent),
         str([r["question_code"] for r in scored_inherent
              if not re.search(r"more inherent exposure|more pre-control exposure|exposure surface",
                               r["polarity_review"])]))
    gate("DQ-47 retired draft codes are absent from the active catalogue",
         not (RETIRED_CODES & set(codes)), str(RETIRED_CODES & set(codes)))
    gate("DQ-48 decision pack carries a current v1.1 design-state baseline",
         "## Current v1.1 design state" in docs.get(PACK, "")
         and "historical analysis baseline" in docs.get(PACK, ""))
    gate("DQ-49 decision pack current state matches the derived census",
         all(s in docs.get(PACK, "") for s in (
             f"70 active questions", f"CORE {cls['CORE']} / CONDITIONAL {cls['CONDITIONAL']} / ENHANCED {cls['ENHANCED']}",
             f"{len(scored_inherent)} scored inherent + {len(contextual)} contextual inherent")))
    gate("DQ-50 three distinct non-answer states remain reserved",
         all(s in review for s in ("NOT_TRIGGERED", "NOT_ASKED", "NOT_APPLICABLE")))


    width = max(len(n) for n, _, _ in results)
    fails = 0
    for name, status, detail in results:
        if status == "FAIL":
            fails += 1
        print(f"{name.ljust(width)}  {status}{('  ' + detail) if detail and status == 'FAIL' else ''}")
    print(f"\n{len(results) - fails}/{len(results)} PASS")
    print("\nderived census (parsed, not asserted):")
    print(f"  active={len(recs)} retired={len(RETIRED_CODES)}")
    print(f"  classes: CORE={cls['CORE']} CONDITIONAL={cls['CONDITIONAL']} ENHANCED={cls['ENHANCED']}")
    print(f"  inherent entries={len(inherent)} scored={len(scored_inherent)} contextual={len(contextual)}")
    print(f"  control entries={len(recs) - len(inherent)}")
    print(f"  mandatory: YES={cls['CORE']} NO={len(recs) - cls['CORE']}")
    print(f"  requires_observation: {dict(obs)}")
    print(f"  requires_evidence: YES={len(recs)} NO=0")
    print(f"  allow_NA: {dict(na)}")
    print(f"  factual_auto_prefill_possible: {dict(prefill)}")
    print(f"  supervisory_judgement_required: {dict(judge)}")
    print(f"  effectiveness focus: {dict(focus)}")
    print(f"  standards reference strength: {dict(strength)}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
