/**
 * Renders one pinned Wave B form against the EXACT `form_version_id` recorded
 * on a `return_filing_form_requirements` row. Never re-resolves a version,
 * never invents a Returns-specific schema.
 *
 * The parent filing workspace owns form-level navigation and the single
 * filing-level Submit; this component owns section navigation (delegated to
 * FormRenderer), draft saving, "mark form complete" and the live financial
 * check configured in `return_form_validation_rules`.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Save, CheckCircle2, ArrowRight, AlertTriangle } from 'lucide-react';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { migrateSectionsToRows } from '@/lib/formRows';
import type { FormSection } from '@/types/formBuilder';
import { useEntityReturnsMutations } from '@/hooks/useEntityReturns';
import { toast } from 'sonner';
import {
  evaluateFormRules, formatAmount, type ReturnFormRule, type RuleEvaluation,
} from '@/lib/returns/formValidationRules';

export interface FilingFormRequirement {
  id: string;
  form_template_id: string;
  form_version_id: string;
  template_name: string | null;
  form_version: number | null;
  is_required: boolean;
  sequence: number;
  tab_name: string | null;
  form_response_id: string | null;
  completion_status: string;
}

export function EntityFilingForm({
  requirement, editable, rules = [], onIssuesChange, onContinue, continueLabel,
}: {
  requirement: FilingFormRequirement;
  editable: boolean;
  /** Configured financial checks for this form template. */
  rules?: ReturnFormRule[];
  /** Reports live blocking issues for this form up to the filing workspace. */
  onIssuesChange?: (requirementId: string, issues: string[]) => void;
  /** Called after a successful save when the filer chooses to move on. */
  onContinue?: () => void;
  continueLabel?: string;
}) {
  const { saveFormResponse } = useEntityReturnsMutations();
  const [saving, setSaving] = useState(false);
  const [liveData, setLiveData] = useState<Record<string, any>>({});
  const [localResponseId, setLocalResponseId] = useState<string | null>(requirement.form_response_id);

  const { data: version, isLoading: loadingVersion } = useQuery({
    queryKey: ['entity-returns', 'form-version', requirement.form_version_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_versions')
        .select('id, template_id, version, schema_snapshot')
        .eq('id', requirement.form_version_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: response, isLoading: loadingResponse } = useQuery({
    queryKey: ['entity-returns', 'form-response', requirement.form_response_id],
    enabled: !!requirement.form_response_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_responses')
        .select('id, response_data')
        .eq('id', requirement.form_response_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sections = useMemo<FormSection[]>(() => {
    if (!version?.schema_snapshot) return [];
    return migrateSectionsToRows(version.schema_snapshot as unknown as FormSection[]);
  }, [version?.schema_snapshot]);

  const initial = (response?.response_data as Record<string, any> | undefined) || {};
  const readOnly = !editable;

  // Seed the live copy from the persisted response once it has loaded.
  useEffect(() => {
    setLiveData(initial);
    setLocalResponseId(requirement.form_response_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response?.id, requirement.form_response_id]);

  const evaluations: RuleEvaluation[] = useMemo(
    () => evaluateFormRules(rules, liveData),
    [rules, liveData],
  );
  const failures = evaluations.filter((e) => !e.passed);
  const blocking = failures.filter((e) => e.rule.is_blocking);

  useEffect(() => {
    onIssuesChange?.(requirement.id, blocking.map((e) => e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirement.id, blocking.map((e) => e.message).join('|')]);

  const persist = async (
    data: Record<string, unknown>,
    completion: 'IN_PROGRESS' | 'COMPLETED',
  ): Promise<boolean> => {
    setSaving(true);
    try {
      const saved = await saveFormResponse.mutateAsync({
        requirementId: requirement.id,
        templateId: requirement.form_template_id,
        formVersionId: requirement.form_version_id,
        existingResponseId: localResponseId,
        data,
        completion,
      });
      setLocalResponseId(saved.responseId);
      toast.success(completion === 'COMPLETED' ? 'Form marked as complete' : 'Draft saved');
      return true;
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (loadingVersion || loadingResponse) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading form…</CardContent></Card>;
  }
  if (!version || sections.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Pinned form version not available.</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{requirement.template_name ?? 'Form'}{requirement.tab_name ? ` — ${requirement.tab_name}` : ''}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Pinned version v{requirement.form_version ?? version.version} — {requirement.is_required ? 'required' : 'optional'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {blocking.length > 0 && (
            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
              {blocking.length} issue{blocking.length === 1 ? '' : 's'}
            </Badge>
          )}
          <Badge variant="outline">{requirement.completion_status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {failures.length > 0 && (
          <Alert variant={blocking.length > 0 ? 'destructive' : 'default'}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{failures[0].rule.label}</AlertTitle>
            <AlertDescription className="space-y-1">
              {failures.map((e) => (
                <div key={e.rule.id}>
                  <p>{e.message}</p>
                  <p className="text-xs opacity-80">Difference: {formatAmount(e.difference)}</p>
                </div>
              ))}
              {blocking.length > 0 && (
                <p className="text-xs">
                  You can still save a draft, but this return cannot be submitted until the figures agree.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        <FormRenderer
          formName=""
          sections={sections}
          initialData={initial}
          readOnly={readOnly}
          saving={saving}
          hideActions
          formId={requirement.form_template_id}
          formVersionId={requirement.form_version_id}
          submissionId={localResponseId}
          entityType="return_filing_requirement"
          entityId={requirement.id}
          onChange={(data) => setLiveData(data)}
          onSaveDraft={async (data) => persist(data, 'IN_PROGRESS')}
          onSubmit={async (data) => persist(data, 'COMPLETED')}
        />

        {!readOnly && (
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={saving} onClick={() => persist(liveData, 'IN_PROGRESS')}>
              <Save className="mr-2 h-4 w-4" />{saving ? 'Saving…' : 'Save draft'}
            </Button>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => persist(liveData, 'COMPLETED')}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />Mark form complete
            </Button>
            {onContinue && (
              <Button
                disabled={saving}
                onClick={async () => {
                  const ok = await persist(liveData, 'COMPLETED');
                  if (ok) onContinue();
                }}
              >
                {continueLabel ?? 'Save & continue'}<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
