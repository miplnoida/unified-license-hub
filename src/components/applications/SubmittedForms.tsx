import { useEffect, useMemo, useState } from 'react';
import { useFormTemplate, useLatestPublishedVersion, useVersionSections, useFormVersion } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function FormNameLabel({ templateId, fallbackIndex }: { templateId: string; fallbackIndex: number }) {
  const { data: tpl } = useFormTemplate(templateId);
  return <span>{tpl?.name || `Form ${fallbackIndex}`}</span>;
}

interface SingleFormViewerProps {
  templateId: string;
  formData: Record<string, any>;
  versionId?: string | null;
  editable?: boolean;
  onSave?: (templateId: string, data: Record<string, any>, versionId?: string | null) => Promise<void>;
  saving?: boolean;
  applicationStatus?: string;
  originalData?: Record<string, any>;
}

function SingleFormViewer({ templateId, formData, versionId, editable, onSave, saving, applicationStatus, originalData }: SingleFormViewerProps) {
  const { data: template, isLoading: tLoading } = useFormTemplate(templateId);
  const { data: latestVersion, isLoading: lvLoading } = useLatestPublishedVersion(templateId);
  // Prefer the EXACT version the applicant originally submitted on — its field
  // ids match the keys in formData. Only fall back to the latest published
  // version when no submitted version was recorded; otherwise resubmission
  // edits would show blank fields whenever the form template was re-published.
  const { data: submittedVersionInfo } = useFormVersion(versionId || null);
  const resolvedVersionId = (submittedVersionInfo?.id) || versionId || latestVersion?.id || null;
  const { data: sections = [], isLoading: sLoading } = useVersionSections(resolvedVersionId);
  const { data: versionInfo } = useFormVersion(resolvedVersionId);

  const isLoading = tLoading || lvLoading || sLoading;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading form...
      </div>
    );
  }

  if (!template || sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Form template not found or has no fields.
      </p>
    );
  }

  const semanticVersion = versionInfo?.semantic_version || `v${versionInfo?.version || 1}`;
  const isResubmission = applicationStatus === 'resubmission_requested' || applicationStatus === 'query_raised';
  const badgeLabel = isResubmission ? `To Be Resubmitted — v${semanticVersion}` : `Submitted on v${semanticVersion}`;
  const badgeVariant = isResubmission ? 'returned' : 'outline';

  return (
    <div className="space-y-2">
      <FormRenderer
        key={`${templateId}:${resolvedVersionId || 'latest'}`}
        formName={template.name}
        sections={sections}
        initialData={formData}
        onSaveDraft={editable && onSave ? async (data) => { await onSave(templateId, data, resolvedVersionId); } : () => {}}
        onSubmit={editable && onSave ? async (data) => { await onSave(templateId, data, resolvedVersionId); } : () => {}}
        readOnly={!editable}
        saving={saving}
        showFullTabTitles
        portalArea="licensing"
        originalData={originalData}
      />
    </div>
  );
}


interface SubmittedFormsProps {
  formTemplateIds: string[];
  formsData: Record<string, Record<string, any>>;
  formVersionIds?: Record<string, string>;
  /** Per-template save metadata used to order most-recently-saved first. */
  formMeta?: Record<string, { saved_at?: string | null; submitted_at?: string | null; updated_at?: string | null; created_at?: string | null } | undefined>;
  editable?: boolean;
  onSave?: (templateId: string, data: Record<string, any>, versionId?: string | null) => Promise<void>;
  saving?: boolean;
  applicationStatus?: string;
  /**
   * Optional baseline values per template (keyed by templateId). When provided,
   * each form is rendered with diff highlighting against this baseline. Used
   * by the renewal flow to show the original approved application's values.
   */
  originalFormsData?: Record<string, Record<string, any>>;
  /** Called when the last pending form is saved — parent should advance to next step (Documents/Payment) */
  onAllFormsCompleted?: () => void;
}

