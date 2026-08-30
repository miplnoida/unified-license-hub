/**
 * Portable User Manual generator (documentation only).
 *
 * `src/content/user-manual/` is the SINGLE source of truth. This script renders
 * it to Markdown so the portable documents can never drift from the in-app
 * manual. No prose is authored here.
 *
 *   npx vite-node scripts/generate-user-manual.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MANUAL_META } from '../src/content/user-manual/meta';
import { PROCESS_SECTIONS, NARRATIVE_SECTIONS } from '../src/content/user-manual/sections';
import { PERSONAS } from '../src/content/user-manual/personas';
import { ENTITY_360_SECTIONS, E360_GROUP_DOCS } from '../src/content/user-manual/entity360';
import { AI_SURFACES, AI_MUST_NOT_CLAIM, AUTOMATION_CLASSIFICATION } from '../src/content/user-manual/aiSurfaces';
import { JOURNEYS } from '../src/content/user-manual/journeys';
import { DEMO_SCRIPTS, AI_DEMO_SCENARIOS } from '../src/content/user-manual/demoPlaybook';
import { SCREENSHOTS, MANDATORY_DEMO_SCREENSHOTS } from '../src/content/user-manual/screenshotManifest';
import { HELP_LINKS } from '../src/content/user-manual/helpLinks';

const OUT = resolve(process.cwd(), 'docs/user-manual');
mkdirSync(OUT, { recursive: true });

const li = (xs?: readonly string[]) => (xs && xs.length ? xs.map((x) => `- ${x}`).join('\n') : '_None recorded._');
const ol = (xs?: readonly string[]) => (xs && xs.length ? xs.map((x, i) => `${i + 1}. ${x}`).join('\n') : '_None recorded._');
const captured = SCREENSHOTS.filter((s) => s.status === 'CURRENT' || s.status === 'FINAL_E2E_VERIFIED');
const pending = SCREENSHOTS.filter((s) => s.status === 'NEEDS_CAPTURE');

const head = () =>
  [
    `> **${MANUAL_META.manualStatus}**`,
    '>',
    `> Version ${MANUAL_META.version} · generated ${MANUAL_META.generatedDate} · documented HEAD \`${MANUAL_META.repositoryHead}\``,
    `> E2E verification: ${MANUAL_META.lastE2eVerifiedHead ? `verified at \`${MANUAL_META.lastE2eVerifiedHead}\`` : 'PENDING — not yet E2E verified'}`,
    '>',
    '> Generated from `src/content/user-manual/` — do not edit by hand.',
  ].join('\n');

/* ------------------------------------------------------------------ manual */
const m: string[] = [`# ${'Unified License Hub — User Manual'}`, '', head(), '', '## Contents', ''];
NARRATIVE_SECTIONS.forEach((s, i) => m.push(`${i + 1}. ${s.title} — \`${s.id}\``));
PROCESS_SECTIONS.forEach((s, i) => m.push(`${NARRATIVE_SECTIONS.length + i + 1}. ${s.title} — \`${s.id}\``));
m.push('');

for (const s of NARRATIVE_SECTIONS) {
  m.push(`## ${s.title}`, '', `_Chapter: ${s.chapter} · audience: ${s.audience} · status: ${s.status}_`, '');
  for (const b of s.body) {
    if (b.heading) m.push(`### ${b.heading}`, '');
    for (const p of b.paragraphs ?? []) m.push(p, '');
    if (b.bullets?.length) m.push(li(b.bullets), '');
  }
  if (s.links?.length) m.push('**Where to find it**', '', li(s.links.map((l) => `${l.label} — \`${l.route}\``)), '');
  if (s.screenshots?.length) m.push(`**Screenshots:** ${s.screenshots.map((x) => `\`${x}\``).join(', ')}`, '');
}

for (const s of PROCESS_SECTIONS) {
  m.push(
    `## ${s.title}`,
    '',
    `_Chapter: ${s.chapter} · module: ${s.module} · audience: ${s.audience} · status: ${s.status} · AI: ${s.aiInvolvement}_`,
    '',
    s.purpose,
    '',
    `**Actors:** ${s.actors.join(', ')}`,
    '',
    '**Preconditions**', '', li(s.preconditions), '',
    '**Where to start**', '', li(s.whereToStart.map((l) => `${l.label} — \`${l.route}\``)), '',
    '**Process flow**', '', ol(s.processFlow), '',
    '**Status lifecycle**', '', li(s.statusLifecycle.map((x) => `\`${x.status}\` — ${x.meaning}`)), '',
    '**User actions**', '', li(s.userActions.map((x) => `${x.action} → ${x.effect}`)), '',
    `**Maker-checker:** ${s.makerChecker}`, '',
    '**Notifications**', '', li(s.notifications), '',
    '**Service level & escalation**', '', li(s.slaEscalation), '',
    '**Evidence**', '', li(s.evidence), '',
    '**Audit**', '', li(s.audit), '',
    '**Exceptions**', '', li(s.exceptions), '',
  );
  if (s.aiNote) m.push(`> AI: ${s.aiNote}`, '');
  if (s.demoNotes.length) m.push('**Demo notes**', '', li(s.demoNotes), '');
  if (s.screenshots.length) m.push(`**Screenshots:** ${s.screenshots.map((x) => `\`${x}\``).join(', ')}`, '');
}

m.push('## Roles and personas', '');
for (const p of PERSONAS) {
  m.push(
    `### ${p.label} (\`${p.key}\`)`, '',
    `_${p.audience === 'external' ? 'External portal user' : 'Internal regulator user'} · application roles: ${p.roles.join(', ')}_`, '',
    p.purpose, '',
    `**Starting dashboard:** ${p.startingDashboard.label} — \`${p.startingDashboard.route}\``, '',
    '**Menu**', '', li(p.mainMenu), '',
    '**Responsibilities**', '', li(p.responsibilities), '',
    '**Can do**', '', li(p.canDo), '',
    '**Cannot do**', '', li(p.cannotDo), '',
    `**Maker-checker:** ${p.makerChecker}`, '',
    '**Daily workflow**', '', ol(p.dailyWorkflow), '',
    '**Work queues**', '', li(p.workQueue), '',
    '**Enforced by**', '', li(p.enforcedBy), '',
  );
}

