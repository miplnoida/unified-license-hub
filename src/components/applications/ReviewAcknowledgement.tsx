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

interface ReviewSection {
  title: React.ReactNode;
  fields: ReviewField[];
}

interface ReviewAcknowledgementProps {
  sections: ReviewSection[];
  onAcknowledge: () => void;
  onEdit?: (sectionIndex: number) => void;
  mode: 'readonly' | 'editable';
  title?: string;
  description?: string;
  loading?: boolean;
}

export function ReviewAcknowledgement({
  sections,
  onAcknowledge,
  onEdit,
  mode,
  title = 'Review & Acknowledge',
  description = 'Please review all information before proceeding. Ensure all details are correct.',
  loading = false,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Accordion type="multiple" defaultValue={sections.map((_, i) => `section-${i}`)}>
          {sections.map((section, sIdx) => (
            <AccordionItem key={sIdx} value={`section-${sIdx}`}>
              <AccordionTrigger className="text-sm font-semibold">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {section.title}
                  <Badge variant="outline" className="text-[10px]">
                    {section.fields.filter(f => !isDisplayOnlyReviewField(f) && f.value != null && f.value !== '').length}/{section.fields.filter(f => !isDisplayOnlyReviewField(f)).length} filled
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3 py-2">
                  {section.fields.map((field, fIdx) => {
                    if (isDisplayOnlyReviewField(field)) {
                      return renderDisplayOnlyField(field, fIdx);
                    }
                    if (field.tablePairs && field.tableColumns) {
                      return renderTableDiff(field, fIdx);
                    }
                    const changed = !!field.changed;
                    const isAttachmentLike = field.type === 'attachment' || isAttachmentValue(field.value);
                    const hasOriginal = field.originalValue != null && field.originalValue !== '';
                    return (
                      <div
                        key={fIdx}
                        className={
                          changed
                            ? 'flex items-start justify-between gap-4 text-sm px-2 py-1.5 rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30'
                            : 'flex items-start justify-between gap-4 text-sm px-2 py-1.5 rounded-md hover:bg-muted/50'
                        }
                      >
                        <span className="text-muted-foreground min-w-[140px] shrink-0 flex items-center gap-2 flex-wrap">
                          {field.label}
                          {changed && (
                            <Badge variant="outline" className="text-[10px] text-yellow-800 border-yellow-500 bg-yellow-100/70 dark:text-yellow-200">
                              Changed
                            </Badge>
                          )}
                        </span>
                        <div className="flex-1 min-w-0 flex flex-col items-end gap-1">
                          {field.type === 'attachment' ? (
                            <div className="min-w-0 max-w-[360px] w-full">
                              <AttachmentDisplay value={field.value} />
                            </div>
                          ) : field.value == null || field.value === '' ? (
                            <span className="font-medium text-right break-words max-w-[300px] text-muted-foreground/60 italic">Not provided</span>
                          ) : isAttachmentValue(field.value) ? (
                            <div className="min-w-0 max-w-[360px] w-full">
                              <AttachmentDisplay value={field.value} />
                            </div>
                          ) : typeof field.value === 'boolean' ? (
                            <span className="font-medium text-right break-words max-w-[300px]">
                              {field.value ? <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" /> : '—'}
                            </span>
                          ) : (
                            <span className="font-medium text-right break-words max-w-[300px]">{String(field.value)}</span>
                          )}
                          {changed && hasOriginal && (
                            isAttachmentLike || isAttachmentValue(field.originalValue) ? (
                              <div className="min-w-0 max-w-[360px] w-full">
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
                {mode === 'editable' && onEdit && (
                  <div className="flex justify-end pt-2">
                    <Button variant="outline" size="sm" onClick={() => onEdit(sIdx)}>
                      <Edit className="h-3 w-3 mr-1" /> Edit Section
                    </Button>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <Separator />

        <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
          <Checkbox
            id="acknowledge"
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(!!v)}
          />
          <Label htmlFor="acknowledge" className="text-sm leading-relaxed cursor-pointer">
            I have reviewed all the information above and confirm that the details provided are accurate and complete.
            I understand that any false or misleading information may result in rejection of my application.
          </Label>
        </div>

        {!acknowledged && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            Please acknowledge the declaration to proceed.
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onAcknowledge} disabled={!acknowledged || loading}>
            {loading ? 'Processing...' : 'Confirm & Proceed'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
