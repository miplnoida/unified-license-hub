/**
 * MC-01 wizard — Step 3 (Who the complaint is about) and Step 4 (Product, service and channel).
 *
 * A consumer may complain about a currently regulated business, a previously
 * regulated business, a business they cannot find, or one they believe may be
 * operating without authorisation. A licensee id is only ever attached when the
 * consumer actually picked a business from our register.
 */
import { useEffect, useMemo, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { Field, FieldError, StepIntro } from './Field';
import {
  CUSTOMER_SEGMENT_OPTIONS,
  RESPONDENT_KIND_OPTIONS,
  newRespondent,
  respondentNeedsSearch,
} from './logic';
import type { EntityRow, IntakeConfig, RespondentDraft, RespondentKind, Taxonomy, TaxonomyRow, WizardState } from './types';

interface RespondentProps {
  index: number;
  respondent: RespondentDraft;
  errors: Record<string, string>;
  canRemove: boolean;
  searchEntities: (query: string) => Promise<EntityRow[]>;
  onChange: (partial: Partial<RespondentDraft>) => void;
  onRemove: () => void;
}

function RespondentCard({
  index, respondent, errors, canRemove, searchEntities, onChange, onRemove,
}: RespondentProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EntityRow[]>([]);
  const [searching, setSearching] = useState(false);
  const needsSearch = respondentNeedsSearch(respondent.kind);
  const wantedState =
    respondent.kind === 'previously_regulated' ? 'previously_regulated' : 'currently_regulated';
  const errorKey = `respondent_${index}_business`;

  useEffect(() => {
    if (!needsSearch) return;
    let live = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const rows = await searchEntities(query);
      if (!live) return;
      setResults(rows.filter((r) => r.regulated_state === wantedState));
      setSearching(false);
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, needsSearch, wantedState, searchEntities]);

  return (
    <div className="rounded-md border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium">
          {index === 0 ? 'The business or person your complaint is about' : `Also involved (${index + 1})`}
        </h3>
        {canRemove && (
          <GuardedButton module="complaint_management" action="edit" data-rbac="complaint_management.edit" type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
          </GuardedButton>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Which best describes them?</legend>
        <RadioGroup
          value={respondent.kind}
          onValueChange={(v) =>
            onChange({ kind: v as RespondentKind, licensee_id: null, selected_name: null, selected_state: null })
          }
          className="space-y-2"
        >
          {RESPONDENT_KIND_OPTIONS.map((o) => (
            <div key={o.value} className="flex items-start gap-2">
              <RadioGroupItem id={`kind-${index}-${o.value}`} value={o.value} className="mt-1" />
              <Label htmlFor={`kind-${index}-${o.value}`} className="font-normal">
                {o.label}
                <span className="block text-xs text-muted-foreground">{o.help}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      {needsSearch ? (
        <div className="space-y-3">
          <Field
            id={`respondent-search-${index}`}
            label="Search for the business"
            hint="Type part of the business name."
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id={`respondent-search-${index}`}
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Business name"
              />
            </div>
          </Field>
          {respondent.licensee_id && (
            <div className="flex items-center justify-between rounded border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{respondent.selected_name}</span>
              <Button data-rbac="complaint_management.edit"
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange({ licensee_id: null, selected_name: null, selected_state: null })}
              >
                Change
              </Button>
            </div>
          )}
          {!respondent.licensee_id && (
            <div className="max-h-64 overflow-y-auto rounded border divide-y">
              {searching && (
                <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                </div>
              )}
              {!searching && results.length === 0 && (
                <p className="p-3 text-xs text-muted-foreground">
                  No businesses matched. You can choose “I cannot find the business in the list” above.
                </p>
              )}
              {!searching &&
                results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/60"
                    onClick={() =>
                      onChange({
                        licensee_id: r.id,
                        selected_name: r.name,
                        selected_state: r.regulated_state,
                        legal_name: r.name,
                      })
                    }
                  >
                    <span>
                      <span className="font-medium">{r.name}</span>
                      {r.sector_name && (
                        <span className="block text-xs text-muted-foreground">{r.sector_name}</span>
                      )}
                    </span>
                    <Badge variant={r.regulated_state === 'currently_regulated' ? 'default' : 'secondary'}>
                      {r.regulated_label}
                    </Badge>
                  </button>
                ))}
            </div>
          )}
          <FieldError id={errorKey} error={errors[errorKey]} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`legal_name-${index}`} label="Business or person's name">
              <Input
                id={`legal_name-${index}`}
                value={respondent.legal_name}
                onChange={(e) => onChange({ legal_name: e.target.value })}
              />
            </Field>
            <Field id={`trading_name-${index}`} label="Trading name (optional)">
              <Input
                id={`trading_name-${index}`}
                value={respondent.trading_name}
                onChange={(e) => onChange({ trading_name: e.target.value })}
              />
            </Field>
            <Field id={`website-${index}`} label="Website (optional)">
              <Input
                id={`website-${index}`}
                value={respondent.website}
                onChange={(e) => onChange({ website: e.target.value })}
              />
            </Field>
            <Field
              id={`online_reference-${index}`}
              label="Social media or online reference (optional)"
              hint="For example a Facebook page, WhatsApp number or advert link."
            >
              <Input
                id={`online_reference-${index}`}
                value={respondent.online_reference}
                onChange={(e) => onChange({ online_reference: e.target.value })}
              />
            </Field>
            <Field id={`respondent_email-${index}`} label="Their email (optional)">
              <Input
                id={`respondent_email-${index}`}
                type="email"
                value={respondent.email}
                onChange={(e) => onChange({ email: e.target.value })}
              />
            </Field>
            <Field id={`respondent_phone-${index}`} label="Their phone (optional)">
              <Input
                id={`respondent_phone-${index}`}
                value={respondent.phone}
                onChange={(e) => onChange({ phone: e.target.value })}
              />
            </Field>
            <Field id={`respondent_address-${index}`} label="Address (optional)">
              <Input
                id={`respondent_address-${index}`}
                value={respondent.address}
                onChange={(e) => onChange({ address: e.target.value })}
              />
            </Field>
            <Field id={`respondent_country-${index}`} label="Country (optional)">
              <Input
                id={`respondent_country-${index}`}
                value={respondent.country}
                onChange={(e) => onChange({ country: e.target.value })}
              />
            </Field>
          </div>
          <Field id={`service_offered-${index}`} label="What service did they offer you? (optional)">
            <Textarea
              id={`service_offered-${index}`}
              rows={2}
              value={respondent.service_offered}
              onChange={(e) => onChange({ service_offered: e.target.value })}
            />
          </Field>
          <FieldError id={errorKey} error={errors[errorKey]} />
        </div>
      )}

      {(respondent.kind === 'intermediary' || respondent.agent_name || respondent.related_principal_name) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`agent_name-${index}`} label="Name of the agent, broker or salesperson (optional)">
            <Input
              id={`agent_name-${index}`}
              value={respondent.agent_name}
              onChange={(e) => onChange({ agent_name: e.target.value })}
            />
          </Field>
          <Field
            id={`related_principal_name-${index}`}
            label="Main business they act for, if you know it (optional)"
          >
            <Input
              id={`related_principal_name-${index}`}
              value={respondent.related_principal_name}
              onChange={(e) => onChange({ related_principal_name: e.target.value })}
            />
          </Field>
        </div>
      )}

      <Field id={`consumer_notes-${index}`} label="Anything else that helps us identify them? (optional)">
        <Textarea
          id={`consumer_notes-${index}`}
          rows={2}
          value={respondent.consumer_notes}
          onChange={(e) => onChange({ consumer_notes: e.target.value })}
        />
      </Field>
    </div>
  );
}

