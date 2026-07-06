import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { CheckCircle2, FileText, Eye, Loader2, ArrowRight } from 'lucide-react';
import { useLatestPublishedVersion, useVersionSections } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { statusLabel, type ReturnFormStatus } from '@/lib/returnsFormProgress';

interface ReturnFormEntry {
  formId: string;
  name: string;
  tabName: string;
  status?: ReturnFormStatus;
}

interface ReturnReviewPanelProps {
  returnSummary: { label: string; value: string | number | null | undefined }[];
  forms: ReturnFormEntry[];
  allData: Record<string, Record<string, any>>;
  onAcknowledge: () => void;
  onJumpToForm?: (formId: string) => void;
  loading?: boolean;
  disabled?: boolean;
  title?: string;
  description?: string;
}

interface FormReviewBlockProps {
  formId: string;
  name: string;
  tabName: string;
  status?: ReturnFormStatus;
  data: Record<string, any>;
  onJumpToForm?: (formId: string) => void;
}

function FormReviewBlock({ formId, name, tabName, status, data, onJumpToForm }: FormReviewBlockProps) {
  const { data: version, isLoading: vLoading } = useLatestPublishedVersion(formId);
  const { data: sections = [], isLoading: sLoading } = useVersionSections(version?.id || null);

  const loading = vLoading || sLoading;
  const statusVariant: any =
    status === 'completed' ? 'default' : status === 'in_progress' ? 'secondary' : 'outline';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <FileText className="h-4 w-4 text-primary" />
          <span>{name}</span>
          <Badge variant="outline" className="text-[10px]">{tabName}</Badge>
          {status && (
            <Badge variant={statusVariant} className="text-[10px]">
              {statusLabel(status)}
            </Badge>
          )}
          {onJumpToForm && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="ml-auto h-auto p-0 text-xs"
              onClick={() => onJumpToForm(formId)}
            >
              Go to form <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading form...
          </div>
        ) : sections.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">
            No fields defined for this form.
          </p>
        ) : (
          <FormRenderer
            formName=""
            sections={sections}
            initialData={data}
            onSaveDraft={() => {}}
            onSubmit={() => {}}
            readOnly
            showFullTabTitles
          />
        )}
      </CardContent>
    </Card>
  );
}

export function ReturnReviewPanel({
  returnSummary,
  forms,
  allData,
  onAcknowledge,
  onJumpToForm,
  loading = false,
  disabled = false,
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

        {/* Per-form filled values rendered as read-only forms */}
        <div className="space-y-4">
          <div className="text-sm font-semibold">
            Submitted Form Data
            {forms.length > 0 && (
              <span className="text-muted-foreground font-normal ml-2">
                ({forms.length} form{forms.length === 1 ? '' : 's'})
              </span>
            )}
          </div>
          {forms.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No forms to review.</p>
          ) : (
            forms.map(f => (
              <FormReviewBlock
                key={f.formId}
                formId={f.formId}
                name={f.name}
                tabName={f.tabName}
                status={f.status}
                data={allData[f.formId] || {}}
                onJumpToForm={onJumpToForm}
              />
            ))
          )}
        </div>

        {/* Acknowledgement */}
        <div className="rounded-md border p-3 bg-card">
          <div className="flex items-start gap-2">
            <Checkbox
              id="ack-return"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
              disabled={disabled}
            />
            <Label htmlFor="ack-return" className="text-sm leading-relaxed cursor-pointer">
              I confirm that the data submitted in this return is accurate and complete to the best
              of my knowledge.
            </Label>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              onClick={onAcknowledge}
              disabled={!acknowledged || loading || disabled}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Acknowledge & Submit
            </Button>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
