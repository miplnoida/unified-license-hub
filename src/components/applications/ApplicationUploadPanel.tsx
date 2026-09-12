/**
 * ApplicationUploadPanel (UI-only)
 *
 * Lets an applicant download an XLSX/XML sample template that reflects the
 * currently-active form's live schema, fill it offline, and pick a filled
 * file for import. Parsing + hydration into form state is intentionally not
 * wired yet — the "Import into application" button stays disabled with a
 * helper tooltip until Phase 2.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Download, Upload, FileSpreadsheet, FileCode2, X, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildApplicationExcelTemplate,
  buildApplicationXmlTemplate,
  type AppTemplateSection,
} from '@/lib/applicationTemplate';
import { APPLICATION_BULK_FILL_ENABLED } from '@/lib/featureFlags';

interface SectionLike {
  title?: string | null;
  fields?: Array<{
    label?: string | null;
    fieldName?: string | null;
    type?: string | null;
    required?: boolean;
  }>;
}

interface Props {
  formName: string;
  sections: SectionLike[];
  disabled?: boolean;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const SKIP_TYPES = new Set(['section', 'divider', 'heading', 'content']);

/**
 * The feature flag is checked in this wrapper so the panel below can declare
 * its hooks unconditionally.
 */
export function ApplicationUploadPanel(props: Props) {
  if (!APPLICATION_BULK_FILL_ENABLED) return null;
  return <ApplicationUploadPanelInner {...props} />;
}

function ApplicationUploadPanelInner({ formName, sections, disabled }: Props) {


  const [collapsed, setCollapsed] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);

  const normalized: AppTemplateSection[] = useMemo(
    () =>
      (sections || []).map((s) => ({
        title: (s.title || 'Section').toString(),
        fields: (s.fields || [])
          .filter((f) => f && f.fieldName && f.type && !SKIP_TYPES.has(String(f.type)))
          .map((f) => ({
            label: (f.label || f.fieldName || '').toString(),
            fieldName: String(f.fieldName),
            type: String(f.type),
            required: !!f.required,
          })),
      })),
    [sections],
  );

  const totalFields = useMemo(
    () => normalized.reduce((n, s) => n + s.fields.length, 0),
    [normalized],
  );

  const noSchema = totalFields === 0;
  const safeFormName = formName?.trim() || 'Application';
  const fileBase = safeFormName.replace(/[^a-zA-Z0-9._-]+/g, '_');

  const downloadExcel = () => {
    if (noSchema) return;
    const blob = buildApplicationExcelTemplate(safeFormName, normalized);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBase}_template.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Excel template downloaded');
  };

  const downloadXml = () => {
    if (noSchema) return;
    const blob = buildApplicationXmlTemplate(safeFormName, normalized);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBase}_template.xml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('XML template downloaded');
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size === 0) { toast.error('The file is empty.'); return; }
    if (file.size > MAX_FILE_SIZE) { toast.error('File exceeds the 20MB limit.'); return; }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xml') {
      toast.error('Only .xlsx or .xml files generated from the template are supported.');
      return;
    }
    setPickedFile(file);
    toast.info('File selected. Parsing will be enabled in the next release.');
  };

  const inputId = `app-upload-input-${fileBase}`;

  return (
    <TooltipProvider>
      <Card className="border-dashed">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" /> Bulk Fill via Excel or XML
            <Badge variant="outline" className="ml-2">
              {normalized.length} section{normalized.length === 1 ? '' : 's'} · {totalFields} field{totalFields === 1 ? '' : 's'}
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </CardHeader>

        {!collapsed && (
          <CardContent className="space-y-4">
            {noSchema ? (
              <Alert>
                <AlertDescription>
                  No form fields are available yet. Templates will become downloadable once the form finishes loading.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button data-rbac="application_management.import" variant="outline" size="sm" onClick={downloadExcel} disabled={disabled}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Download Sample (Excel)
                </Button>
                <Button data-rbac="application_management.import" variant="outline" size="sm" onClick={downloadXml} disabled={disabled}>
                  <FileCode2 className="h-4 w-4 mr-2" /> Download Sample (XML)
                </Button>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3.5 w-3.5" />
                  Samples regenerate automatically whenever the form is updated in the backend.
                </span>
              </div>
            )}

            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium">Upload filled file</p>
                  <p className="text-xs text-muted-foreground">
                    Accepts .xlsx or .xml exported from the sample template.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id={inputId}
                    accept=".xlsx,.xml"
                    className="hidden"
                    disabled={disabled || noSchema}
                    onChange={(e) => {
                      handleFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <Button data-rbac="application_management.import"
                    size="sm"
                    variant="outline"
                    onClick={() => document.getElementById(inputId)?.click()}
                    disabled={disabled || noSchema}
                  >
                    <Upload className="h-4 w-4 mr-2" /> Choose file
                  </Button>
                </div>
              </div>

              {pickedFile && (
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{pickedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(pickedFile.size / 1024).toFixed(1)} KB · {pickedFile.type || 'unknown type'}
                    </p>
                  </div>
                  <Button data-rbac="application_management.edit" variant="ghost" size="sm" onClick={() => setPickedFile(null)}>
                    <X className="h-3.5 w-3.5 mr-1" /> Remove
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {pickedFile
                    ? 'File parsed successfully preview will appear here. Review changes below before importing.'
                    : 'Once you upload a filled template, a preview of detected values will appear here.'}
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" data-rbac="application_management.import" disabled>
                        <Download className="h-4 w-4 mr-2 rotate-180" /> Import into application
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Coming soon — parser is not wired yet. Sample download works today.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </TooltipProvider>
  );
}
