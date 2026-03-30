import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { History, Eye, GitBranch, Calendar } from 'lucide-react';
import { useFormVersions } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import type { FormSection } from '@/types/formBuilder';

interface VersionHistoryProps {
  templateId: string;
  formName: string;
}

export function VersionHistory({ templateId, formName }: VersionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<{ sections: FormSection[]; label: string } | null>(null);
  const { data: versions = [] } = useFormVersions(templateId);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <History className="h-4 w-4 mr-1" />
        History
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Version History
            </DialogTitle>
            <DialogDescription>{formName} — {versions.length} version(s)</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-3">
              {versions.map((v: any, idx: number) => (
                <Card key={v.id} className={idx === 0 ? 'border-primary/50' : ''}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant={idx === 0 ? 'default' : 'secondary'} className="gap-1">
                          <GitBranch className="h-3 w-3" />
                          v{v.semantic_version || `${v.version}.0`}
                        </Badge>
                        <Badge variant="outline" className="capitalize text-xs">
                          {v.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(v.created_at).toLocaleDateString()}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const sections = (v.schema_snapshot || []) as unknown as FormSection[];
                            setPreviewVersion({
                              sections,
                              label: `v${v.semantic_version || v.version}`,
                            });
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                      </div>
                    </div>
                    {v.change_notes && (
                      <p className="text-xs text-muted-foreground mt-1.5">{v.change_notes}</p>
                    )}
                    {idx === 0 && (
                      <span className="text-[10px] text-primary font-medium">Current</span>
                    )}
                  </CardContent>
                </Card>
              ))}
              {versions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No versions yet.</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Read-only version preview */}
      <Dialog open={!!previewVersion} onOpenChange={() => setPreviewVersion(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formName} — {previewVersion?.label}</DialogTitle>
            <DialogDescription>Read-only view of this version</DialogDescription>
          </DialogHeader>
          {previewVersion && previewVersion.sections.length > 0 ? (
            <FormRenderer
              formName={formName}
              sections={previewVersion.sections}
              onSaveDraft={() => {}}
              onSubmit={() => {}}
              readOnly
            />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No fields in this version.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