export function StepRespondents({
  s, patch, errors, searchEntities,
}: {
  s: WizardState;
  patch: (partial: Partial<WizardState>) => void;
  errors: Record<string, string>;
  searchEntities: (query: string) => Promise<EntityRow[]>;
}) {
  const update = (index: number, partial: Partial<RespondentDraft>) => {
    patch({
      respondents: s.respondents.map((r, i) => (i === index ? { ...r, ...partial } : r)),
    });
  };

  return (
    <div className="space-y-6">
      <StepIntro
        title="Who the complaint is about"
        description="You can complain about a business we regulate now, one we regulated in the past, or a business you cannot find in our register."
      />
      <Alert>
        <AlertDescription className="text-xs">
          We will assess whether this matter is within our role and what happens next. Choosing a
          business here does not mean the complaint has been accepted, and a business that was regulated
          in the past has not necessarily done anything wrong.
        </AlertDescription>
      </Alert>

      {s.respondents.map((r, i) => (
        <RespondentCard
          key={r.key}
          index={i}
          respondent={r}
          errors={errors}
          canRemove={s.respondents.length > 1}
          searchEntities={searchEntities}
          onChange={(partial) => update(i, partial)}
          onRemove={() => patch({ respondents: s.respondents.filter((_, idx) => idx !== i) })}
        />
      ))}

      <FieldError id="respondents" error={errors.respondents} />

      <Button data-rbac="complaint_management.edit"
        type="button"
        variant="outline"
        onClick={() => patch({ respondents: [...s.respondents, newRespondent('regulated')] })}
      >
        <Plus className="mr-1 h-4 w-4" /> More than one business or person is involved
      </Button>
    </div>
  );
}

