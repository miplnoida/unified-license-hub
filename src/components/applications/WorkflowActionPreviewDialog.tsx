/**
 * Email Preview & Edit dialog shown before a workflow action is executed.
 *
 * Loads all `approval_action_notifications` bindings for (step, action_type),
 * resolves each binding's notification_templates row, renders a realistic
 * subject/body preview with available variables, and lets the reviewer edit
 * subject/body per binding before confirming.
 *
 * On confirm: invokes onConfirm(overrides) where overrides is an array of
 * { binding_id, subject, body } for the bindings the reviewer changed (or
 * accepted). These flow through perform-workflow-action and ultimately to
 * dispatch-notification-event as subject_override / body_override.
 *
 * If there are no configured notifications, the dialog simply confirms the
 * action with a "no email is configured" notice — it does NOT block actions.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, Loader2, Mail, RotateCcw, Send, PenLine, Eraser } from 'lucide-react';
import { getDefaultEventForAction, RECIPIENT_LABELS, type ActionNotificationRecipientType, type WorkflowEntityKind } from '@/hooks/useActionNotifications';
import type { WorkflowActionType } from '@/hooks/useWorkflowEngine';

export interface ActionNotificationOverride {
  binding_id: string;
  subject: string;
  body: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stepId: string;
  actionType: WorkflowActionType;
  actionLabel: string;
  comments: string;
  entityType: WorkflowEntityKind;
  entityId: string;
  /** Display name of the actor (for {{actor_name}} substitution). */
  actorName?: string | null;
  processing: boolean;
  /** When true, capture a digital signature before allowing confirm. */
  requireSignature?: boolean;
  onConfirm: (overrides: ActionNotificationOverride[], signatureDataUrl?: string | null) => void | Promise<void>;
}


interface BindingRow {
  id: string;
  step_id: string;
  action_type: string;
  event_key: string;
  recipient_type: ActionNotificationRecipientType;
  recipient_config: Record<string, any> | null;
  template_id: string | null;
  is_enabled: boolean;
  template?: { id: string; name: string; subject: string | null; body: string; channel: string; is_active: boolean } | null;
  template_found?: boolean;
  template_active?: boolean;
  template_id_was_null?: boolean;
}

interface BindingDiagnostic {
  currentStepId: string;
  actionType: WorkflowActionType;
  entityType: WorkflowEntityKind;
  expectedEventKey: string;
  foundApprovalActionNotificationsCount: number;
  templateIdIsNull: boolean;
  templateExistsAndActive: boolean;
}

/** Minimal `{{token}}` substitution mirroring the dispatch render function. */
function render(template: string | null | undefined, vars: Record<string, any>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const path = key.split('.');
    let cur: any = vars;
    for (const p of path) {
      if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
      else return `{{${key}}}`;
    }
    return cur == null ? '' : String(cur);
  });
}