export function SubmittedForms({
  formTemplateIds: rawTemplateIds,
  formsData,
  formVersionIds = {},
  formMeta = {},
  editable,
  onSave,
  saving,
  applicationStatus,
  originalFormsData,
  onAllFormsCompleted,
}: SubmittedFormsProps) {
  const getTimestamp = (value?: string | null) => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  };

  const getSortKey = (templateId: string) => {
    const meta = formMeta[templateId];
    return [
      getTimestamp(meta?.submitted_at),
      getTimestamp(meta?.updated_at ?? meta?.saved_at),
      getTimestamp(meta?.created_at),
    ] as const;
  };

  // Order: newest submitted response first, then updated, then created. Forms
  // with no timestamp metadata fall back to their original index.
  const formTemplateIds = useMemo(() => {
    const indexed = rawTemplateIds.map((tid, idx) => ({ tid, idx }));
    indexed.sort((a, b) => {
      const aKey = getSortKey(a.tid);
      const bKey = getSortKey(b.tid);
      for (let i = 0; i < bKey.length; i += 1) {
        if (bKey[i] !== aKey[i]) return bKey[i] - aKey[i];
      }
      return a.idx - b.idx;
    });
    return indexed.map(x => x.tid);
  }, [rawTemplateIds, formMeta]);
  // Determine which forms are "completed" (have any data saved)
  const isFormCompleted = (tid: string) => {
    const fd = formsData[tid];
    return !!fd && Object.keys(fd).length > 0;
  };

  // Pick first pending form, or first form if all complete
  const firstPendingId = useMemo(() => {
    return formTemplateIds.find(tid => !isFormCompleted(tid)) || formTemplateIds[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formTemplateIds, formsData]);

  const [openItem, setOpenItem] = useState<string | undefined>(firstPendingId);

  // Re-sync open form when data changes (e.g., after a save) — open the next pending one
  useEffect(() => {
    setOpenItem(firstPendingId);
  }, [firstPendingId]);

  if (!formTemplateIds || formTemplateIds.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No forms were submitted with this application.</p>;
  }

  // Wrapper that auto-advances after a successful save
  const handleSave = async (templateId: string, data: Record<string, any>, versionId?: string | null) => {
    if (!onSave) return;
    await onSave(templateId, data, versionId);
    if (formTemplateIds.length === 1) {
      onAllFormsCompleted?.();
      return;
    }

    // Find next pending form (excluding the one just saved, treating it as completed)
    const nextPending = formTemplateIds.find(tid => {
      if (tid === templateId) return false;
      const fd = tid === templateId ? data : formsData[tid];
      return !fd || Object.keys(fd).length === 0;
    });

    if (nextPending) {
      setOpenItem(nextPending);
    } else {
      // All forms complete — advance parent to next step
      setOpenItem(undefined);
      onAllFormsCompleted?.();
    }
  };

  if (formTemplateIds.length === 1) {
    return (
      <SingleFormViewer
        templateId={formTemplateIds[0]}
        formData={formsData[formTemplateIds[0]] || {}}
        versionId={formVersionIds[formTemplateIds[0]] || null}
        editable={editable}
        onSave={onSave ? handleSave : undefined}
        saving={saving}
        applicationStatus={applicationStatus}
        originalData={originalFormsData?.[formTemplateIds[0]]}
      />
    );
  }

  const completedCount = formTemplateIds.filter(isFormCompleted).length;

  return (
    <div className="space-y-3">
      {/* Progress summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {completedCount} of {formTemplateIds.length} forms completed
        </span>
        {completedCount === formTemplateIds.length && (
          <Badge variant="default" className="text-[10px]">
            <CheckCircle2 className="h-3 w-3 mr-1" /> All forms saved
          </Badge>
        )}
      </div>

      <Accordion
        type="single"
        collapsible
        value={openItem}
        onValueChange={(v) => setOpenItem(v || undefined)}
        className="space-y-2"
      >
        {formTemplateIds.map((tid, idx) => {
          const completed = isFormCompleted(tid);
          const isActive = openItem === tid;
          return (
            <AccordionItem
              key={tid}
              value={tid}
              className={cn(
                'border rounded-lg px-4 transition-colors',
                isActive && 'border-primary/50 bg-primary/[0.02]',
                completed && !isActive && 'border-green-500/30 bg-green-500/[0.02]',
              )}
            >
              <AccordionTrigger className="text-sm font-medium hover:no-underline">
                <div className="flex items-center gap-2 flex-1">
                  {completed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <Circle className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  )}
                  <FormNameLabel templateId={tid} fallbackIndex={idx + 1} />
                  {completed && (
                    <Badge variant="outline" className="text-[10px] ml-2 border-green-500/40 text-green-700 dark:text-green-400">
                      Completed
                    </Badge>
                  )}
                  {!completed && isActive && (
                    <Badge variant="outline" className="text-[10px] ml-2">
                      In Progress
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <SingleFormViewer
                  templateId={tid}
                  formData={formsData[tid] || {}}
                  versionId={formVersionIds[tid] || null}
                  editable={editable}
                  onSave={onSave ? handleSave : undefined}
                  saving={saving}
                  applicationStatus={applicationStatus}
                  originalData={originalFormsData?.[tid]}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
