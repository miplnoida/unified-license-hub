/**
 * MC-01 wizard — Step 5 (What happened), Step 6 (What you have already done),
 * Step 7 (Outcome, declarations) and the consumer-friendly review summary.
 *
 * The consumer's narrative is submitted exactly as they typed it — it is never
 * rewritten, summarised or replaced with generated language.
 */
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Paperclip, ShieldAlert, X } from 'lucide-react';
import { Field, FieldError, StepIntro } from './Field';
import {
  ACCEPTED_FILE_EXTENSIONS,
  FILER_ROLE_OPTIONS,
  formatBytes,
  respondentDisplayName,
  RESPONDENT_KIND_OPTIONS,
  STEP_TITLES,
} from './logic';
import type { IntakeConfig, StagedFile, Taxonomy, WizardState } from './types';

const today = () => new Date().toISOString().slice(0, 10);

const YES_NO_UNSURE: Array<{ value: 'yes' | 'no' | 'unsure'; label: string }> = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
];

interface BaseProps {
  s: WizardState;
  patch: (partial: Partial<WizardState>) => void;
  errors: Record<string, string>;
  config: IntakeConfig;
}

export function StepWhatHappened({ s, patch, errors }: BaseProps) {
  return (
    <div className="space-y-6">
      <StepIntro
        title="What happened"
        description="Tell us in your own words. We will keep exactly what you write here."
      />

      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Never include passwords, PINs, full card numbers, one-time codes or other security
          credentials. We will never ask you for them.
        </AlertDescription>
      </Alert>

      <Field id="subject" label="Short summary of your complaint" error={errors.subject} required>
        <Input
          id="subject"
          value={s.subject}
          maxLength={200}
          onChange={(e) => patch({ subject: e.target.value })}
          placeholder="For example: Charges applied to my account without notice"
        />
      </Field>

      <Field
        id="description"
        label="Tell us what happened"
        hint="Include dates, what was said, and how it affected you."
        error={errors.description}
        required
      >
        <Textarea
          id="description"
          rows={10}
          value={s.description}
          maxLength={12000}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="incident_date" label="When did it happen? (optional)" error={errors.incident_date}>
          <Input
            id="incident_date"
            type="date"
            max={today()}
            value={s.incident_date}
            onChange={(e) => patch({ incident_date: e.target.value })}
          />
        </Field>
        <Field id="incident_date_to" label="If it continued, when did it end? (optional)" error={errors.incident_date_to}>
          <Input
            id="incident_date_to"
            type="date"
            max={today()}
            value={s.incident_date_to}
            onChange={(e) => patch({ incident_date_to: e.target.value })}
          />
        </Field>
        <Field id="location" label="Branch, office or location (optional)">
          <Input id="location" value={s.location} onChange={(e) => patch({ location: e.target.value })} />
        </Field>
        <Field id="transaction_reference" label="Transaction or reference number (optional)" hint="Do not enter full card or account numbers.">
          <Input
            id="transaction_reference"
            value={s.transaction_reference}
            onChange={(e) => patch({ transaction_reference: e.target.value })}
          />
        </Field>
        <Field id="amount_involved" label="Amount involved (optional)">
          <Input
            id="amount_involved"
            inputMode="decimal"
            value={s.amount_involved}
            onChange={(e) => patch({ amount_involved: e.target.value })}
          />
        </Field>
        <Field id="currency" label="Currency">
          <Input id="currency" value={s.currency} maxLength={8} onChange={(e) => patch({ currency: e.target.value })} />
        </Field>
        <Field id="amount_disputed" label="Amount you are disputing (optional)">
          <Input
            id="amount_disputed"
            inputMode="decimal"
            value={s.amount_disputed}
            onChange={(e) => patch({ amount_disputed: e.target.value })}
          />
        </Field>
        <Field id="claimed_loss" label="Loss you believe you have suffered (optional)">
          <Input
            id="claimed_loss"
            inputMode="decimal"
            value={s.claimed_loss}
            onChange={(e) => patch({ claimed_loss: e.target.value })}
          />
        </Field>
      </div>

      <div className="space-y-2 rounded-md border p-4">
        {[
          ['is_ongoing', 'This problem is still happening'],
          ['continuing_loss', 'I am still losing money because of it'],
          ['urgent_funds_access', 'I urgently need access to my money'],
          ['suspected_fraud', 'I believe this may be a scam or fraud'],
        ].map(([key, label]) => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <Checkbox
              id={key}
              checked={Boolean(s[key as keyof WizardState])}
              onCheckedChange={(v) => patch({ [key]: !!v } as Partial<WizardState>)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function StepPriorSteps({
  s, patch, errors, config, onAddFiles,
}: BaseProps & { onAddFiles: (files: FileList | null) => void }) {
  return (
    <div className="space-y-6">
      <StepIntro
        title="What you have already done"
        description="If you have already contacted the business, tell us what happened. It is fine if you have not."
      />

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          id="raised_with_entity"
          checked={s.raised_with_entity}
          onCheckedChange={(v) => patch({ raised_with_entity: !!v })}
        />
        <span>I have already raised this with the business.</span>
      </label>

      {s.raised_with_entity && (
        <div className="space-y-4 rounded-md border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="entity_complaint_reference" label="Their complaint reference (optional)">
              <Input
                id="entity_complaint_reference"
                value={s.entity_complaint_reference}
                onChange={(e) => patch({ entity_complaint_reference: e.target.value })}
              />
            </Field>
            <Field id="raised_with_entity_date" label="When did you raise it? (optional)" error={errors.raised_with_entity_date}>
              <Input
                id="raised_with_entity_date"
                type="date"
                max={today()}
                value={s.raised_with_entity_date}
                onChange={(e) => patch({ raised_with_entity_date: e.target.value })}
              />
            </Field>
            <Field id="raised_with_entity_channel" label="How did you raise it? (optional)">
              <Select
                value={s.raised_with_entity_channel || 'unsure'}
                onValueChange={(v) => patch({ raised_with_entity_channel: v === 'unsure' ? '' : v })}
              >
                <SelectTrigger id="raised_with_entity_channel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unsure">Not sure</SelectItem>
                  {(config.channel_options ?? []).map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="final_response_date" label="Date of their final answer (optional)" error={errors.final_response_date}>
              <Input
                id="final_response_date"
                type="date"
                max={today()}
                value={s.final_response_date}
                onChange={(e) => patch({ final_response_date: e.target.value })}
              />
            </Field>
          </div>

          {([
            ['acknowledgement_received', 'Did they acknowledge your complaint?'],
            ['final_response_received', 'Have they given you a final answer?'],
            ['redress_accepted', 'Did you accept what they offered?'],
          ] as const).map(([key, label]) => (
            <fieldset key={key} className="space-y-2">
              <legend className="text-sm font-medium">{label}</legend>
              <RadioGroup
                value={s[key] as string}
                onValueChange={(v) => patch({ [key]: v } as Partial<WizardState>)}
                className="flex flex-wrap gap-4"
              >
                {YES_NO_UNSURE.map((o) => (
                  <div key={o.value} className="flex items-center gap-2">
                    <RadioGroupItem id={`${key}-${o.value}`} value={o.value} />
                    <Label htmlFor={`${key}-${o.value}`} className="font-normal">{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
          ))}

          <Field id="outcome_offered" label="What did they say or offer? (optional)">
            <Textarea
              id="outcome_offered"
              rows={3}
              value={s.outcome_offered}
              onChange={(e) => patch({ outcome_offered: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="redress_offered" label="Did they offer to put things right? (optional)">
              <Input
                id="redress_offered"
                value={s.redress_offered}
                onChange={(e) => patch({ redress_offered: e.target.value })}
              />
            </Field>
            <Field id="redress_offered_amount" label="Amount they offered (optional)">
              <Input
                id="redress_offered_amount"
                inputMode="decimal"
                value={s.redress_offered_amount}
                onChange={(e) => patch({ redress_offered_amount: e.target.value })}
              />
            </Field>
          </div>
          <Field id="still_dissatisfied_reason" label="Why are you still unhappy? (optional)">
            <Textarea
              id="still_dissatisfied_reason"
              rows={3}
              value={s.still_dissatisfied_reason}
              onChange={(e) => patch({ still_dissatisfied_reason: e.target.value })}
            />
          </Field>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="attachments" className="flex items-center gap-2 text-sm">
          <Paperclip className="h-3.5 w-3.5" /> Supporting documents (optional)
        </Label>
        <Input
          id="attachments"
          type="file"
          multiple
          accept={ACCEPTED_FILE_EXTENSIONS}
          onChange={(e) => {
            onAddFiles(e.target.files);
            e.currentTarget.value = '';
          }}
        />
        <p className="text-xs text-muted-foreground">
          Up to {config.max_attachments} files, {formatBytes(config.max_attachment_bytes)} each. PDF,
          images, text, Word or Excel documents.
        </p>
        <FieldError id="attachments" error={errors.attachments} />
        {s.attachments.length > 0 && (
          <ul className="space-y-1">
            {s.attachments.map((f: StagedFile) => (
              <li key={f.key} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                <span className="truncate">{f.name} · {formatBytes(f.size)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => patch({ attachments: s.attachments.filter((x) => x.key !== f.key) })}
                >
                  <X className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function StepOutcome({
  s, patch, errors, config, taxonomy, onEditStep,
}: BaseProps & { taxonomy: Taxonomy; onEditStep: (step: number) => void }) {
  const toggleOutcome = (code: string) => {
    const next = s.desired_outcomes.includes(code)
      ? s.desired_outcomes.filter((c) => c !== code)
      : [...s.desired_outcomes, code];
    patch({ desired_outcomes: next });
  };

  return (
    <div className="space-y-6">
      <StepIntro
        title="What outcome you are seeking"
        description="Tell us what you would like to happen, then check your answers before you submit."
      />

      <fieldset>
        <legend className="text-sm font-medium">
          What outcome are you hoping for? <span aria-hidden="true" className="text-destructive">*</span>
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {config.desired_outcome_options.map((o) => (
            <label key={o.code} className="flex items-start gap-2 text-sm">
              <Checkbox
                id={`outcome-${o.code}`}
                checked={s.desired_outcomes.includes(o.code)}
                onCheckedChange={() => toggleOutcome(o.code)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <FieldError id="desired_outcomes" error={errors.desired_outcomes} />
      </fieldset>

      {s.desired_outcomes.includes('other') && (
        <Field id="desired_outcome_other" label="Describe the outcome you are seeking" error={errors.desired_outcome_other} required>
          <Textarea
            id="desired_outcome_other"
            rows={3}
            value={s.desired_outcome_other}
            onChange={(e) => patch({ desired_outcome_other: e.target.value })}
          />
        </Field>
      )}

      <Field id="desired_amount" label="Amount you are seeking, if any (optional)">
        <Input
          id="desired_amount"
          inputMode="decimal"
          value={s.desired_amount}
          onChange={(e) => patch({ desired_amount: e.target.value })}
        />
      </Field>

      <ReviewSummary s={s} config={config} taxonomy={taxonomy} onEditStep={onEditStep} />

      <div className="space-y-4 rounded-md border p-4">
        <h3 className="text-sm font-medium">Privacy notice</h3>
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
          {config.privacy_notice_text ??
            'We use the information you give us to assess and handle your complaint.'}
        </p>
        <div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              id="privacy_notice_acknowledged"
              checked={s.privacy_notice_acknowledged}
              onCheckedChange={(v) => patch({ privacy_notice_acknowledged: !!v })}
            />
            <span>I have read how my information will be used.</span>
          </label>
          <FieldError id="privacy_notice_acknowledged" error={errors.privacy_notice_acknowledged} />
        </div>
        <div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              id="information_sharing_acknowledged"
              checked={s.information_sharing_acknowledged}
              onCheckedChange={(v) => patch({ information_sharing_acknowledged: !!v })}
            />
            <span>
              I understand that relevant details of my complaint may be shared with the business
              concerned so it can respond.
            </span>
          </label>
          <FieldError id="information_sharing_acknowledged" error={errors.information_sharing_acknowledged} />
        </div>

        {config.require_respondent_contact_permission && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              May we contact the business about your complaint?
              <span aria-hidden="true" className="text-destructive"> *</span>
            </legend>
            <RadioGroup
              value={s.respondent_contact_permitted}
              onValueChange={(v) => patch({ respondent_contact_permitted: v as 'yes' | 'no' })}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="contact-permitted-yes" value="yes" />
                <Label htmlFor="contact-permitted-yes" className="font-normal">Yes</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="contact-permitted-no" value="no" />
                <Label htmlFor="contact-permitted-no" className="font-normal">
                  No — please speak to me first
                </Label>
              </div>
            </RadioGroup>
            <FieldError id="respondent_contact_permitted" error={errors.respondent_contact_permitted} />
          </fieldset>
        )}

        <div>
          <h3 className="text-sm font-medium">Declaration</h3>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {config.declaration_text ??
              'I confirm that the information I have given is true and accurate to the best of my knowledge.'}
          </p>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <Checkbox
              id="declaration_accepted"
              checked={s.declaration_accepted}
              onCheckedChange={(v) => patch({ declaration_accepted: !!v })}
            />
            <span>I agree with this declaration.</span>
          </label>
          <FieldError id="declaration_accepted" error={errors.declaration_accepted} />
        </div>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          Once you submit, we will assess whether this matter is within our role and what happens next.
          You will get a complaint reference and a tracking access code straight away.
        </AlertDescription>
      </Alert>
    </div>
  );
}

/** Plain-language recap of every step, with Edit links back into the wizard. */
export function ReviewSummary({
  s, config, taxonomy, onEditStep,
}: {
  s: WizardState;
  config: IntakeConfig;
  taxonomy: Taxonomy;
  onEditStep: (step: number) => void;
}) {
  const label = (rows: Array<{ code: string; label: string }>, code: string) =>
    rows.find((r) => r.code === code)?.label ?? code;
  const roleLabel = FILER_ROLE_OPTIONS.find((o) => o.value === s.filer_role)?.label ?? '—';
  const productName = taxonomy.products.find((p) => p.id === s.product_id)?.name ?? s.product_other ?? '—';
  const channelName = s.channel_code
    ? label(config.channel_options.length ? config.channel_options : taxonomy.channel_options, s.channel_code)
    : '—';

  const rows: Array<{ step: number; title: string; items: Array<[string, string]> }> = [
    {
      step: 1,
      title: STEP_TITLES[0],
      items: [
        ['Who is complaining', roleLabel],
        ['Your name', s.anonymous ? 'Filed anonymously' : s.filer_name || '—'],
        ['Identity handling', s.anonymous ? 'Anonymous' : s.confidential ? 'Confidential' : 'Standard'],
        ...(s.affected_name ? ([['Person affected', s.affected_name]] as Array<[string, string]>) : []),
      ],
    },
    {
      step: 2,
      title: STEP_TITLES[1],
      items: [
        ['Preferred contact', s.preferred_method || '—'],
        ['Email', s.contact_email || '—'],
        ['Phone', s.contact_phone || '—'],
        ['Postal address', [s.postal_address_line1, s.city].filter(Boolean).join(', ') || '—'],
        [
          'Support needs',
          s.support_required && s.support_categories.length
            ? s.support_categories.map((c) => label(config.support_categories, c)).join(', ')
            : 'None told to us',
        ],
      ],
    },
    {
      step: 3,
      title: STEP_TITLES[2],
      items: s.respondents.map((r, i) => [
        i === 0 ? 'Complaint about' : `Also involved (${i + 1})`,
        `${respondentDisplayName(r)} — ${RESPONDENT_KIND_OPTIONS.find((o) => o.value === r.kind)?.label ?? ''}`,
      ]),
    },
    {
      step: 4,
      title: STEP_TITLES[3],
      items: [
        ['Product or service', productName || '—'],
        ['How you dealt with them', channelName],
      ],
    },
    {
      step: 5,
      title: STEP_TITLES[4],
      items: [
        ['Summary', s.subject || '—'],
        ['When', s.incident_date || 'Not given'],
        ['Amount involved', s.amount_involved ? `${s.currency} ${s.amount_involved}` : '—'],
      ],
    },
    {
      step: 6,
      title: STEP_TITLES[5],
      items: [
        ['Raised with the business', s.raised_with_entity ? 'Yes' : 'No'],
        ['Their reference', s.entity_complaint_reference || '—'],
        ['Documents attached', s.attachments.length ? String(s.attachments.length) : 'None'],
      ],
    },
  ];

  return (
    <section className="space-y-3 rounded-md border p-4" aria-labelledby="review-heading">
      <h3 id="review-heading" className="text-sm font-semibold">Check your answers</h3>
      {rows.map((group) => (
        <div key={group.step} className="space-y-1 border-t pt-3 first:border-t-0 first:pt-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium">{group.title}</h4>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEditStep(group.step)}>
              Edit
            </Button>
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {group.items.map(([k, v], i) => (
              <div key={`${k}-${i}`}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-foreground">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <div className="border-t pt-3">
        <h4 className="text-sm font-medium">What happened, in your words</h4>
        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{s.description || '—'}</p>
      </div>
    </section>
  );
}
