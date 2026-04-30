import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { GitMerge, Plus, Minus, Edit3, Loader2, Info } from 'lucide-react';
import { useFormVersion, useVersionSections, useLatestPublishedVersion } from '@/hooks/useFormTemplates';
import type { FormSection, FormField } from '@/types/formBuilder';

interface MigrationCheckDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  /** The version the submission was filed on. */
  submittedVersionId: string | null;
  /** Optional: the submitted data so we can flag impacted fields. */
  submittedData?: Record<string, any>;
  formName?: string;
}

interface DiffItem {
  type: 'added' | 'removed' | 'changed';
  sectionTitle: string;
  fieldLabel: string;
  fieldName: string;
  details?: string;
  hadValue?: boolean;
}

function computeMigrationDiff(
  oldSections: FormSection[],
  newSections: FormSection[],
  submittedData: Record<string, any> = {},
): DiffItem[] {
  const items: DiffItem[] = [];
  const oldFields = new Map<string, { field: FormField; section: string }>();
  const newFields = new Map<string, { field: FormField; section: string }>();

  oldSections.forEach(s => s.fields.forEach(f => oldFields.set(f.id, { field: f, section: s.title })));
  newSections.forEach(s => s.fields.forEach(f => newFields.set(f.id, { field: f, section: s.title })));

  // Removed (data won't carry)
  oldFields.forEach((v, id) => {
    if (!newFields.has(id)) {
      const had = submittedData[v.field.fieldName] !== undefined && submittedData[v.field.fieldName] !== '' && submittedData[v.field.fieldName] !== null;
      items.push({ type: 'removed', sectionTitle: v.section, fieldLabel: v.field.label, fieldName: v.field.fieldName, hadValue: had });
    }
  });

  // Added (will be empty in migrated submission)
  newFields.forEach((v, id) => {
    if (!oldFields.has(id)) {
      items.push({
        type: 'added',
        sectionTitle: v.section,
        fieldLabel: v.field.label,
        fieldName: v.field.fieldName,
        details: v.field.required ? 'Required — would need a value before save' : 'Optional',
      });
    }
  });

  // Changed (potential data incompatibility)
  newFields.forEach((v, id) => {
    const old = oldFields.get(id);
    if (!old) return;
    const changes: string[] = [];
    if (old.field.type !== v.field.type) changes.push(`Type: ${old.field.type} → ${v.field.type}`);
    if (old.field.required !== v.field.required) changes.push(`Required: ${old.field.required} → ${v.field.required}`);
    if (JSON.stringify(old.field.options) !== JSON.stringify(v.field.options)) changes.push('Options changed');
    if (JSON.stringify(old.field.validation) !== JSON.stringify(v.field.validation)) changes.push('Validation changed');
    if (changes.length > 0) {
      const had = submittedData[v.field.fieldName] !== undefined && submittedData[v.field.fieldName] !== '' && submittedData[v.field.fieldName] !== null;
      items.push({ type: 'changed', sectionTitle: v.section, fieldLabel: v.field.label, fieldName: v.field.fieldName, details: changes.join('; '), hadValue: had });
    }
  });

  return items;
}

const iconMap = {
  added: <Plus className="h-4 w-4 text-green-600" />,
  removed: <Minus className="h-4 w-4 text-red-600" />,
  changed: <Edit3 className="h-4 w-4 text-amber-600" />,
};

const bgMap = {
  added: 'bg-green-50 dark:bg-green-950/30 border-green-200',
  removed: 'bg-red-50 dark:bg-red-950/30 border-red-200',
  changed: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200',
};

export function MigrationCheckDialog({
  open,
  onOpenChange,
  templateId,
  submittedVersionId,
  submittedData = {},
  formName,
}: MigrationCheckDialogProps) {
  const { data: submittedVersion, isLoading: svLoading } = useFormVersion(submittedVersionId);
  const { data: latestVersion, isLoading: lvLoading } = useLatestPublishedVersion(templateId);
  const { data: oldSections = [], isLoading: oldLoading } = useVersionSections(submittedVersionId);
  const { data: newSections = [], isLoading: newLoading } = useVersionSections(latestVersion?.id || null);

  const sameVersion = !!latestVersion && latestVersion.id === submittedVersionId;
  const loading = svLoading || lvLoading || oldLoading || newLoading;

  const diff = useMemo(
    () => (loading || sameVersion ? [] : computeMigrationDiff(oldSections as FormSection[], newSections as FormSection[], submittedData)),
    [loading, sameVersion, oldSections, newSections, submittedData],
  );

  const stats = useMemo(() => ({
    added: diff.filter(d => d.type === 'added').length,
    removed: diff.filter(d => d.type === 'removed').length,
    changed: diff.filter(d => d.type === 'changed').length,
    impacted: diff.filter(d => d.hadValue).length,
  }), [diff]);

  const oldLabel = (submittedVersion as any)?.semantic_version || `v${(submittedVersion as any)?.version || ''}`;
  const newLabel = (latestVersion as any)?.semantic_version || `v${(latestVersion as any)?.version || ''}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" /> Migration Check {formName ? `— ${formName}` : ''}
          </DialogTitle>
          <DialogDescription>
            Read-only preview of what would change if this submission moved from{' '}
            <strong>v{oldLabel}</strong> to the newest published version <strong>v{newLabel}</strong>.
            No data is modified.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Computing differences...
          </div>
        ) : sameVersion ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This submission is already on the latest published version. No migration needed.
            </AlertDescription>
          </Alert>
        ) : !submittedVersionId ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This submission has no recorded form version, so a precise migration diff cannot be computed.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">+{stats.added} added</Badge>
              <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400">−{stats.removed} removed</Badge>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">~{stats.changed} changed</Badge>
              {stats.impacted > 0 && (
                <Badge variant="outline" className="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400">
                  {stats.impacted} field(s) with submitted values are impacted
                </Badge>
              )}
            </div>

            <ScrollArea className="max-h-[55vh] pr-2">
              <div className="space-y-2">
                {diff.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No structural differences detected. Existing data should map cleanly to the new version.
                  </p>
                ) : (
                  diff.map((item, idx) => (
                    <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border ${bgMap[item.type]}`}>
                      {iconMap[item.type]}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{item.fieldLabel}</span>
                          {item.fieldName && (
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.fieldName}</code>
                          )}
                          {item.hadValue && (
                            <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              has submitted value
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">Section: {item.sectionTitle}</p>
                        {item.details && <p className="text-xs mt-1">{item.details}</p>}
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize">{item.type}</Badge>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
