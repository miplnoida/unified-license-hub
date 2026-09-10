# AML/CFT policy and methodology configuration — demonstration scene (4–5 minutes)

Placed immediately before the assessment scene of the end-to-end demonstration
(`AML-suptech-end-to-end-demonstration-script.md`). Its purpose is to show that the platform supplies
the supervisory engine while the regulator owns the supervisory policy.

## Screens and records used

| Beat | Route | Record |
|---|---|---|
| A–B methodology register and detail | `/admin/supervisory-methodology` → `/admin/supervisory-methodology/:methodologyId` | AML-CFT-RBA v1.0 ACTIVE / regulator-authored; v1.1 DRAFT / MIPL_REFERENCE |
| C dimensions and questions | methodology detail | 41 active questions across the published dimensions |
| C sector variation | `/admin/supervisory-assessment-programmes` → `/admin/supervisory-assessment-programmes/:programmeSetId` | AML/CFT PERIODIC programme that drives the applicable question set |
| C applicability rules | `/admin/supervisory-policy-profiles` | policy profile kernel |
| D–E calculation policy, scoring, bands, residual matrix | `/admin/supervisory-calculation` | configuration `daf7d06e-1876-45bc-8a14-6869545f65a5` (ACTIVE) |
| F versioning | methodology register + configuration history | v1.0 in force, v1.1 draft reference |
| G maker-checker lifecycle | `/admin/supervisory-calculation/approvals` | DRAFT → REVIEW → APPROVED → ACTIVE with maker and checker recorded |
| H effective dates | calculation configuration header | effective-from date on the active configuration |
| I policy to execution | `/supervision/aml/assessments/c3e16863-60d8-4c6e-8650-3f0eefcbc0cf` | SCEN-06, DEMO AML 06 Rodney Bay Payments Ltd |

Personas: maker `aml_supervision_officer@mishainfotech.com`; checker `aml_supervision_supervisor@mishainfotech.com`.

## Narration

**A — the policy layer.** "Every regulator has its own supervisory philosophy. Two authorities can
follow the same FATF principles and still classify institutions differently, weight factors
differently, set different thresholds, require different review frequencies and apply different
escalation policies. So we do not hard-code a single MIPL AML/CFT methodology. The regulator configures
and governs its own. The platform provides the supervisory engine; the regulator owns the supervisory
policy."

**B — the methodology.** "This is the AML/CFT methodology currently configured. A methodology defines the
areas the authority wants assessed — customer risk, geography, products and services, delivery
channels, transaction exposure, governance, internal controls, customer due diligence, beneficial
ownership, transaction monitoring, sanctions, suspicious transaction reporting, training and
independent assurance. The exact structure is the regulator's. Different regulated sectors can also
carry different methodologies: a bank's AML/CFT assessment need not be identical to that of a
money-services business, insurer or securities intermediary."

**C — questions and factors.** "Within each area the regulator defines the questions and factors
supervisors must assess. These do not sit permanently inside application code — as expectations evolve,
the methodology evolves. Each question belongs to a methodology version and its assessment context is
governed with it, which is how supervisory manuals and worksheets become a controlled digital
methodology."

**D — calculation policy.** "Then we define how those assessments become risk. The authority determines
how inherent risk is evaluated, how control effectiveness shapes residual risk, whether factors carry
different weight, how non-applicable items are treated, what counts as sufficient completeness, how
scores aggregate, where the band thresholds sit and what conditions permit a rating to be calculated
at all. These are configurable policy decisions, not hidden programming assumptions. Today's values are
demonstration values; in implementation they are agreed with and formally owned by the regulator."

**E — a simple example.** "One authority may classify institutions Low, Medium, High or Very High;
another may use three bands. One may emphasise customer and geographic exposure; another may give more
supervisory weight to control effectiveness. Those choices belong to the authority, not to the
software."

> Presenter note: do not change the live ACTIVE configuration on camera. If you want to show editing,
> use a separate DRAFT configuration.

**F — versioning.** "Methodologies change. If the authority issues a revised risk-based supervision
framework next year, we do not edit the existing methodology in place and quietly change what past
assessments meant. A new version is prepared. Version 1.0 stays attached to assessments performed under
it; a future version carries revised questions, thresholds or calculation rules and applies to new
assessments from its effective date. Policy can change without rewriting regulatory history."

**G — maker-checker governance.** "Configurable does not mean any administrator can silently change
regulatory policy. Configuration itself is governed: Draft → Review → Approved → Active. The person
preparing it is the maker; an appropriately authorised person independently reviews and approves it, and
only then does it become effective for supervisory use. Changing a weighting, threshold or calculation
rule can change how institutions are classified, so it carries the same accountability as any other
material supervisory decision."

**H — effective dates.** "The authority also decides when a policy takes effect — prepare it today,
approve it through internal governance, and activate it from an agreed supervisory period. That matters
when implementing new regulations, revised guidance or a new annual methodology."

**I — policy to execution.** "We have now defined what is assessed, how risk is determined and who
approved those rules. Here is the same policy applied to an actual institution: this assessment is not
an arbitrary questionnaire, it runs against a defined, governed methodology, and its answers feed the
calculation rules we just reviewed, which in turn shape the institution's supervisory risk position."

**J — beyond AML/CFT.** "The same architecture extends to prudential risk, consumer protection, market
conduct, operational resilience, cybersecurity, corporate governance, licensing, fit-and-proper
assessment, examinations and compliance monitoring. The objective is not one hard-coded AML
application; it is a configurable supervisory platform where different regulatory methodologies operate
inside one governed environment."

**K — management message.** "Three levels of control. Policy: the authority defines how supervision
operates. Governance: changes are versioned, reviewed, approved and auditable. Execution: the approved
policy drives assessments, ratings, monitoring and supervisory action — a direct line from regulatory
policy to supervisory methodology to supervisory decision to regulatory action."

**Close.** "So before we even look at the assessment result, the methodology behind that result is
transparent, configurable, version-controlled and governed. Now let us see that approved policy applied
to our institution."
