import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type YesNo = 'yes' | 'no' | '';

export interface QuestionAnswer {
  answer: YesNo;
  explanation: string;
}

export type Questionnaire = Record<string, QuestionAnswer>;

export interface DeclarationFormPayload {
  questionnaire: Questionnaire;
  notes: string | null;
  attested: true;
}

interface QuestionDef {
  key: string;
  section: string;
  text: string;
  explanationLabel?: string;
}

// ── Questionnaire definition ───────────────────────────────────────────────────
// Independent from the FP Personal Questionnaire (FormRenderer) — this content
// and the tab shell around it are purpose-built for the Declaration flow.

const SECTIONS = [
  'Criminal History',
  'Regulatory History',
  'Financial History',
  'Civil / Legal',
  'Other Positions',
] as const;

const QUESTIONS: QuestionDef[] = [
  {
    key: 'criminal_conviction',
    section: 'Criminal History',
    text: 'Have you ever been convicted of a criminal offence (other than minor traffic violations)?',
    explanationLabel: 'Provide details of the conviction(s), date(s), and jurisdiction(s).',
  },
  {
    key: 'criminal_pending',
    section: 'Criminal History',
    text: 'Are there any criminal proceedings currently pending against you?',
    explanationLabel: 'Describe the nature of the proceedings and the jurisdiction.',
  },
  {
    key: 'license_refused',
    section: 'Regulatory History',
    text: 'Have you ever been refused a licence, authorisation, registration, or approval by any regulatory or government body?',
    explanationLabel: 'Provide details: which body, when, and the reasons given.',
  },
  {
    key: 'license_revoked',
    section: 'Regulatory History',
    text: 'Have you ever had a licence, authorisation, or approval revoked, suspended, or had conditions imposed on it?',
    explanationLabel: 'Provide details: which body, when, and the grounds.',
  },
  {
    key: 'disciplinary_proceedings',
    section: 'Regulatory History',
    text: 'Have you ever been the subject of disciplinary proceedings by a regulatory, professional, or government body?',
    explanationLabel: 'Describe the proceedings, outcome, and any sanctions imposed.',
  },
  {
    key: 'bankruptcy',
    section: 'Financial History',
    text: 'Have you ever been declared bankrupt, or entered into any individual insolvency or formal debt restructuring arrangement?',
    explanationLabel: 'Provide details including jurisdiction, date, and current status.',
  },
  {
    key: 'insolvent_director',
    section: 'Financial History',
    text: 'Have you ever been a director, officer, or significant owner of a company that was declared insolvent, went into administration, or was wound up?',
    explanationLabel: 'Provide the company name, jurisdiction, date, and your role.',
  },
  {
    key: 'director_disqualified',
    section: 'Civil / Legal',
    text: 'Have you ever been disqualified from acting as a director, officer, or trustee of any company or organisation?',
    explanationLabel: 'Describe the disqualification order, jurisdiction, and period.',
  },
  {
    key: 'civil_judgment',
    section: 'Civil / Legal',
    text: 'Are there any outstanding civil judgments, enforcement orders, or similar legal proceedings against you that have not been fully satisfied?',
    explanationLabel: 'Provide the nature of the claim, jurisdiction, amount, and current status.',
  },
  {
    key: 'other_regulated_roles',
    section: 'Other Positions',
    text: 'Do you currently hold a similar or equivalent position (director, key person, controller, etc.) in any other regulated entity?',
    explanationLabel: 'List each entity, your role, and the relevant regulator.',
  },
];

function groupBySection(qs: QuestionDef[]) {
  const map = new Map<string, QuestionDef[]>();
  for (const q of qs) {
    if (!map.has(q.section)) map.set(q.section, []);
    map.get(q.section)!.push(q);
  }
  return map;
}

function emptyQuestionnaire(): Questionnaire {
  const q: Questionnaire = {};
  for (const def of QUESTIONS) q[def.key] = { answer: '', explanation: '' };
  return q;
}

function isAnswered(a: QuestionAnswer | undefined): boolean {
  if (!a || a.answer === '') return false;
  if (a.answer === 'yes' && !a.explanation.trim()) return false;
  return true;
}

const SECTION_MAP = groupBySection(QUESTIONS);
const REVIEW_TAB = '__review__';
const TAB_VALUES: string[] = [...SECTIONS, REVIEW_TAB];

// ── Component ────────────────────────────────────────────────────────────────

