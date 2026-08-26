/**
 * MC-01 wizard — Step 1 (About you) and Step 2 (Contact and support).
 *
 * Anonymous filing (we hold no identity) and confidential filing (we hold your
 * identity but handle it sensitively) are deliberately separate choices.
 */
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldError, StepIntro } from './Field';
import {
  CONTACT_METHOD_OPTIONS,
  FILER_ROLE_OPTIONS,
  isRepresentativeRole,
  needsPositionTitle,
} from './logic';
import type { IntakeConfig, WizardState } from './types';

export interface StepProps {
  s: WizardState;
  patch: (partial: Partial<WizardState>) => void;
  errors: Record<string, string>;
  config: IntakeConfig;
}

export function StepAboutYou({ s, patch, errors, config }: StepProps) {
  const isRep = isRepresentativeRole(s.filer_role);
  const anonymous = config.allow_anonymous && s.anonymous;

  return (
    <div className="space-y-6">
      <StepIntro
        title="About you"
        description="Tell us who is making this complaint so we know who to deal with."
      />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Who is making this complaint?</legend>
        <RadioGroup
          value={s.filer_role}
          onValueChange={(v) => patch({ filer_role: v as WizardState['filer_role'] })}
          className="space-y-2"
        >
          {FILER_ROLE_OPTIONS.map((o) => (
            <div key={o.value} className="flex items-center gap-2">
              <RadioGroupItem id={`filer-${o.value}`} value={o.value} />
              <Label htmlFor={`filer-${o.value}`} className="font-normal">{o.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="filer_name" label="Your full name" error={errors.filer_name} required={!anonymous}>
          <Input
            id="filer_name"
            value={s.filer_name}
            disabled={anonymous}
            autoComplete="name"
            onChange={(e) => patch({ filer_name: e.target.value })}
          />
        </Field>
        <Field id="filer_email" label="Your email address (optional)">
          <Input
            id="filer_email"
            type="email"
            value={s.filer_email}
            disabled={anonymous}
            autoComplete="email"
            onChange={(e) => patch({ filer_email: e.target.value })}
          />
        </Field>
        <Field id="filer_phone" label="Your phone number (optional)">
          <Input
            id="filer_phone"
            value={s.filer_phone}
            disabled={anonymous}
            autoComplete="tel"
            onChange={(e) => patch({ filer_phone: e.target.value })}
          />
        </Field>
        {s.filer_role === 'business_representative' && (
          <Field
            id="filer_business_name"
            label="Name of the business you represent"
            error={errors.filer_business_name}
            required
          >
            <Input
              id="filer_business_name"
              value={s.filer_business_name}
              onChange={(e) => patch({ filer_business_name: e.target.value })}
            />
          </Field>
        )}
        {needsPositionTitle(s.filer_role) && (
          <Field id="filer_position" label="Your position or title" error={errors.filer_position} required>
            <Input
              id="filer_position"
              value={s.filer_position}
              onChange={(e) => patch({ filer_position: e.target.value })}
            />
          </Field>
        )}
      </div>

      {isRep && (
        <div className="rounded-md border p-4 space-y-4">
          <h3 className="text-sm font-medium">About the person or business affected</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="affected_name"
              label="Their full name"
              error={errors.affected_name}
              required={s.filer_role !== 'business_representative'}
            >
              <Input
                id="affected_name"
                value={s.affected_name}
                onChange={(e) => patch({ affected_name: e.target.value })}
              />
            </Field>
            <Field id="affected_email" label="Their email address (optional)">
              <Input
                id="affected_email"
                type="email"
                value={s.affected_email}
                onChange={(e) => patch({ affected_email: e.target.value })}
              />
            </Field>
            <Field id="affected_phone" label="Their phone number (optional)">
              <Input
                id="affected_phone"
                value={s.affected_phone}
                onChange={(e) => patch({ affected_phone: e.target.value })}
              />
            </Field>
            {s.filer_role !== 'business_representative' && (
              <Field
                id="relationship_to_consumer"
                label="Your relationship to them"
                hint="For example: parent, spouse, carer, attorney."
                error={errors.relationship_to_consumer}
                required
              >
                <Input
                  id="relationship_to_consumer"
                  value={s.relationship_to_consumer}
                  onChange={(e) => patch({ relationship_to_consumer: e.target.value })}
                />
              </Field>
            )}
          </div>
          <Field
            id="authority_basis"
            label="On what basis are you acting for them?"
            hint="For example: power of attorney, written consent, legal guardianship, company officer."
            error={errors.authority_basis}
            required
          >
            <Textarea
              id="authority_basis"
              rows={3}
              value={s.authority_basis}
              onChange={(e) => patch({ authority_basis: e.target.value })}
            />
          </Field>
          <div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                id="authority_confirmed"
                checked={s.authority_confirmed}
                onCheckedChange={(v) => patch({ authority_confirmed: !!v })}
              />
              <span>I confirm I am authorised to make this complaint on their behalf.</span>
            </label>
            <FieldError id="authority_confirmed" error={errors.authority_confirmed} />
          </div>
        </div>
      )}

      {(config.allow_anonymous || config.allow_confidential) && (
        <div className="rounded-md border p-4 space-y-3">
          <h3 className="text-sm font-medium">How your identity is handled</h3>
          {config.allow_anonymous && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                id="anonymous"
                checked={s.anonymous}
                onCheckedChange={(v) => patch({ anonymous: !!v, confidential: v ? false : s.confidential })}
              />
              <span>
                <span className="font-medium">File anonymously.</span> We will not record your name or
                contact details. We will not be able to contact you or give you updates.
              </span>
            </label>
          )}
          {config.allow_confidential && !s.anonymous && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                id="confidential"
                checked={s.confidential}
                onCheckedChange={(v) => patch({ confidential: !!v })}
              />
              <span>
                <span className="font-medium">Ask us to keep your identity confidential.</span> We will
                record your details so we can contact you, but ask us not to reveal your identity to the
                business unless we have to.
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export function StepContactSupport({ s, patch, errors, config }: StepProps) {
  const toggleSupport = (code: string) => {
    const next = s.support_categories.includes(code)
      ? s.support_categories.filter((c) => c !== code)
      : [...s.support_categories, code];
    patch({ support_categories: next });
  };

  return (
    <div className="space-y-6">
      <StepIntro
        title="How we can contact and support you"
        description="Choose the way that suits you best — an email address is not required."
      />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">
          How would you like us to contact you? <span aria-hidden="true" className="text-destructive">*</span>
        </legend>
        <RadioGroup
          value={s.preferred_method}
          onValueChange={(v) => patch({ preferred_method: v as WizardState['preferred_method'] })}
          className="flex flex-wrap gap-4"
        >
          {CONTACT_METHOD_OPTIONS.map((o) => (
            <div key={o.value} className="flex items-center gap-2">
              <RadioGroupItem id={`contact-${o.value}`} value={o.value} />
              <Label htmlFor={`contact-${o.value}`} className="font-normal">{o.label}</Label>
            </div>
          ))}
        </RadioGroup>
        <FieldError id="preferred_method" error={errors.preferred_method} />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="contact_email"
          label="Email address"
          error={errors.contact_email}
          required={s.preferred_method === 'email'}
        >
          <Input
            id="contact_email"
            type="email"
            autoComplete="email"
            value={s.contact_email}
            onChange={(e) => patch({ contact_email: e.target.value })}
          />
        </Field>
        <Field
          id="contact_phone"
          label="Phone number"
          error={errors.contact_phone}
          required={s.preferred_method === 'phone'}
        >
          <Input
            id="contact_phone"
            autoComplete="tel"
            value={s.contact_phone}
            onChange={(e) => patch({ contact_phone: e.target.value })}
          />
        </Field>
      </div>

      <div className="rounded-md border p-4 space-y-4">
        <h3 className="text-sm font-medium">
          Postal address {s.preferred_method === 'post' ? '' : '(optional)'}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="postal_address_line1"
            label="Street address"
            error={errors.postal_address_line1}
            required={s.preferred_method === 'post'}
            className="sm:col-span-2"
          >
            <Input
              id="postal_address_line1"
              autoComplete="address-line1"
              value={s.postal_address_line1}
              onChange={(e) => patch({ postal_address_line1: e.target.value })}
            />
          </Field>
          <Field id="postal_address_line2" label="Address line 2 (optional)" className="sm:col-span-2">
            <Input
              id="postal_address_line2"
              autoComplete="address-line2"
              value={s.postal_address_line2}
              onChange={(e) => patch({ postal_address_line2: e.target.value })}
            />
          </Field>
          <Field id="city" label="Town or city" error={errors.city} required={s.preferred_method === 'post'}>
            <Input id="city" autoComplete="address-level2" value={s.city} onChange={(e) => patch({ city: e.target.value })} />
          </Field>
          <Field id="region" label="District or region (optional)">
            <Input id="region" value={s.region} onChange={(e) => patch({ region: e.target.value })} />
          </Field>
          <Field id="postal_code" label="Postal code (optional)">
            <Input id="postal_code" value={s.postal_code} onChange={(e) => patch({ postal_code: e.target.value })} />
          </Field>
          <Field id="country" label="Country (optional)">
            <Input id="country" value={s.country} onChange={(e) => patch({ country: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="alternative_method" label="If we cannot reach you that way, what next? (optional)">
          <Select
            value={s.alternative_method}
            onValueChange={(v) => patch({ alternative_method: v as WizardState['alternative_method'] })}
          >
            <SelectTrigger id="alternative_method"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No alternative</SelectItem>
              {CONTACT_METHOD_OPTIONS.filter((o) => o.value !== s.preferred_method).map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="preferred_language" label="Preferred language">
          <Input
            id="preferred_language"
            value={s.preferred_language}
            onChange={(e) => patch({ preferred_language: e.target.value })}
          />
        </Field>
      </div>

      <div className="rounded-md border p-4 space-y-4">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            id="support_required"
            checked={s.support_required}
            onCheckedChange={(v) => patch({ support_required: !!v })}
          />
          <span>
            Do you need any support when communicating with us or dealing with this complaint?
          </span>
        </label>
        {s.support_required && (
          <div className="space-y-3">
            <fieldset>
              <legend className="text-sm font-medium">What kind of support would help?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {config.support_categories.map((c) => (
                  <label key={c.code} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      id={`support-${c.code}`}
                      checked={s.support_categories.includes(c.code)}
                      onCheckedChange={() => toggleSupport(c.code)}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
              <FieldError id="support_categories" error={errors.support_categories} />
            </fieldset>
            <Field id="support_notes" label="Anything else we should know? (optional)">
              <Textarea
                id="support_notes"
                rows={3}
                value={s.support_notes}
                onChange={(e) => patch({ support_notes: e.target.value })}
              />
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="accessibility_needs" label="Accessibility needs (optional)">
            <Input
              id="accessibility_needs"
              value={s.accessibility_needs}
              onChange={(e) => patch({ accessibility_needs: e.target.value })}
            />
          </Field>
          <Field
            id="safe_contact_instructions"
            label="Safe ways to contact you (optional)"
            hint="For example: only call in the morning, or do not leave a voicemail."
          >
            <Input
              id="safe_contact_instructions"
              value={s.safe_contact_instructions}
              onChange={(e) => patch({ safe_contact_instructions: e.target.value })}
            />
          </Field>
        </div>
      </div>

      {s.anonymous && (
        <Alert>
          <AlertDescription className="text-xs">
            You have chosen to file anonymously. Any contact details you give here will only be used if
            you ask us to get in touch, and your name will not be recorded.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
