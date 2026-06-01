import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { History, Eye, GitBranch, Calendar, Send, Power, PowerOff, CalendarClock, Loader2, Star, AlertTriangle, Pencil } from 'lucide-react';
import {
  useFormVersions,
  useUpdateVersionSchedule,
  useActivateVersionAsCurrent,
  useFormVersionUsageCounts,
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
  formType?: string;
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

// Format an ISO timestamp as a calendar date using its UTC components so the
// displayed value matches the date the admin selected (independent of the
// viewer's local timezone). effective_until is stored at end-of-day UTC, so
// using UTC parts also avoids it rolling into the next day for +TZ viewers.
function formatEffectiveDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function VersionHistory({ templateId, formName, formType, trigger }: VersionHistoryProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<{ sections: FormSection[]; label: string } | null>(null);
  const [scheduleVersion, setScheduleVersion] = useState<any | null>(null);
  const [scheduleFrom, setScheduleFrom] = useState('');
  const [scheduleUntil, setScheduleUntil] = useState('');
  const { data: versions = [] } = useFormVersions(templateId);
  const { data: usageCounts = {} } = useFormVersionUsageCounts(templateId);
  const updateSchedule = useUpdateVersionSchedule();
  const activateAsCurrent = useActivateVersionAsCurrent();

  // The "current default" is the most recent published version that is currently
  // effective and has no end date (open-ended). Fallback: most recent effective.
  const currentDefaultId = (() => {
    const published = (versions as any[]).filter(v => v.status === 'published' && isVersionEffective(v));
    const openEnded = published.filter(v => !v.effective_until);
    const sortByVerDesc = (a: any, b: any) => (b.version || 0) - (a.version || 0);
    return (openEnded.length > 0 ? openEnded.sort(sortByVerDesc)[0]?.id : published.sort(sortByVerDesc)[0]?.id) || null;
  })();
  const hasCurrentDefault = !!currentDefaultId;

  const openSchedule = (v: any) => {
    setScheduleVersion(v);
    setScheduleFrom(toDateInput(v.effective_from));
    setScheduleUntil(toDateInput(v.effective_until));
  };

  const onActivateAsCurrent = async (v: any) => {
    const res = await Swal.fire({
      title: 'Set as current default?',
      html:
        `<p>v${v.semantic_version || v.version} will become the version used for <strong>new applications</strong>.</p>` +
        `<p style="color:hsl(var(--muted-foreground));font-size:0.85rem">Previously-current versions will be retired on the last day of the current month so already-started applications can still finish on them.</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Activate',
      cancelButtonText: 'Cancel',
      heightAuto: false,
      target: document.body,
      customClass: { container: 'swal2-on-top' },
      didOpen: () => {
        const c = document.querySelector('.swal2-container') as HTMLElement | null;
        if (c) { c.style.zIndex = '99999'; c.style.pointerEvents = 'auto'; }
        document.body.style.pointerEvents = 'auto';
      },
    });
    if (!res.isConfirmed) return;
    try {
      await activateAsCurrent.mutateAsync({ versionId: v.id });
      toast.success('Version set as current default.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to activate version.');
    }
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
          <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
            <p className="text-xs text-muted-foreground max-w-md">
              New applications use the <strong>current default</strong> version. Applications already started continue with their assigned version.
            </p>
            <VersionDiffViewer templateId={templateId} formName={formName} />
          </div>
          {!hasCurrentDefault && versions.some((v: any) => v.status === 'published') && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-[1px] shrink-0" />
              <span>No current default version is set. New applications may fall back to the latest published version. Activate one below.</span>
            </div>
          )}
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-3">
              {versions.map((v: any, idx: number) => {
                const effective = v.status === 'published' && isVersionEffective(v);
                const scheduled = v.status === 'published' && v.effective_from && v.effective_from > new Date().toISOString();
                const isCurrentDefault = v.id === currentDefaultId;
                const isRetiring = v.status === 'published' && effective && !isCurrentDefault && !!v.effective_until;
                const isRetired = v.status === 'published' && !effective;
                const usage = usageCounts[v.id];
                return (
                  <Card key={v.id} className={isCurrentDefault ? 'border-primary/60 ring-1 ring-primary/30' : idx === 0 ? 'border-primary/30' : ''}>
                    <CardContent className="py-3 px-4 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={isCurrentDefault ? 'default' : 'secondary'} className="gap-1">
                            <GitBranch className="h-3 w-3" />
                            v{v.semantic_version || `${v.version}.0`}
                          </Badge>
                          <Badge variant="outline" className="capitalize text-xs">
                            {v.status}
                          </Badge>
                          {isCurrentDefault && (
                            <Badge className="bg-primary hover:bg-primary text-primary-foreground text-[10px] gap-1">
                              <Star className="h-3 w-3" /> Current default
                            </Badge>
                          )}
                          {isRetiring && (
                            <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700">Retiring</Badge>
                          )}
                          {isRetired && (
                            <Badge variant="outline" className="text-[10px] border-muted-foreground/40 text-muted-foreground">Retired</Badge>
                          )}
                          {!isCurrentDefault && effective && !isRetiring && (
                            <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px]">Active</Badge>
                          )}
                          {scheduled && (
                            <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700">Scheduled</Badge>
                          )}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(v.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const type = formType || 'pre_license';
                              setOpen(false);
                              navigate(`/admin/forms/create?type=${type}&id=${templateId}&versionId=${v.id}`);
                            }}
                            title="Edit this version (creates a new draft if published/archived)"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {v.status === 'published' && !isCurrentDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onActivateAsCurrent(v)}
                              title="Set as current default"
                              disabled={activateAsCurrent.isPending}
                            >
                              <Star className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          {v.status === 'published' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const count = await notifyVersionToLicensees(v.id);
                                  toast.success(count > 0 ? `Notification sent to ${count} user(s).` : 'No licensee/PPOC users to notify.');
                                } catch (e: any) {
                                  toast.error(e?.message || 'Failed to send notification.');
                                }
                              }}
                              title="Send notification to licensees/PPOC"
                            >
                              <Send className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
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
                      <p className="text-xs text-muted-foreground">
                        Effective {v.effective_from ? formatEffectiveDate(v.effective_from) : '—'} → {v.effective_until ? formatEffectiveDate(v.effective_until) : 'Open'}
                        {v.published_at && (
                          <span className="ml-2">· Published {new Date(v.published_at).toLocaleDateString()}</span>
                        )}
                      </p>
                      {v.status === 'published' && (
                        <p className="text-[11px] text-muted-foreground">
                          In-progress applications: <strong>{usage?.in_progress ?? 0}</strong> · Submitted responses: <strong>{usage?.submitted ?? 0}</strong>
                        </p>
                      )}
                      {v.change_notes && (
                        <p className="text-xs text-muted-foreground">{v.change_notes}</p>
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
              <Input
                id="eff-until"
                type="date"
                value={scheduleUntil}
                min={scheduleFrom || undefined}
                onChange={(e) => setScheduleUntil(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave empty for no end date. Existing in-progress applications keep their pinned version regardless.</p>
            </div>
            {scheduleFrom && scheduleUntil && scheduleUntil < scheduleFrom && (
              <p className="text-xs text-destructive">Effective until cannot be before effective from.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setScheduleVersion(null)}>Cancel</Button>
              <Button
                onClick={saveSchedule}
                disabled={updateSchedule.isPending || (!!scheduleFrom && !!scheduleUntil && scheduleUntil < scheduleFrom)}
              >
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
