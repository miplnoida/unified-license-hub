import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CheckCircle2, FileText, Eye, Edit, AlertTriangle } from 'lucide-react';
import { AttachmentDisplay, isAttachmentValue } from '@/components/registration/AttachmentDisplay';
import { isDisplayOnlyField, resolveDisplayKind, resolveDisplayOnlyFieldText, type DisplayKind } from '@/lib/registrationDisplayTypes';
import type { DiffPair, DiffStatus } from '@/lib/formDiff';

interface ReviewTableColumn { id: string; label: string }

interface ReviewField {
  label: string;
  value: any;
  type?: 'attachment' | 'display' | 'table' | string;
  displayKind?: DisplayKind;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  placeholder?: string;
  defaultValue?: string;
  helpText?: string;
  /** Renewal diff: previous (original) value to display under the current one. */
  originalValue?: any;
  /** Renewal diff: when true, highlight the row yellow + "Changed" badge. */
  changed?: boolean;
  /** Optional structured table data with paired rows for added/deleted/edited/reordered. */
  tableColumns?: ReviewTableColumn[];
  tablePairs?: DiffPair<Record<string, any>>[];
}

export interface ReviewSectionEditRef {
  templateIndex: number;
  sectionId?: string;
}

interface ReviewSection {
  title: React.ReactNode;
  fields: ReviewField[];
  /** Identifies which form/section this review block came from, for editing. */
  editRef?: ReviewSectionEditRef;
}

interface ReviewAcknowledgementProps {
  sections: ReviewSection[];
  onAcknowledge: () => void;
  onEdit?: (sectionIndex: number, editRef?: ReviewSectionEditRef) => void;

  mode: 'readonly' | 'editable';
  title?: string;
  description?: string;
  loading?: boolean;
  showCompletionSummary?: boolean;
}