export function StepProductService({
  s, patch, errors, taxonomy, config, types,
}: {
  s: WizardState;
  patch: (partial: Partial<WizardState>) => void;
  errors: Record<string, string>;
  taxonomy: Taxonomy;
  config: IntakeConfig;
  types: TaxonomyRow[];
}) {
  const channelOptions = useMemo(
    () => (config.channel_options.length ? config.channel_options : taxonomy.channel_options),
    [config.channel_options, taxonomy.channel_options],
  );

  return (
    <div className="space-y-6">
      <StepIntro
        title="Product, service and how you dealt with them"
        description="This helps us route your complaint to the right team. If you are not sure, choose “Not sure”."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {taxonomy.products.length > 0 && (
          <Field id="product_id" label="What product or service is this about?">
            <Select value={s.product_id || 'unsure'} onValueChange={(v) => patch({ product_id: v === 'unsure' ? '' : v })}>
              <SelectTrigger id="product_id"><SelectValue placeholder="Choose a product or service" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unsure">Other / not sure</SelectItem>
                {taxonomy.products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {!s.product_id && (
          <Field id="product_other" label="Tell us what it was (optional)" hint="For example: savings account, motor insurance, money transfer.">
            <Input id="product_other" value={s.product_other} onChange={(e) => patch({ product_other: e.target.value })} />
          </Field>
        )}
        {taxonomy.sectors.length > 0 && (
          <Field id="sector_id" label="Type of business (optional)">
            <Select value={s.sector_id || 'unsure'} onValueChange={(v) => patch({ sector_id: v === 'unsure' ? '' : v })}>
              <SelectTrigger id="sector_id"><SelectValue placeholder="Choose a type of business" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unsure">Not sure</SelectItem>
                {taxonomy.sectors.map((x) => (
                  <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {types.length > 0 && (
          <Field id="complaint_type_id" label="What is your complaint mainly about? (optional)">
            <Select
              value={s.complaint_type_id || 'unsure'}
              onValueChange={(v) => patch({ complaint_type_id: v === 'unsure' ? '' : v })}
            >
              <SelectTrigger id="complaint_type_id"><SelectValue placeholder="Choose a category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unsure">Other / not sure</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {channelOptions.length > 0 && (
          <Field id="channel_code" label="How did you deal with them?">
            <Select
              value={s.channel_code || 'unsure'}
              onValueChange={(v) => patch({ channel_code: v === 'unsure' ? '' : v })}
            >
              <SelectTrigger id="channel_code"><SelectValue placeholder="Choose how you dealt with them" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unsure">Not sure</SelectItem>
                {channelOptions.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {s.channel_code === 'other' && (
          <Field id="channel_other" label="Tell us how you dealt with them">
            <Input id="channel_other" value={s.channel_other} onChange={(e) => patch({ channel_other: e.target.value })} />
          </Field>
        )}
        <Field id="customer_segment" label="Were you their customer? (optional)">
          <Select
            value={s.customer_segment || 'unsure'}
            onValueChange={(v) => patch({ customer_segment: v === 'unsure' ? '' : v })}
          >
            <SelectTrigger id="customer_segment"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CUSTOMER_SEGMENT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field id="service_description" label="Briefly describe the product or service (optional)" error={errors.service_description}>
        <Textarea
          id="service_description"
          rows={3}
          value={s.service_description}
          onChange={(e) => patch({ service_description: e.target.value })}
        />
      </Field>
    </div>
  );
}
