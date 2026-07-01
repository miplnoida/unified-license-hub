import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { useLatestPublishedVersion, useVersionSections } from '@/hooks/useFormTemplates';

export interface LicenseActionConfig {
  actionType: 'suspension' | 'revocation' | 'cancellation' | 'reinstatement' | 'status_change';
  newStatus: string;
  title: string;
  submitLabel: string;
  destructive?: boolean;
  requireReason?: boolean;
}

interface License {
  id: string;
  license_number: string;
  license_type: string;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  regulator_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  license: License;
  config: LicenseActionConfig | null;
  onCompleted: () => void;
}

const MIN_REASON_LEN = 10;

export default function LicenseActionDialog({ open, onOpenChange, license, config, onCompleted }: Props) {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [resolving, setResolving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState<{
    templateId: string | null;
    required: boolean;
    templateName?: string | null;
  } | null>(null);

  const templateId = resolved?.templateId || null;
  const { data: version } = useLatestPublishedVersion(templateId);
  const { data: sections = [] } = useVersionSections(version?.id || null);

  useEffect(() => {
    if (!open || !config) { setResolved(null); setReason(''); return; }
    let alive = true;
    setResolving(true);
    (async () => {
      const { data, error } = await supabase.rpc('resolve_license_action_form', {
        _action_type: config.actionType,
        _regulator_id: license.regulator_id ?? null,
        _sector_id: license.sector_id,
        _sub_sector_id: license.sub_sector_id,
        _category_id: license.category_id,
      });
      if (!alive) return;
      if (error) {
        toast.error(`Could not resolve action form: ${error.message}`);
        setResolved({ templateId: null, required: false });
      } else {
        const row = (data ?? [])[0] || null;
        setResolved({
          templateId: row?.form_template_id || null,
          required: !!row?.is_required,
        });
      }
      setResolving(false);
    })();
    return () => { alive = false; };
  }, [open, config, license.id, license.regulator_id, license.sector_id, license.sub_sector_id, license.category_id]);

  if (!config) return null;

  const hasForm = !!templateId;
  const needsReason = config.requireReason !== false;

  const callBackend = async (formResponseId: string | null) => {
    if (!user) { toast.error('Not signed in'); return false; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
        code?: string;
        action_id?: string;
        new_status?: string;
      }>('perform-license-action', {
        body: {
          license_id: license.id,
          action_type: config.actionType,
          new_status: config.newStatus,
          reason,
          form_response_id: formResponseId,
        },
      });
      if (error) { toast.error(error.message); return false; }
      if (data?.error) {
        if (data.code === 'FORM_REQUIRED') {
          toast.error('An internal form must be submitted before this action.');
        } else {
          toast.error(data.error);
        }
        return false;
      }
      toast.success(`License ${config.actionType} successful`);
      onCompleted();
      onOpenChange(false);
      return true;
    } finally {
      setSubmitting(false);
    }
  };

  // Form-based path: FormRenderer.onSubmit gives us validated response data.
  const handleFormSubmit = async (responseData: Record<string, any>) => {
    if (!user || !templateId || !version) return;
    if (needsReason && reason.trim().length < MIN_REASON_LEN) {
      toast.error(`Justification of at least ${MIN_REASON_LEN} characters required.`);
      return;
    }
    setSubmitting(true);
    try {
      const { data: inserted, error: insErr } = await supabase
        .from('form_responses')
        .insert({
          template_id: templateId,
          version_id: version.id,
          user_id: user.id,
          response_data: responseData,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          entity_type: 'license_action',
          entity_id: license.id,
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        toast.error(insErr?.message || 'Could not save form response');
        return;
      }
      const ok = await callBackend(inserted.id);
      if (!ok) {
        // best-effort cleanup so a stale response isn't left dangling
        await supabase.from('form_responses').delete().eq('id', inserted.id);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Reason-only path
  const handleReasonOnlySubmit = async () => {
    if (needsReason && reason.trim().length < MIN_REASON_LEN) {
      toast.error(`Justification of at least ${MIN_REASON_LEN} characters required.`);
      return;
    }
    await callBackend(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>
            License {license.license_number} — {license.license_type}
          </DialogDescription>
        </DialogHeader>

        {resolving ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {needsReason && (
              <div>
                <Label>Justification / Notes <span className="text-destructive">*</span></Label>
                <Textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={`Required (min ${MIN_REASON_LEN} characters)...`}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">{reason.trim().length}/{MIN_REASON_LEN}+</p>
              </div>
            )}

            {hasForm ? (
              version && sections.length > 0 ? (
                <div className="border rounded-md p-3 max-h-[55vh] overflow-y-auto">
                  <FormRenderer
                    formName="Internal Action Form"
                    sections={sections}
                    onSaveDraft={() => { /* drafts not used for action forms */ }}
                    onSubmit={handleFormSubmit}
                    saving={submitting}
                    formId={templateId || undefined}
                    formVersionId={version.id}
                    entityType="license_action"
                    entityId={license.id}
                  />
                </div>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Configured internal form has no published version. Ask an admin to publish the form before performing this action.
                  </AlertDescription>
                </Alert>
              )
            ) : resolved?.required ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  An internal form is required for this action but none is configured. Configure one under Admin → License Action Forms.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
                <Button
                  variant={config.destructive ? 'destructive' : 'default'}
                  onClick={handleReasonOnlySubmit}
                  disabled={submitting || (needsReason && reason.trim().length < MIN_REASON_LEN)}
                >
                  {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {config.submitLabel}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