export function ReviewAcknowledgement({
  sections,
  onAcknowledge,
  onEdit,
  mode,
  title = 'Review & Acknowledge',
  description = 'Please review all information before proceeding. Ensure all details are correct.',
  loading = false,
  showCompletionSummary = true,
}: ReviewAcknowledgementProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  const isDisplayOnlyReviewField = (field: ReviewField) => {
    return field.type === 'display' || !!field.displayKind || isDisplayOnlyField(field);
  };

  const getDisplayText = (field: ReviewField) => {
    if (field.type === 'display') {
      return field.value != null && field.value !== '' ? field.value : resolveDisplayOnlyFieldText(field);
    }
    return resolveDisplayOnlyFieldText(field);
  };

  const getResolvedDisplayKind = (field: ReviewField): DisplayKind => {
    if (field.displayKind) return field.displayKind;
    return resolveDisplayKind(field.type);
  };

  const renderDisplayOnlyField = (field: ReviewField, key: number) => {
    const displayKind = getResolvedDisplayKind(field);
    const displayText = getDisplayText(field);

    if (displayKind === 'divider') {
      return <Separator key={key} className="my-2" />;
    }

    if (displayKind === 'heading') {
      return (
        <h4 key={key} className="font-semibold text-base mt-4 mb-2 text-foreground">
          {displayText}
        </h4>
      );
    }

    return (
      <div key={key} className="text-sm text-muted-foreground my-2">
        {displayText}
      </div>
    );
  };

  const statusBadge = (status: DiffStatus) => {
    if (status === 'unchanged') return null;
    const label =
      status === 'added' ? 'Added'
      : status === 'deleted' ? 'Deleted'
      : status === 'reordered' ? 'Reordered'
      : 'Changed';
    const cls = status === 'deleted'
      ? 'text-[10px] text-red-700 border-red-400 bg-red-100/70 dark:text-red-200'
      : 'text-[10px] text-yellow-800 border-yellow-500 bg-yellow-100/70 dark:text-yellow-200';
    return <Badge variant="outline" className={cls}>{label}</Badge>;
  };

  const renderTableDiff = (field: ReviewField, key: number) => {
    const cols = field.tableColumns || [];
    const pairs = field.tablePairs || [];
    const anyChange = pairs.some((p) => p.status !== 'unchanged');
    return (
      <div key={key} className={anyChange ? 'rounded-md border border-yellow-400 bg-yellow-50/40 dark:bg-yellow-950/20 p-2' : 'rounded-md border p-2'}>
        <div className="text-sm font-medium mb-2 flex items-center gap-2 flex-wrap">
          {field.label}
          {anyChange && <Badge variant="outline" className="text-[10px] text-yellow-800 border-yellow-500 bg-yellow-100/70 dark:text-yellow-200">Changed</Badge>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border">
            <thead>
              <tr className="bg-muted">
                <th className="p-1 border-b text-left w-24">Status</th>
                {cols.map((c) => (
                  <th key={c.id} className="p-1 border-b text-left">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => {
                const cur = (p.current as Record<string, unknown>) || null;
                const orig = (p.original as Record<string, unknown>) || null;
                const rowBg =
                  p.status === 'deleted' ? 'bg-red-50/40 dark:bg-red-950/20'
                  : p.status === 'unchanged' ? ''
                  : 'bg-yellow-50/40 dark:bg-yellow-950/20';
                return (
                  <tr key={i} className={`border-b ${rowBg}`}>
                    <td className="p-1 align-top">{statusBadge(p.status) || <span className="text-muted-foreground">—</span>}</td>
                    {cols.map((c) => {
                      const cv = cur ? cur[c.id] : undefined;
                      const ov = orig ? orig[c.id] : undefined;
                      const showOrig =
                        (p.status === 'edited' || p.status === 'deleted') &&
                        ov != null && ov !== '' &&
                        String(ov) !== String(cv ?? '');
                      return (
                        <td key={c.id} className="p-1 align-top">
                          {p.status === 'deleted' ? (
                            <span className="text-muted-foreground italic">{String(ov ?? '')}</span>
                          ) : (
                            <span>{String(cv ?? '')}</span>
                          )}
                          {showOrig && p.status !== 'deleted' && (
                            <div className="text-[10px] text-muted-foreground italic">Was: {String(ov)}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const countable = (section: ReviewSection) =>
    section.fields.filter(f => !isDisplayOnlyReviewField(f));
  const filledOf = (section: ReviewSection) =>
    countable(section).filter(f => f.value != null && f.value !== '').length;

  const totalFields = sections.reduce((n, s) => n + countable(s).length, 0);
  const totalFilled = sections.reduce((n, s) => n + filledOf(s), 0);
  const completion = totalFields === 0 ? 100 : Math.round((totalFilled / totalFields) * 100);

  const isWideField = (field: ReviewField) => {
    if (field.type === 'attachment' || isAttachmentValue(field.value)) return true;
    if (field.tablePairs && field.tableColumns) return true;
    if (typeof field.value === 'string' && (field.value.length > 60 || field.value.includes('\n'))) return true;
    return false;
  };

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="border-b bg-muted/30 rounded-t-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {showCompletionSummary && (
            <div className="min-w-[190px] space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Completion</span>
                <span className="text-lg font-semibold tabular-nums text-foreground">{completion}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${completion}%` }}
                />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{sections.length} sections</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span>{totalFilled} of {totalFields} fields captured</span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <Accordion type="multiple" defaultValue={sections.map((_, i) => `section-${i}`)} className="space-y-3">
          {sections.map((section, sIdx) => {
            const total = countable(section).length;
            const filled = filledOf(section);
            const isComplete = total === 0 || filled === total;
            return (
              <AccordionItem
                key={sIdx}
                value={`section-${sIdx}`}
                className="rounded-lg border bg-card px-0 overflow-hidden data-[state=open]:shadow-sm"
              >
                <div className="flex items-center gap-2 bg-muted/40 pr-2">
                  <AccordionTrigger className="flex-1 px-3 py-3 text-sm font-semibold hover:no-underline">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-left">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary tabular-nums">
                        {String(sIdx + 1).padStart(2, '0')}
                      </span>
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{section.title}</span>
                      {showCompletionSummary && (
                        <Badge
                          variant="outline"
                          className={
                            isComplete
                              ? 'text-[10px] border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'text-[10px] border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          }
                        >
                          {isComplete ? `${filled}/${total} complete` : `${filled}/${total} completed`}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  {mode === 'editable' && onEdit && (
                    <Button
                      data-rbac="application_management.edit"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-primary"
                      aria-label={`Edit section ${sIdx + 1}`}
                      title="Edit this section"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(sIdx, section.editRef);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <AccordionContent className="px-3 pb-3 pt-0">
                  <div className="grid gap-x-6 gap-y-0 md:grid-cols-2">
                    {section.fields.map((field, fIdx) => {
                      if (isDisplayOnlyReviewField(field)) {
                        return (
                          <div key={fIdx} className="md:col-span-2">
                            {renderDisplayOnlyField(field, fIdx)}
                          </div>
                        );
                      }
                      if (field.tablePairs && field.tableColumns) {
                        return (
                          <div key={fIdx} className="md:col-span-2 py-2">
                            {renderTableDiff(field, fIdx)}
                          </div>
                        );
                      }
                      const changed = !!field.changed;
                      const isAttachmentLike = field.type === 'attachment' || isAttachmentValue(field.value);
                      const hasOriginal = field.originalValue != null && field.originalValue !== '';
                      return (
                        <div
                          key={fIdx}
                          className={[
                            'border-b border-border/50 py-2.5 last:border-b-0',
                            isWideField(field) ? 'md:col-span-2' : '',
                            changed ? 'rounded-md border border-yellow-400 bg-yellow-50 px-2 dark:bg-yellow-950/30' : '',
                          ].join(' ')}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {field.label}
                            </span>
                            {changed && (
                              <Badge variant="outline" className="text-[10px] text-yellow-800 border-yellow-500 bg-yellow-100/70 dark:text-yellow-200">
                                Changed
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex min-w-0 flex-col items-start gap-1 text-sm">
                            {field.type === 'attachment' ? (
                              <div className="min-w-0 w-full">
                                <AttachmentDisplay value={field.value} />
                              </div>
                            ) : field.value == null || field.value === '' ? (
                              <span className="font-medium italic text-muted-foreground/60">Not provided</span>
                            ) : isAttachmentValue(field.value) ? (
                              <div className="min-w-0 w-full">
                                <AttachmentDisplay value={field.value} />
                              </div>
                            ) : typeof field.value === 'boolean' ? (
                              <span className="font-medium break-words">
                                {field.value ? <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" /> : '—'}
                              </span>
                            ) : (
                              <span className="font-medium break-words whitespace-pre-wrap text-foreground">{String(field.value)}</span>
                            )}
                            {changed && hasOriginal && (
                              isAttachmentLike || isAttachmentValue(field.originalValue) ? (
                                <div className="min-w-0 w-full">
                                  <span className="text-[11px] text-muted-foreground italic block mb-1">Was:</span>
                                  <AttachmentDisplay value={field.originalValue} />
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground italic">
                                  Was: {typeof field.originalValue === 'boolean'
                                    ? (field.originalValue ? 'Yes' : 'No')
                                    : String(field.originalValue)}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Applicant declaration</h3>
          <div className="flex items-start gap-3">
            <Checkbox
              id="acknowledge"
              className="mt-0.5"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(!!v)}
            />
            <Label htmlFor="acknowledge" className="text-sm leading-relaxed cursor-pointer font-normal">
              I have reviewed all the information above and confirm that the details provided are accurate and complete.
              I understand that any false or misleading information may result in rejection of my application.
            </Label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {!acknowledged && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              Please acknowledge the declaration to proceed.
            </span>
          )}
          <Button size="lg" onClick={onAcknowledge} disabled={!acknowledged || loading}>
            {loading ? 'Processing...' : 'Confirm & Proceed'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
