import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CheckCircle2, FileText, Eye, Loader2 } from 'lucide-react';
import { useLatestPublishedVersion, useVersionSections } from '@/hooks/useFormTemplates';

interface ReturnReviewPanelProps {
  returnSummary: { label: string; value: string | number | null | undefined }[];
  forms: Array<{ formId: string; name: string; tabName: string }>;
  allData: Record<string, Record<string, any>>;
  onAcknowledge: () => void;
  loading?: boolean;
  title?: string;
  description?: string;
}

interface FormReviewBlockProps {
  formId: string;
  name: string;
  tabName: string;
  data: Record<string, any>;
}

function formatValue(val: any): React.ReactNode {
  if (val == null || val === '') {
    return <span className="text-muted-foreground/60 italic">Not provided</span>;
  }
  if (typeof val === 'boolean') {
    return val ? <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" /> : '—';
  }
  if (typeof val === 'object') {
    try { return <code className="text-xs">{JSON.stringify(val)}</code>; }
    catch { return String(val); }
  }
  // Try parse JSON-string objects (saved by FillReturnPage.handleSave)
  if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'object') return <code className="text-xs">{JSON.stringify(parsed)}</code>;
    } catch { /* fall-through */ }
  }
  return String(val);
}

function FormReviewBlock({ formId, name, tabName, data }: FormReviewBlockProps) {
  const { data: version, isLoading: vLoading } = useLatestPublishedVersion(formId);
  const { data: sections = [], isLoading: sLoading } = useVersionSections(version?.id || null);

  const loading = vLoading || sLoading;

  // Build a label map: fieldName → label
  const labelMap = new Map<string, string>();
  sections.forEach((sec: any) => {
    (sec.fields || []).forEach((f: any) => {
      if (f?.fieldName) labelMap.set(f.fieldName, f.label || f.fieldName);
    });
  });

  // Filter out internal/repeatable scaffolding keys
  const entries = Object.entries(data || {}).filter(
    ([k]) => k !== '__repeatable' && !k.startsWith('_repeatable_')
  );

  const filledCount = entries.filter(([, v]) => v != null && v !== '').length;

  return (
    <AccordionItem value={`form-${formId}`}>
      <AccordionTrigger className="text-sm font-semibold">
        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="h-4 w-4 text-primary" />
          <span>{name}</span>
          <Badge variant="outline" className="text-[10px]">{tabName}</Badge>
          <Badge variant="outline" className="text-[10px]">
            {filledCount}/{entries.length || 0} filled
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading fields...
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">
            No data entered for this form yet.
          </p>
        ) : (
          <div className="grid gap-2 py-2">
            {entries.map(([fieldName, value]) => (
              <div
                key={fieldName}
                className="flex items-start justify-between gap-4 text-sm px-2 py-1.5 rounded-md hover:bg-muted/50 border-b border-border/40 last:border-0"
              >
                <span className="text-muted-foreground min-w-[180px] shrink-0">
                  {labelMap.get(fieldName) || fieldName}
                </span>
                <span className="font-medium text-right break-words max-w-[60%]">
                  {formatValue(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function ReturnReviewPanel({
  returnSummary,
  forms,
  allData,
  onAcknowledge,
  loading = false,
  title = 'Review & Submit Return',
  description = 'Verify all entered data below. Submission is final.',
}: ReturnReviewPanelProps) {
  const [acknowledged, setAcknowledged] = useState(false);

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
        {/* Return summary block */}
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Return Details
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {returnSummary.map((f, i) => (
              <div key={i} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="font-medium text-right">
                  {f.value == null || f.value === ''
                    ? <span className="text-muted-foreground/60 italic">—</span>
                    : String(f.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Per-form filled values */}
        <div>
          <div className="text-sm font-semibold mb-2">Submitted Form Data</div>
          {forms.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No forms to review.</p>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={forms.map(f => `form-${f.formId}`)}
              className="border rounded-md divide-y"
            >
              {forms.map(f => (
                <FormReviewBlock
                  key={f.formId}
                  formId={f.formId}
                  name={f.name}
                  tabName={f.tabName}
                  data={allData[f.formId] || {}}
                />
              ))}
            </Accordion>
          )}
        </div>

        {/* Acknowledgement */}
        <div className="rounded-md border p-3 bg-card">
          <div className="flex items-start gap-2">
            <Checkbox
              id="ack-return"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            <Label htmlFor="ack-return" className="text-sm leading-relaxed cursor-pointer">
              I confirm that the data submitted in this return is accurate and complete to the best
              of my knowledge.
            </Label>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              onClick={onAcknowledge}
              disabled={!acknowledged || loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Acknowledge & Submit
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