function useBindings(stepId: string, actionType: WorkflowActionType, entityType: WorkflowEntityKind) {
  return useQuery({
    queryKey: ['preview_action_bindings', stepId, actionType, entityType],
    enabled: !!stepId,
    queryFn: async (): Promise<{ bindings: BindingRow[]; diagnostic: BindingDiagnostic }> => {
      const expectedEventKey = getDefaultEventForAction(actionType, entityType);
      const { data, error } = await supabase
        .from('approval_action_notifications' as any)
        .select('id, step_id, action_type, event_key, recipient_type, recipient_config, template_id, is_enabled')
        .eq('step_id', stepId)
        .eq('action_type', actionType)
        .eq('is_enabled', true);
      if (error) throw error;
      // Bindings are uniquely scoped by (step_id, action_type, is_enabled).
      // We intentionally do NOT additionally filter by event_key prefix here:
      // a step may belong to a workflow whose entity_type differs from the
      // host entity (e.g. a New Licensee application attached to a workflow
      // configured as entity_type='registration'), in which case the stored
      // event_key is `registration.*` even though the dialog is opened from
      // the application detail page. Trusting the admin-configured binding
      // by step+action is the correct source of truth.
      const rows = (data ?? []) as unknown as BindingRow[];
      const templateIds = Array.from(new Set(rows.map(r => r.template_id).filter((x): x is string => !!x)));
      const eventKeys = Array.from(new Set(rows.map(r => r.event_key).filter(Boolean)));
      const tplMap = new Map<string, any>();
      const eventTplMap = new Map<string, any>();
      const [byId, byEvent] = await Promise.all([
        templateIds.length
          ? supabase
              .from('notification_templates')
              .select('id, name, subject, body, channel, is_active, event_type')
              .in('id', templateIds)
          : Promise.resolve({ data: [] as any[] }),
        eventKeys.length
          ? supabase
              .from('notification_templates')
              .select('id, name, subject, body, channel, is_active, event_type')
              .in('event_type', eventKeys)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const tpls = [...(byId.data || []), ...(byEvent.data || [])];
      tpls.forEach((t: any) => {
        tplMap.set(t.id, t);
        if (t.channel === 'email' && t.is_active && !eventTplMap.has(t.event_type)) eventTplMap.set(t.event_type, t);
      });
      const resolved = rows.map(r => {
        const direct = r.template_id ? (tplMap.get(r.template_id) ?? null) : null;
        const fallback = eventTplMap.get(r.event_key) ?? null;
        const template = direct && direct.channel === 'email' && direct.is_active ? direct : fallback;
        return {
          ...r,
          template,
          template_found: !!template,
          template_active: !!template?.is_active,
          template_id_was_null: !r.template_id,
        };
      }).filter(r => r.template?.channel === 'email' && r.template?.is_active);
      return {
        bindings: resolved,
        diagnostic: {
          currentStepId: stepId,
          actionType,
          entityType,
          expectedEventKey,
          foundApprovalActionNotificationsCount: rows.length,
          templateIdIsNull: rows.some(r => !r.template_id),
          templateExistsAndActive: resolved.length > 0,
        },
      };
    },
    staleTime: 30_000,
  });
}

function useEntityPreviewData(entityType: WorkflowEntityKind, entityId: string) {
  return useQuery({
    queryKey: ['preview_entity_vars', entityType, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<Record<string, any>> => {
      if (entityType === 'registration') {
        const { data } = await supabase
          .from('registrations')
          .select('id, email, status, registration_number, registration_reference, applicant_name')
          .eq('id', entityId)
          .maybeSingle();
        return {
          registration_id: entityId,
          registration_number: (data as any)?.registration_number || (data as any)?.registration_reference || '',
          applicant_email: (data as any)?.email || '',
          applicant_name: (data as any)?.applicant_name || '',
          status: (data as any)?.status || '',
        };
      }
      if (entityType === 'return') {
        const { data } = await supabase
          .from('returns_filed')
          .select('id, unique_id, status, workflow_status, return_year, return_period')
          .eq('id', entityId)
          .maybeSingle();
        return {
          return_id: entityId,
          return_name: (data as any)?.unique_id || entityId,
          entity_name: 'Licensee',
          period: (data as any)?.return_period || '',
          year: (data as any)?.return_year || '',
          status: (data as any)?.workflow_status || (data as any)?.status || '',
        };
      }
      const { data } = await supabase
        .from('applications')
        .select('id, status, application_number, applicant_id')
        .eq('id', entityId)
        .maybeSingle();
      return {
        application_id: entityId,
        application_number: (data as any)?.application_number || '',
        status: (data as any)?.status || '',
      };
    },
    staleTime: 30_000,
  });
}

function useStepPreviewData(stepId: string) {
  return useQuery({
    queryKey: ['preview_step_vars', stepId],
    enabled: !!stepId,
    queryFn: async (): Promise<Record<string, any>> => {
      const { data: step } = await supabase
        .from('approval_steps')
        .select('id, name, step_order, workflow_id')
        .eq('id', stepId)
        .maybeSingle();
      let workflow_name = '';
      if ((step as any)?.workflow_id) {
        const { data: wf } = await supabase
          .from('approval_workflows')
          .select('name')
          .eq('id', (step as any).workflow_id)
          .maybeSingle();
        workflow_name = (wf as any)?.name || '';
      }
      return {
        step_name: (step as any)?.name || '',
        step_order: (step as any)?.step_order ?? '',
        step_level: (step as any)?.step_order ?? '',
        workflow_name,
      };
    },
    staleTime: 30_000,
  });
}

export function WorkflowActionPreviewDialog({
  open, onOpenChange, stepId, actionType, actionLabel, comments,
  entityType, entityId, actorName, processing, requireSignature, onConfirm,
}: Props) {
  const expectedEventKey = getDefaultEventForAction(actionType, entityType);

  const { data: bindingResult, isLoading } = useBindings(stepId, actionType, entityType);
  const bindings = bindingResult?.bindings ?? [];
  const diagnostic = bindingResult?.diagnostic ?? {
    currentStepId: stepId,
    actionType,
    entityType,
    expectedEventKey,
    foundApprovalActionNotificationsCount: 0,
    templateIdIsNull: false,
    templateExistsAndActive: false,
  };
  const { data: entityVars = {} } = useEntityPreviewData(entityType, entityId);
  const { data: stepVars = {} } = useStepPreviewData(stepId);

  const vars = useMemo(() => ({
    ...entityVars,
    ...stepVars,
    action_type: actionType,
    action_label: actionLabel,
    comments: comments || '',
    remarks: comments || '',
    actor_name: actorName || 'Reviewer',
    reviewer_name: actorName || 'Reviewer',
    app_name: 'Unified License Hub',
  }), [entityVars, stepVars, actionType, actionLabel, comments, actorName]);

  // Per-binding editable subject/body. Reset whenever the dialog opens or
  // bindings change so reviewers always see the freshly rendered template.
  const [edited, setEdited] = useState<Record<string, { subject: string; body: string }>>({});
  useEffect(() => {
    if (!open) return;
    const next: Record<string, { subject: string; body: string }> = {};
    for (const b of bindings) {
      next[b.id] = {
        subject: render(b.template?.subject || `[${actionLabel}] {{application_number}}{{registration_number}}`, vars),
        body: render(b.template?.body || `Hello,\n\nThe reviewer has performed action: ${actionLabel}.\n\nRemarks:\n{{comments}}\n\nThank you.`, vars),
      };
    }
    setEdited(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bindings.map(b => b.id).join(','), actionLabel]);

  const resetBinding = (b: BindingRow) => {
    setEdited(prev => ({
      ...prev,
      [b.id]: {
        subject: render(b.template?.subject || `[${actionLabel}] {{application_number}}{{registration_number}}`, vars),
        body: render(b.template?.body || `Hello,\n\nThe reviewer has performed action: ${actionLabel}.\n\nRemarks:\n{{comments}}\n\nThank you.`, vars),
      },
    }));
  };

  const recipientSummary = (b: BindingRow): string => {
    const label = RECIPIENT_LABELS[b.recipient_type] || b.recipient_type;
    if (b.recipient_type === 'custom_email') {
      const email = b.recipient_config?.email || '(no email set)';
      return `${label}: ${email}`;
    }
    if (b.recipient_type === 'role') {
      const role = b.recipient_config?.role || b.recipient_config?.role_name || '(no role set)';
      return `${label}: ${role}`;
    }
    return label;
  };

  // ─── Digital signature capture (only when requireSignature) ───
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [sigHasInk, setSigHasInk] = useState(false);

  useEffect(() => {
    if (!open) {
      setSignatureDataUrl(null);
      setSigHasInk(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !requireSignature) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Reset canvas
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0f172a';

    let drawing = false;
    let lastX = 0, lastY = 0;
    const posFromEvent = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      drawing = true;
      const { x, y } = posFromEvent(e);
      lastX = x; lastY = y;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!drawing) return;
      const { x, y } = posFromEvent(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastX = x; lastY = y;
      setSigHasInk(true);
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      if (!drawing) return;
      drawing = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      // Snapshot after stroke ends
      try { setSignatureDataUrl(canvas.toDataURL('image/png')); } catch { /* ignore */ }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onUp);
    };
  }, [open, requireSignature]);

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    setSigHasInk(false);
    setSignatureDataUrl(null);
  };

  const signatureMissing = !!requireSignature && (!sigHasInk || !signatureDataUrl);

  const handleConfirm = async () => {
    if (signatureMissing) return;
    const overrides: ActionNotificationOverride[] = bindings.map(b => ({
      binding_id: b.id,
      subject: edited[b.id]?.subject ?? '',
      body: edited[b.id]?.body ?? '',
    }));
    await onConfirm(overrides, requireSignature ? signatureDataUrl : null);
  };


  return (
    <Dialog open={open} onOpenChange={(v) => { if (!processing) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Preview &amp; Send — {actionLabel}
          </DialogTitle>
          <DialogDescription>
            Review the notification email(s) below. You can edit the subject and body before sending.
            Action will not be executed until you click <strong>Confirm &amp; Send</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/40 border p-3 text-xs space-y-1">
            <div><span className="text-muted-foreground">Action:</span> <strong>{actionLabel}</strong></div>
            {comments && (
              <div className="whitespace-pre-wrap"><span className="text-muted-foreground">Remarks:</span> {comments}</div>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading notification templates…
            </div>
          ) : bindings.length === 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="font-medium">No email notification is configured for this action.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No enabled action-notification binding with an active email template was found for this exact step/action.
                </p>
                <div className="grid grid-cols-1 gap-1 rounded border bg-background/60 p-2 font-mono text-[11px]">
                  <div>currentStep.id: {diagnostic.currentStepId}</div>
                  <div>action_type: {diagnostic.actionType}</div>
                  <div>entityType: {diagnostic.entityType}</div>
                  <div>expected event_key: {diagnostic.expectedEventKey}</div>
                  <div>approval_action_notifications count: {diagnostic.foundApprovalActionNotificationsCount}</div>
                  <div>template_id is null: {String(diagnostic.templateIdIsNull)}</div>
                  <div>template exists and active: {String(diagnostic.templateExistsAndActive)}</div>
                </div>
              </div>
            </div>
          ) : (
            bindings.map((b, idx) => {
              const e = edited[b.id] || { subject: '', body: '' };
              const noTemplate = !b.template;
              const recipientWarning =
                (b.recipient_type === 'custom_email' && !b.recipient_config?.email) ||
                (b.recipient_type === 'role' && !(b.recipient_config?.role || b.recipient_config?.role_name));
              return (
                <div key={b.id} className="rounded-md border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <Badge variant="outline">Email {idx + 1} of {bindings.length}</Badge>
                      <span className="text-muted-foreground">{recipientSummary(b)}</span>
                      {b.template && <span className="text-muted-foreground">· Template: <strong>{b.template.name}</strong></span>}
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => resetBinding(b)} disabled={processing}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset to template
                    </Button>
                  </div>
                  {noTemplate && (
                    <p className="text-xs text-warning">No template bound — a basic default is used.</p>
                  )}
                  {recipientWarning && (
                    <p className="text-xs text-destructive">Recipient is not fully configured; this email may not be delivered.</p>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">Subject</Label>
                    <Input
                      value={e.subject}
                      onChange={(ev) => setEdited(prev => ({ ...prev, [b.id]: { ...prev[b.id], subject: ev.target.value } }))}
                      disabled={processing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Body</Label>
                    <Textarea
                      value={e.body}
                      onChange={(ev) => setEdited(prev => ({ ...prev, [b.id]: { ...prev[b.id], body: ev.target.value } }))}
                      rows={8}
                      disabled={processing}
                    />
                  </div>
                </div>
              );
            })
          )}

          {requireSignature && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <PenLine className="h-4 w-4 text-primary" />
                  Digital signature required
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={clearSignature} disabled={processing}>
                  <Eraser className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sign inside the box below to confirm this action. Your signature will be stored with the audit record.
              </p>
              <canvas
                ref={sigCanvasRef}
                className="w-full h-40 rounded border border-border bg-white touch-none cursor-crosshair"
                style={{ touchAction: 'none' }}
              />
              {signatureMissing && (
                <p className="text-xs text-destructive">Please sign above before confirming.</p>
              )}
            </div>
          )}
        </div>

        <Separator />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={processing || signatureMissing}>
            {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Confirm &amp; Send
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
