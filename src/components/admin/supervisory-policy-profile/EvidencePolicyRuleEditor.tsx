/**
 * Evidence Policy rule editor.
 *
 * The regulator composes evidence rules from the platform's own vocabulary: the
 * scopes, evidence requirements, evidence kinds, dimensions and questions all
 * come from the server for this exact component version, so nothing can be typed
 * that the platform would later refuse. The plain-language line under each rule
 * restates what has been recorded; it is not a second evaluator, and validity
 * still comes only from the server's verdict on the saved draft.
 */
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { humanize } from '@/components/admin/supervisory-policy-profile/labels';
import { useEvidencePolicyAuthoringOptions } from '@/hooks/useAssessmentEvidencePolicy';
import { rulePreview } from '@/lib/evidencePolicyPresentation';

type Rule = Record<string, unknown>;

interface Props {
  componentId: string;
  items: Rule[];
  editable: boolean;
  onChange: (next: Rule[]) => void;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const num = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));

export function EvidencePolicyRuleEditor({ componentId, items, editable, onChange }: Props) {
  const { data: options, isLoading } = useEvidencePolicyAuthoringOptions(componentId);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!options) {
    return (
      <Alert data-testid="evidence-policy-options-unavailable">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          The platform's evidence vocabulary could not be read, so no rule can be composed safely right now.
        </AlertDescription>
      </Alert>
    );
  }

  const set = (index: number, field: string, value: unknown) =>
    onChange(items.map((it, i) => (i === index ? { ...it, [field]: value } : it)));

  const toggleKind = (index: number, field: string, code: string, on: boolean) => {
    const current = arr(items[index]?.[field]);
    set(index, field, on ? [...current, code] : current.filter((c) => c !== code));
  };

  const kindPicker = (index: number, field: string, label: string, help: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{help}</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.evidence_kinds.map((k) => {
          const id = `${field}-${index}-${k.code}`;
          return (
            <label key={k.code} htmlFor={id} className="flex items-start gap-2 text-sm">
              <Checkbox
                id={id}
                disabled={!editable}
                checked={arr(items[index]?.[field]).includes(k.code)}
                onCheckedChange={(v) => toggleKind(index, field, k.code, v === true)}
              />
              <span>{k.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="evidence-policy-rule-editor">
      {options.warnings.map((w) => (
        <Alert key={w.code} data-testid={`evidence-policy-warning-${w.code}`}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{w.message}</AlertDescription>
        </Alert>
      ))}

      {options.methodology_code ? (
        <p className="text-xs text-muted-foreground" data-testid="evidence-policy-methodology">
          Dimensions and questions offered below come from methodology {options.methodology_code}{' '}
          v{options.methodology_version} ({humanize(options.methodology_source)}).
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No evidence rules recorded yet.
        </p>
      ) : null}

      {items.map((rule, index) => {
        const scope = str(rule.scope_type).toUpperCase();
        const references =
          scope === 'QUESTION'
            ? options.questions.map((q) => ({
                code: q.code,
                label: `${q.code} — ${q.label ?? ''}${q.dimension_code ? ` (${q.dimension_code})` : ''}`,
              }))
            : scope === 'DIMENSION'
              ? options.dimensions.map((d) => ({ code: d.code, label: `${d.code} — ${d.label ?? ''}` }))
              : [];
        const notRequired = str(rule.evidence_requirement).toUpperCase() === 'NOT_REQUIRED';

        return (
          <Card key={index} data-testid={`evidence-policy-rule-row-${index}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
              <CardTitle className="text-sm">
                {str(rule.label) || str(rule.rule_code) || `Rule ${index + 1}`}
              </CardTitle>
              {editable ? (
                <Button size="sm" variant="ghost" aria-label={`Remove rule ${index + 1}`}
                  onClick={() => onChange(items.filter((_, i) => i !== index))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`rule-code-${index}`}>Rule code *</Label>
                  <Input id={`rule-code-${index}`} disabled={!editable} value={str(rule.rule_code)}
                    onChange={(e) => set(index, 'rule_code', e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`rule-label-${index}`}>Rule name</Label>
                  <Input id={`rule-label-${index}`} disabled={!editable} value={str(rule.label)}
                    onChange={(e) => set(index, 'label', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Applies to *</Label>
                  <Select value={scope || undefined} disabled={!editable}
                    onValueChange={(v) => onChange(items.map((it, i) =>
                      i === index ? { ...it, scope_type: v, scope_reference: null } : it))}>
                    <SelectTrigger aria-label={`Applies to ${index + 1}`}>
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.scope_types.map((s) => (
                        <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {scope === 'QUESTION' || scope === 'DIMENSION' ? (
                  <div className="space-y-1.5">
                    <Label>{scope === 'QUESTION' ? 'Question' : 'Dimension'}</Label>
                    <Select value={str(rule.scope_reference) || undefined} disabled={!editable || !references.length}
                      onValueChange={(v) => set(index, 'scope_reference', v)}>
                      <SelectTrigger aria-label={`${scope === 'QUESTION' ? 'Question' : 'Dimension'} ${index + 1}`}>
                        <SelectValue placeholder={references.length ? 'All in scope' : 'None available'} />
                      </SelectTrigger>
                      <SelectContent>
                        {references.map((r) => (
                          <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label>Evidence requirement *</Label>
                  <Select value={str(rule.evidence_requirement).toUpperCase() || undefined} disabled={!editable}
                    onValueChange={(v) => set(index, 'evidence_requirement', v)}>
                    <SelectTrigger aria-label={`Evidence requirement ${index + 1}`}>
                      <SelectValue placeholder="Select requirement" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.evidence_requirements.map((r) => (
                        <SelectItem key={r} value={r}>{humanize(r)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`rule-min-${index}`}>Minimum items</Label>
                  <Input id={`rule-min-${index}`} type="number" min={1} disabled={!editable || notRequired}
                    value={num(rule.minimum_items)}
                    onChange={(e) => set(index, 'minimum_items', e.target.value === '' ? null : Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`rule-age-${index}`}>Maximum age in days</Label>
                  <Input id={`rule-age-${index}`} type="number" min={1} disabled={!editable || notRequired}
                    value={num(rule.maximum_age_days)}
                    onChange={(e) => set(index, 'maximum_age_days', e.target.value === '' ? null : Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`rule-independent-${index}`}>Independent sources required</Label>
                  <Input id={`rule-independent-${index}`} type="number" min={1} disabled={!editable || notRequired}
                    value={num(rule.independent_sources_required)}
                    onChange={(e) => set(index, 'independent_sources_required',
                      e.target.value === '' ? null : Number(e.target.value))} />
                </div>
              </div>

              {notRequired ? null : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {kindPicker(index, 'permitted_source_kinds', 'Evidence kinds that count',
                    'Only these kinds of platform record satisfy this rule. Leave empty to accept any kind.')}
                  {kindPicker(index, 'required_source_kinds', 'Evidence kinds that must be present',
                    'At least one item of each kind selected here must be on file.')}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { field: 'rationale_required', label: 'Written explanation required' },
                  { field: 'exception_allowed', label: 'Exception may be requested' },
                  { field: 'exception_approval_required', label: 'Exception needs independent approval' },
                ].map((t) => (
                  <div key={t.field} className="flex items-center justify-between gap-2 rounded-md border p-3">
                    <Label htmlFor={`${t.field}-${index}`} className="text-sm font-normal">{t.label}</Label>
                    <Switch id={`${t.field}-${index}`} disabled={!editable}
                      checked={rule[t.field] === true}
                      onCheckedChange={(v) => set(index, t.field, v)} />
                  </div>
                ))}
              </div>

              <p className="rounded-md bg-muted/40 p-3 text-sm" data-testid={`evidence-policy-preview-${index}`}>
                {rulePreview(rule as never)}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
