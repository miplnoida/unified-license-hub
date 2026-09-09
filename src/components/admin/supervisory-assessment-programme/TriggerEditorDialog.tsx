/**
 * Trigger editor — the permitted reasons for starting one programme.
 *
 * Trigger codes come from the server's canonical vocabulary. The server owns
 * every safeguard: programme ownership, code validity, duplicate refusal, a
 * single active default, dependency consistency and immutability once the
 * package leaves draft. Refusals are shown here verbatim.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  useUpsertProgrammeTrigger,
  type ProgrammeTrigger, type ProgrammeRegisterOptions,
} from '@/hooks/useSupervisoryAssessmentProgrammes';
import { humanize } from '@/components/admin/supervisory-policy-profile/labels';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programmeId: string;
  programmeLabel: string;
  trigger?: ProgrammeTrigger | null;
  options?: ProgrammeRegisterOptions;
}

const blank = {
  trigger_code: '', label: '', description: '', is_default: false, is_active: true,
  sort_order: '100', requires_signal: false, requires_prior_assessment: false,
  guidance: '', rationale: '',
};

export function TriggerEditorDialog({
  open, onOpenChange, programmeId, programmeLabel, trigger, options,
}: Props) {
  const upsert = useUpsertProgrammeTrigger();
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const vocabulary = options?.trigger_types ?? [];

  useEffect(() => {
    if (!open) return;
    setError(null);
    setF(trigger ? {
      trigger_code: trigger.trigger_code, label: trigger.label ?? '',
      description: trigger.description ?? '', is_default: trigger.is_default,
      is_active: trigger.is_active, sort_order: String(trigger.sort_order ?? 100),
      requires_signal: trigger.requires_signal, requires_prior_assessment: trigger.requires_prior_assessment,
      guidance: trigger.guidance ?? '', rationale: '',
    } : { ...blank, trigger_code: vocabulary[0]?.code ?? '' });
  }, [open, trigger, vocabulary.length]);

  const submit = async () => {
    setError(null);
    try {
      await upsert.mutateAsync({
        programmeId,
        payload: {
          id: trigger?.id ?? null,
          trigger_code: f.trigger_code, label: f.label.trim() || null,
          description: f.description.trim() || null,
          is_default: f.is_default, is_active: f.is_active,
          sort_order: Number(f.sort_order) || 100,
          requires_signal: f.requires_signal,
          requires_prior_assessment: f.requires_prior_assessment,
          guidance: f.guidance.trim() || null,
          rationale: f.rationale.trim() || null,
        },
      });
      toast.success(trigger ? 'Trigger updated.' : 'Trigger added.');
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'The trigger could not be saved.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{trigger ? 'Edit trigger' : 'Add trigger'}</DialogTitle>
          <DialogDescription>For {programmeLabel}.</DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tg-code">Trigger</Label>
            <Select value={f.trigger_code} onValueChange={(v) => setF({ ...f, trigger_code: v })}>
              <SelectTrigger id="tg-code"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {vocabulary.map((t) => (
                  <SelectItem key={t.code} value={t.code}>{t.label || humanize(t.code)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-label">Label shown to officers</Label>
            <Input id="tg-label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tg-description">Description</Label>
            <Textarea id="tg-description" rows={2} value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-sort">Display order</Label>
            <Input id="tg-sort" type="number" value={f.sort_order}
              onChange={(e) => setF({ ...f, sort_order: e.target.value })} />
          </div>
          <div className="flex flex-col justify-center gap-2 pt-2">
            <div className="flex items-center gap-2">
              <Switch id="tg-active" checked={f.is_active}
                onCheckedChange={(v) => setF({ ...f, is_active: v })} />
              <Label htmlFor="tg-active">Available</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="tg-default" checked={f.is_default}
                onCheckedChange={(v) => setF({ ...f, is_default: v, is_active: v ? true : f.is_active })} />
              <Label htmlFor="tg-default">Preselected by default</Label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="tg-signal" checked={f.requires_signal}
              onCheckedChange={(v) => setF({ ...f, requires_signal: v })} />
            <Label htmlFor="tg-signal">Requires the triggering signal</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="tg-prior" checked={f.requires_prior_assessment}
              onCheckedChange={(v) => setF({ ...f, requires_prior_assessment: v })} />
            <Label htmlFor="tg-prior">Requires a previous assessment</Label>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tg-guidance">Guidance</Label>
            <Textarea id="tg-guidance" rows={2} value={f.guidance}
              onChange={(e) => setF({ ...f, guidance: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tg-rationale">Reason</Label>
            <Textarea id="tg-rationale" rows={2} value={f.rationale}
              onChange={(e) => setF({ ...f, rationale: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={f.trigger_code === '' || upsert.isPending} onClick={submit}>
            {trigger ? 'Save trigger' : 'Add trigger'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