m.push('## Entity 360', '');
for (const g of E360_GROUP_DOCS) m.push(`### Group — ${g.label}`, '', g.purpose ?? '', '');
for (const s of ENTITY_360_SECTIONS) {
  m.push(
    `### ${s.label} (\`${s.key}\`)`, '',
    `_Group: ${s.group} · audience: ${s.audience} · status: ${s.status}_`, '',
    s.whatIsIt, '',
    `**Question answered:** ${s.questionAnswered}`, '',
    `**Why it matters:** ${s.regulatoryImportance}`, '',
    `**As-at behaviour:** ${s.temporal}`, '',
    '**Source of information**', '', li(s.sourceOfInformation), '',
    '**Important fields**', '', li(s.importantFields.map((f) => `\`${f.field}\` — ${f.meaning}`)), '',
    '**How to interpret**', '', li(s.howToInterpret), '',
    '**What to investigate**', '', li(s.whatToInvestigate), '',
    '**Related processes**', '', li(s.relatedProcesses.map((l) => `${l.label} — \`${l.route}\``)), '',
  );
}

m.push(
  '## AI and human-controlled governance', '',
  'Every AI surface is advisory. AI never approves, prices, rates, scores or files anything — a named person makes and owns every regulatory decision.', '',
  '**Automation classification**', '',
  li(AUTOMATION_CLASSIFICATION.map((c) => `**${c.kind}** — ${c.meaning} (e.g. ${c.examples.join('; ')})`)), '',
  '**Claims that must never be made**', '', li(AI_MUST_NOT_CLAIM), '',
);
for (const a of AI_SURFACES) {
  m.push(
    `### ${a.label} (\`${a.code}\`)`, '',
    `_Module: ${a.owningModule} · audience: ${a.audience} · status: ${a.status}${a.route ? ` · route \`${a.route}\`` : ''}_`, '',
    a.businessPurpose, '',
    '**Input**', '', li(a.input), '',
    '**Output**', '', li(a.output), '',
    `**Confidence:** ${a.confidence}`, '',
    `**Explanation:** ${a.explanation}`, '',
    '**Human control**', '', li(a.humanControl), '',
    `**Decision authority:** ${a.decisionAuthority}`, '',
    '**Provenance**', '', li(a.provenance), '',
    `**Failure behaviour:** ${a.failureBehaviour}`, '',
    '**Governance**', '', li(a.governance), '',
  );
}

m.push('## End-to-end journeys', '');
for (const j of JOURNEYS) {
  m.push(
    `### ${j.code} — ${j.title}`, '',
    `_Audience: ${j.audience} · status: ${j.status} · modules: ${j.modulesTraversed.join(' → ')}_`, '',
    j.purpose, '',
    '**Steps**', '',
    j.steps
      .map((s) => `${s.step}. **${s.actor}** — ${s.action}${s.route ? ` (\`${s.route}\`)` : ''} → ${s.outcome} _[${s.aiInvolvement}]_`)
      .join('\n'),
    '',
    '**Evidence**', '', li(j.evidence), '',
  );
}

m.push('## Contextual help anchors', '', li(HELP_LINKS.map((h) => `${h.label} — surface \`${h.surface}\` → anchor \`${h.anchor}\` (${h.audience})`)), '');