export default function DeclarationQuestionnaire({
  individualName,
  submitting,
  onSubmit,
}: {
  individualName?: string;
  submitting: boolean;
  onSubmit: (payload: DeclarationFormPayload) => void;
}) {
  const [activeTab, setActiveTab] = useState<string>(SECTIONS[0]);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>(emptyQuestionnaire());
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [attested, setAttested] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);

  function handleChange(key: string, field: keyof QuestionAnswer, value: string) {
    setQuestionnaire((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    setSectionError(null);
  }

  function sectionQuestions(section: string): QuestionDef[] {
    return SECTION_MAP.get(section) ?? [];
  }

  function isSectionComplete(section: string): boolean {
    return sectionQuestions(section).every((q) => isAnswered(questionnaire[q.key]));
  }

  function validateSection(section: string): string | null {
    for (const q of sectionQuestions(section)) {
      const ans = questionnaire[q.key];
      if (!ans || ans.answer === '') return `Please answer: "${q.text.slice(0, 70)}…"`;
      if (ans.answer === 'yes' && !ans.explanation.trim()) return `Please provide details for: "${q.text.slice(0, 70)}…"`;
    }
    return null;
  }

  const answeredCount = QUESTIONS.filter((q) => isAnswered(questionnaire[q.key])).length;
  const allSectionsComplete = SECTIONS.every((s) => isSectionComplete(s));

  function goToTab(tab: string) {
    setSectionError(null);
    setActiveTab(tab);
  }

  function handleNext() {
    const currentIsSection = (SECTIONS as readonly string[]).includes(activeTab);
    if (currentIsSection) {
      const err = validateSection(activeTab);
      if (err) {
        setSectionError(err);
        return;
      }
    }
    const idx = TAB_VALUES.indexOf(activeTab);
    if (idx >= 0 && idx < TAB_VALUES.length - 1) goToTab(TAB_VALUES[idx + 1]);
  }

  function handlePrevious() {
    const idx = TAB_VALUES.indexOf(activeTab);
    if (idx > 0) goToTab(TAB_VALUES[idx - 1]);
  }

  function handleSubmitClick() {
    if (!allSectionsComplete) {
      setSectionError('Please complete every section before submitting.');
      return;
    }
    if (!attested) {
      setSectionError('You must confirm the attestation before submitting.');
      return;
    }
    onSubmit({ questionnaire, notes: additionalNotes.trim() || null, attested: true });
  }

  const isLastTab = activeTab === REVIEW_TAB;
  const isFirstTab = activeTab === SECTIONS[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>Identity verified for: <strong>{individualName}</strong></span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Questions answered</span>
          <span className="tabular-nums font-medium">{answeredCount} / {QUESTIONS.length}</span>
        </div>
        <Progress value={(answeredCount / QUESTIONS.length) * 100} className="h-1.5" />
      </div>

      <Tabs value={activeTab} onValueChange={goToTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0 justify-start">
          {SECTIONS.map((section, i) => {
            const complete = isSectionComplete(section);
            return (
              <TabsTrigger
                key={section}
                value={section}
                className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border data-[state=active]:border-primary"
              >
                <span className="font-bold text-xs">{i + 1}</span>
                <span>{section}</span>
                {complete && <CheckCircle2 className="h-3.5 w-3.5" />}
              </TabsTrigger>
            );
          })}
          <TabsTrigger
            value={REVIEW_TAB}
            className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border data-[state=active]:border-primary"
          >
            Review & Submit
          </TabsTrigger>
        </TabsList>

        {SECTIONS.map((section) => (
          <TabsContent key={section} value={section} className="space-y-5 pt-4">
            {sectionQuestions(section).map((q, qi) => {
              const ans = questionnaire[q.key] ?? { answer: '', explanation: '' };
              return (
                <div key={q.key} className="space-y-2.5">
                  <p className="text-sm leading-snug text-slate-800">
                    <span className="font-medium text-slate-500 mr-1.5 tabular-nums">{qi + 1}.</span>
                    {q.text}
                  </p>
                  <div className="flex gap-4">
                    {(['no', 'yes'] as const).map((val) => (
                      <label key={val} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={q.key}
                          value={val}
                          checked={ans.answer === val}
                          onChange={() => handleChange(q.key, 'answer', val)}
                          className="accent-slate-700 h-4 w-4"
                        />
                        <span className={`text-sm font-medium ${val === 'yes' ? 'text-red-700' : 'text-emerald-700'}`}>
                          {val === 'yes' ? 'Yes' : 'No'}
                        </span>
                      </label>
                    ))}
                  </div>
                  {ans.answer === 'yes' && (
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">
                        {q.explanationLabel ?? 'Please provide details.'} <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        rows={3}
                        placeholder="Please provide full details…"
                        value={ans.explanation}
                        onChange={(e) => handleChange(q.key, 'explanation', e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </TabsContent>
        ))}

        <TabsContent value={REVIEW_TAB} className="space-y-5 pt-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-800">Review before you submit</p>
            <ul className="space-y-1 text-sm">
              {SECTIONS.map((section) => (
                <li key={section} className="flex items-center gap-2">
                  {isSectionComplete(section) ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  )}
                  <button type="button" className="text-left hover:underline" onClick={() => goToTab(section)}>
                    {section}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-notes" className="text-sm">
              Additional Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="add-notes"
              placeholder="Any additional information you wish to provide to the regulator…"
              rows={3}
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              className="text-sm"
            />
          </div>

          <Separator />

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Declaration & Attestation</p>
            <p className="text-sm text-slate-700 leading-relaxed">
              I, <strong>{individualName}</strong>, declare that the information I have provided in this
              declaration is true, complete, and accurate to the best of my knowledge and belief. I understand
              that providing false or misleading information may constitute a criminal offence and may result in
              the refusal, revocation, or suspension of any licence, authorisation, or approval.
            </p>
            <div className="flex items-start gap-3 pt-1">
              <Checkbox
                id="attest"
                checked={attested}
                onCheckedChange={(v) => { setAttested(!!v); setSectionError(null); }}
                className="mt-0.5"
              />
              <Label htmlFor="attest" className="cursor-pointer text-sm text-slate-800 leading-snug font-medium">
                I confirm that the above declaration is true and accurate, and I consent to this information being
                shared with the relevant regulatory authority.
              </Label>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {sectionError && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{sectionError}</span>
        </div>
      )}

      <Separator />

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={handlePrevious} disabled={isFirstTab || submitting}>
          <ChevronLeft className="h-4 w-4 mr-1.5" />
          Previous
        </Button>

        {isLastTab ? (
          <Button onClick={handleSubmitClick} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Submitting…' : 'Submit Declaration'}
          </Button>
        ) : (
          <Button onClick={handleNext}>
            Next
            <ChevronRight className="h-4 w-4 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
