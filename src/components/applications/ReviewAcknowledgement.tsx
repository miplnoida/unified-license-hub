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

interface ReviewField {
  label: string;
  value: any;
  type?: 'attachment' | 'display' | string;
  displayKind?: DisplayKind;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  placeholder?: string;
  defaultValue?: string;
  helpText?: string;
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
    return field.type === 'display' || isDisplayOnlyField(field);
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
                      const displayKind = getResolvedDisplayKind(field);
                      const displayText = getDisplayText(field);

                      if (displayKind === 'divider') {
                        return <Separator key={fIdx} className="my-2" />;
                      }

                      if (displayKind === 'heading') {
                        const lvl = field.headingLevel || 3;
                        const sizeCls = lvl <= 2 ? 'text-base' : 'text-sm';
                        return (
                          <div key={fIdx} className={`font-semibold text-foreground ${sizeCls} pt-2`}>
                            {displayText}
                          </div>
                        );
                      }

                      return (
                        <p key={fIdx} className="text-sm text-muted-foreground px-2">
                          {displayText}
                        </p>
                      );
                    }
                    return (
                      <div key={fIdx} className="flex items-start justify-between gap-4 text-sm px-2 py-1.5 rounded-md hover:bg-muted/50">
                        <span className="text-muted-foreground min-w-[140px] shrink-0">{field.label}</span>
                        {field.type === 'attachment' ? (
                          <div className="flex-1 min-w-0 max-w-[360px]">
                            <AttachmentDisplay value={field.value} />
                          </div>
                        ) : field.value == null || field.value === '' ? (
                          <span className="font-medium text-right break-words max-w-[300px] text-muted-foreground/60 italic">Not provided</span>
                        ) : isAttachmentValue(field.value) ? (
                          <div className="flex-1 min-w-0 max-w-[360px]">
                            <AttachmentDisplay value={field.value} />
                          </div>
                        ) : typeof field.value === 'boolean' ? (
                          <span className="font-medium text-right break-words max-w-[300px]">
                            {field.value ? <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" /> : '—'}
                          </span>
                        ) : (
                          <span className="font-medium text-right break-words max-w-[300px]">{String(field.value)}</span>
                        )}
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