/* ------------------------------------------------------------ demo playbook */
const d: string[] = [`# ${'Unified License Hub — User Manual'} — Demo Playbook`, '', head(), ''];
for (const s of DEMO_SCRIPTS) {
  d.push(
    `## ${s.title} (\`${s.id}\`)`, '',
    `_Duration: ${s.durationMinutes} minutes · ${s.audienceNote}_`, '',
    '**Focus**', '', li(s.focus), '',
    '**Records to use (demo-safe only)**', '', li(s.recordsToUse), '',
    '**Run sheet**', '',
    s.steps
      .map((st) => `${st.step}. **${st.persona}** — ${st.screen.label} (\`${st.screen.route}\`): ${st.sequence}\n   - Expect: ${st.expectedScreen}\n   - Message: ${st.keyMessage}${st.aiTalkingPoint ? `\n   - AI: ${st.aiTalkingPoint}` : ''}\n   - Fallback: ${st.fallback}`)
      .join('\n'),
    '',
  );
}
d.push('## AI demonstration scenarios', '');
for (const s of AI_DEMO_SCENARIOS) {
  d.push(
    `### ${s.title} (\`${s.id}\`)`, '',
    `_Persona: ${s.persona} · start: ${s.startingScreen.label} (\`${s.startingScreen.route}\`)_`, '',
    s.scenario, '',
    '**What to click**', '', li(s.whatToClick), '',
    '**AI output to highlight**', '', li(s.aiOutputToHighlight), '',
    `**Confidence & rationale:** ${s.confidenceAndRationale}`, '',
    `**Human decision point:** ${s.humanDecisionPoint}`, '',
    `**Override demonstration:** ${s.overrideDemonstration}`, '',
    '**Audit evidence**', '', li(s.auditEvidence), '',
    `**Key talking point:** ${s.keyTalkingPoint}`, '',
  );
}
d.push('## Demo data safety', '', li([
  'Use synthetic / demo-safe records only — never a real supervised institution.',
  'Never present AI output as a decision, rating, approval or price.',
  'Never present a capability marked IN DEVELOPMENT or TRACK-B / FUTURE as production-ready.',
  'Never demonstrate with live personal identity data.',
]), '', '## Claims that must never be made', '', li(AI_MUST_NOT_CLAIM), '');

/* ------------------------------------------------------- screenshot manifest */
const sm: string[] = [
  '# Screenshot Manifest', '', head(), '',
  `Declared: ${SCREENSHOTS.length} · captured: ${captured.length} · NEEDS_CAPTURE: ${pending.length}`, '',
  '| ID | Persona | Process | Route | Status | File / reason | Data |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...SCREENSHOTS.map((s) => `| \`${s.id}\` | ${s.persona} | ${s.process} | \`${s.route}\` | ${s.status} | ${s.status === 'NEEDS_CAPTURE' ? s.needsCaptureReason ?? 'MISSING REASON' : `\`${s.file}\``} | ${s.dataClassification} |`),
  '', '## Mandatory demo screenshots', '', li(MANDATORY_DEMO_SCREENSHOTS.map((id) => `\`${id}\``)), '',
];

/* --------------------------------------------------------- refresh contract */
const refresh = `# FINAL E2E REFRESH CONTRACT — User Manual

${head()}

This manual is **V1 / INTERIM**: written before whole-system end-to-end
certification. The final E2E wave MUST execute every step below before the
manual may be described as verified.

## Mandatory refresh steps

1. Re-census application routes, personas and modules from the live platform and reconcile against \`sections.ts\` / \`personas.ts\`.
2. Compare the live Entity 360 section catalogue against \`entity360.ts\`; record every added, renamed or retired section.
3. Compare the live governed AI surface registry against \`aiSurfaces.ts\`; re-confirm classification, human control and decision authority.
4. Refresh every instruction whose screen, status or authority changed.
5. Recapture stale screenshots with \`npm run docs:user-manual:screenshots\` using demo-safe data only.
6. Re-run persona journeys A–F end to end and correct any step that no longer matches.
7. Regenerate the portable documents with \`npm run docs:user-manual\`.
8. Set every re-verified screenshot status to \`FINAL_E2E_VERIFIED\`.
9. Update \`lastE2eVerifiedHead\` and \`e2eVerificationStatus\` in \`src/content/user-manual/meta.ts\`.
10. Re-run \`npm run verify:user-manual\` and file the result with the certification evidence.

## Current interim position

- Documented HEAD: \`${MANUAL_META.repositoryHead}\`
- Last E2E verified HEAD: ${MANUAL_META.lastE2eVerifiedHead ? `\`${MANUAL_META.lastE2eVerifiedHead}\`` : '_none — never E2E verified_'}
- Screenshots captured: ${captured.length}
- Screenshots pending capture: ${pending.length}
${pending.map((p) => `  - \`${p.id}\` (${p.persona}): ${p.needsCaptureReason ?? 'MISSING REASON'}`).join('\n')}
`;

writeFileSync(resolve(OUT, 'Unified-License-Hub-User-Manual.md'), `${m.join('\n')}\n`);
writeFileSync(resolve(OUT, 'Demo-Playbook.md'), `${d.join('\n')}\n`);
writeFileSync(resolve(OUT, 'Screenshot-Manifest.md'), `${sm.join('\n')}\n`);
writeFileSync(resolve(OUT, 'FINAL-E2E-REFRESH.md'), refresh);
console.log(`generated 4 documents (captured=${captured.length}, needs_capture=${pending.length})`);
