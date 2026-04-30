import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { History, Eye, GitBranch, Calendar, Send, Power, PowerOff, CalendarClock, Loader2 } from 'lucide-react';
import {
  useFormVersions,
  useUpdateVersionSchedule,
  isVersionEffective,
  notifyUpcomingVersionIfNeeded,
  notifyVersionToLicensees,
} from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { VersionDiffViewer } from '@/components/form-builder/VersionDiffViewer';
import type { FormSection } from '@/types/formBuilder';
import { toast } from 'sonner';
import Swal from 'sweetalert2';

interface VersionHistoryProps {
  templateId: string;
  formName: string;
  trigger?: React.ReactNode;
}

function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function fromDateInput(value: string): string | null {
  if (!value) return null;
  // Send as ISO timestamp at start-of-day UTC; effective_until handled inclusively at read time.
  return new Date(`${value}T00:00:00Z`).toISOString();
}

export function VersionHistory({ templateId, formName, trigger }: VersionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<{ sections: FormSection[]; label: string } | null>(null);
  const [scheduleVersion, setScheduleVersion] = useState<any | null>(null);
  const [scheduleFrom, setScheduleFrom] = useState('');
  const [scheduleUntil, setScheduleUntil] = useState('');
  const { data: versions = [] } = useFormVersions(templateId);
  const updateSchedule = useUpdateVersionSchedule();

  const openSchedule = (v: any) => {
    setScheduleVersion(v);
    setScheduleFrom(toDateInput(v.effective_from));
    setScheduleUntil(toDateInput(v.effective_until));
  };

  const saveSchedule = async () => {
    if (!scheduleVersion) return;
    try {
      await updateSchedule.mutateAsync({
        versionId: scheduleVersion.id,
        effective_from: fromDateInput(scheduleFrom),
        effective_until: fromDateInput(scheduleUntil),
      });
      // Trigger upcoming-version notification (idempotent).
      await notifyUpcomingVersionIfNeeded(scheduleVersion.id);
      toast.success('Schedule updated.');
      setScheduleVersion(null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update schedule.');
    }
  };

  const toggleActivation = async (v: any) => {
    const next = v.status === 'archived' ? 'published' : 'archived';
    const res = await Swal.fire({
      title: next === 'published' ? 'Activate this version?' : 'Deactivate this version?',
      html: `<p>v${v.semantic_version || v.version} will be <strong>${next === 'published' ? 'available' : 'hidden'}</strong> for licensees.</p>` +
        (next === 'archived' ? `<p style="color:hsl(var(--muted-foreground));font-size:0.85rem">Existing submissions on this version remain accessible.</p>` : ''),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: next === 'published' ? 'Activate' : 'Deactivate',
      cancelButtonText: 'Cancel',
      heightAuto: false,
      target: document.body,
      customClass: { container: 'swal2-on-top' },
      didOpen: () => {
        // Radix Dialog sets pointer-events:none on body; restore for Swal layer.
        const c = document.querySelector('.swal2-container') as HTMLElement | null;
        if (c) {
          c.style.zIndex = '99999';
          c.style.pointerEvents = 'auto';
        }
        document.body.style.pointerEvents = 'auto';
      },
    });
    if (!res.isConfirmed) return;
    try {
      await updateSchedule.mutateAsync({ versionId: v.id, status: next as any });
      toast.success(next === 'published' ? 'Version activated.' : 'Version deactivated.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update version.');
    }
  };

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="inline-flex cursor-pointer">{trigger}</span>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <History className="h-4 w-4 mr-1" />
          History
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Version History
            </DialogTitle>
            <DialogDescription>{formName} — {versions.length} version(s)</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            <VersionDiffViewer templateId={templateId} formName={formName} />
          </div>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-3">
              {versions.map((v: any, idx: number) => {
                const effective = v.status === 'published' && isVersionEffective(v);
                const scheduled = v.status === 'published' && v.effective_from && v.effective_from > new Date().toISOString();
                return (
                  <Card key={v.id} className={idx === 0 ? 'border-primary/50' : ''}>
                    <CardContent className="py-3 px-4 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={idx === 0 ? 'default' : 'secondary'} className="gap-1">
                            <GitBranch className="h-3 w-3" />
                            v{v.semantic_version || `${v.version}.0`}
                          </Badge>
                          <Badge variant="outline" className="capitalize text-xs">
                            {v.status}
                          </Badge>
                          {effective && (
                            <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px]">Active</Badge>
                          )}
                          {scheduled && (
                            <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700">
                              Scheduled
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(v.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => window.open(`/preview/${v.id}`, '_blank')} title="Preview in new tab">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const sections = (v.schema_snapshot || []) as unknown as FormSection[];
                              setPreviewVersion({ sections, label: `v${v.semantic_version || v.version}` });
                            }}
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {v.status !== 'draft' && (
                            <Button variant="ghost" size="sm" onClick={() => openSchedule(v)} title="Schedule effective dates">
                              <CalendarClock className="h-4 w-4" />
                            </Button>
                          )}
                          {v.status !== 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleActivation(v)}
                              title={v.status === 'archived' ? 'Activate' : 'Deactivate'}
                            >
                              {v.status === 'archived'
                                ? <Power className="h-4 w-4 text-green-600" />
                                : <PowerOff className="h-4 w-4 text-amber-600" />}
                            </Button>
                          )}
                        </div>
                      </div>
                      {(v.effective_from || v.effective_until) && (
                        <p className="text-xs text-muted-foreground">
                          Effective {v.effective_from ? new Date(v.effective_from).toLocaleDateString() : '—'} → {v.effective_until ? new Date(v.effective_until).toLocaleDateString() : 'no end'}
                        </p>
                      )}
                      {v.change_notes && (
                        <p className="text-xs text-muted-foreground">{v.change_notes}</p>
                      )}
                      {idx === 0 && (
                        <span className="text-[10px] text-primary font-medium">Most recent</span>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
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

      {/* Schedule dialog */}
      <Dialog open={!!scheduleVersion} onOpenChange={(o) => !o && setScheduleVersion(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule effective dates</DialogTitle>
            <DialogDescription>
              Set when v{scheduleVersion?.semantic_version || scheduleVersion?.version} becomes available and (optionally) when it stops being available.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="eff-from">Effective from</Label>
              <Input id="eff-from" type="date" value={scheduleFrom} onChange={(e) => setScheduleFrom(e.target.value)} />
              <p className="text-xs text-muted-foreground">Leave empty to start immediately.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="eff-until">Effective until</Label>
              <Input id="eff-until" type="date" value={scheduleUntil} onChange={(e) => setScheduleUntil(e.target.value)} />
              <p className="text-xs text-muted-foreground">Leave empty for no end date.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setScheduleVersion(null)}>Cancel</Button>
              <Button onClick={saveSchedule} disabled={updateSchedule.isPending}>
                {updateSchedule.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
