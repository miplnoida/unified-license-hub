/**
 * Authorization schemes and their classes for the current jurisdiction.
 * Classes carry the activity permissions; schemes carry method + legal basis.
 */
import { useMemo, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Ban, CheckCircle2, Archive, History } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useClassificationTree, useClassificationMutations, useRegulatedActivities, useSubjectForms,
  AUTHORIZATION_METHODS, MARKET_SCOPES,
} from '@/hooks/useRegulatoryClassification';
import { StatusChangeDialog, ClassificationStatusBadgeTone, type StatusChangeRequest } from './StatusChangeDialog';

interface SchemeForm {
  id: string | null; business_type_id: string; code: string; name: string; local_legal_name: string;
  authorization_method: string; market_scope: string; legal_basis: string; version: string;
  effective_from: string; effective_to: string;
}
interface ClassForm {
  id: string | null; scheme_id: string; local_class_code: string; name: string; description: string;
  subject_form_code: string; customer_restriction: string; market_scope: string;
  effective_from: string; effective_to: string; activity_codes: string[];
}

export function AuthorizationSchemesTab({ canWrite, onHistory }: { canWrite: boolean; onHistory: (id: string) => void }) {
  const { toast } = useToast();
  const tree = useClassificationTree();
  const activities = useRegulatedActivities();
  const forms = useSubjectForms();
  const mut = useClassificationMutations();

  const [schemeForm, setSchemeForm] = useState<SchemeForm | null>(null);
  const [classForm, setClassForm] = useState<ClassForm | null>(null);
  const [statusReq, setStatusReq] = useState<StatusChangeRequest | null>(null);
  const [btFilter, setBtFilter] = useState('all');

  const businessTypes = tree.data?.businessTypes || [];
  const rows = useMemo(
    () => businessTypes.filter((b) => btFilter === 'all' || b.id === btFilter),
    [businessTypes, btFilter],
  );

  const saveScheme = async () => {
    if (!schemeForm) return;
    try {
      await mut.upsertScheme.mutateAsync({
        _id: schemeForm.id, _business_type_id: schemeForm.business_type_id, _code: schemeForm.code,
        _name: schemeForm.name, _local_legal_name: schemeForm.local_legal_name || null,
        _authorization_method: schemeForm.authorization_method, _market_scope: schemeForm.market_scope,
        _legal_basis: schemeForm.legal_basis || null, _version: schemeForm.version || '1.0',
        _effective_from: schemeForm.effective_from || null, _effective_to: schemeForm.effective_to || null,
        _status: schemeForm.id ? undefined : 'draft', _reason: 'Scheme edit',
      });
      toast({ title: schemeForm.id ? 'Scheme updated' : 'Scheme created as draft' });
      setSchemeForm(null);
    } catch (e: any) { toast({ title: 'Not saved', description: e.message, variant: 'destructive' }); }
  };

  const saveClass = async () => {
    if (!classForm) return;
    try {
      await mut.upsertClass.mutateAsync({
        _id: classForm.id, _scheme_id: classForm.scheme_id, _local_class_code: classForm.local_class_code,
        _name: classForm.name, _description: classForm.description || null,
        _subject_form_code: classForm.subject_form_code === 'none' ? null : classForm.subject_form_code,
        _customer_restriction: classForm.customer_restriction || null, _market_scope: classForm.market_scope,
        _effective_from: classForm.effective_from || null, _effective_to: classForm.effective_to || null,
        _activity_codes: classForm.activity_codes,
        _status: classForm.id ? undefined : 'draft', _reason: 'Class edit',
      });
      toast({ title: classForm.id ? 'Class updated' : 'Class created as draft' });
      setClassForm(null);
    } catch (e: any) { toast({ title: 'Not saved', description: e.message, variant: 'destructive' }); }
  };

  const confirmStatus = async (reason: string) => {
    if (!statusReq) return;
    const args = { _id: statusReq.entityId, _status: statusReq.targetStatus, _reason: reason };
    if (statusReq.entityType === 'scheme') await mut.setSchemeStatus.mutateAsync(args);
    else await mut.setClassStatus.mutateAsync(args);
  };

  const StatusActions = ({ type, id, label, status }: { type: 'scheme' | 'class'; id: string; label: string; status: string }) => (
    <div className="flex flex-wrap items-center gap-1">
      {status !== 'active' && (
        <GuardedButton module="settings" action="edit" data-rbac="settings.edit" size="sm" variant="ghost" disabled={!canWrite}
          onClick={() => setStatusReq({ entityType: type, entityId: id, label, currentStatus: status, targetStatus: 'active' })}>
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Enable
        </GuardedButton>
      )}
      {status === 'active' && (
        <GuardedButton module="settings" action="edit" data-rbac="settings.edit" size="sm" variant="ghost" disabled={!canWrite}
          onClick={() => setStatusReq({ entityType: type, entityId: id, label, currentStatus: status, targetStatus: 'disabled' })}>
          <Ban className="mr-1 h-3.5 w-3.5" />Disable
        </GuardedButton>
      )}
      {status !== 'retired' && (
        <GuardedButton module="settings" action="edit" data-rbac="settings.edit" size="sm" variant="ghost" disabled={!canWrite}
          onClick={() => setStatusReq({ entityType: type, entityId: id, label, currentStatus: status, targetStatus: 'retired' })}>
          <Archive className="mr-1 h-3.5 w-3.5" />Retire
        </GuardedButton>
      )}
      <Button size="sm" variant="ghost" onClick={() => onHistory(id)}>
        <History className="mr-1 h-3.5 w-3.5" />History
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-sm space-y-1.5">
          <Label>Business type</Label>
          <Select value={btFilter} onValueChange={setBtFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All business types</SelectItem>
              {businessTypes.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {rows.map((bt) => (
        <Card key={bt.id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {bt.name}
              <Badge variant={ClassificationStatusBadgeTone(bt.status) as any}>{bt.status.toUpperCase()}</Badge>
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{bt.schemes.length} authorization scheme(s)</span>
              <Button data-rbac="settings.edit" size="sm" variant="outline" disabled={!canWrite}
                onClick={() => setSchemeForm({
                  id: null, business_type_id: bt.id, code: '', name: '', local_legal_name: '',
                  authorization_method: 'LICENCE', market_scope: bt.market_scope || 'DOMESTIC',
                  legal_basis: '', version: '1.0', effective_from: '', effective_to: '',
                })}>
                <Plus className="mr-1 h-3.5 w-3.5" />Add scheme
              </Button>
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {bt.schemes.map((s) => (
              <div key={s.id} className="border-t">
                <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-2">
                  <div>
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.code} · {s.authorization_method} · {s.market_scope} · v{s.version}
                      {s.legal_basis ? ` · ${s.legal_basis}` : ''}
                    </p>
                    {s.status === 'active' && bt.status !== 'active' && (
                      <p className="text-xs text-amber-600">Unavailable because the business type is not active</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={ClassificationStatusBadgeTone(s.status) as any}>{s.status.toUpperCase()}</Badge>
                    <Button data-rbac="settings.edit" size="sm" variant="ghost" disabled={!canWrite}
                      onClick={() => setSchemeForm({
                        id: s.id, business_type_id: s.business_type_id, code: s.code, name: s.name,
                        local_legal_name: s.local_legal_name || '', authorization_method: s.authorization_method,
                        market_scope: s.market_scope, legal_basis: s.legal_basis || '', version: s.version || '1.0',
                        effective_from: s.effective_from || '', effective_to: s.effective_to || '',
                      })}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                    </Button>
                    <Button data-rbac="settings.edit" size="sm" variant="ghost" disabled={!canWrite}
                      onClick={() => setClassForm({
                        id: null, scheme_id: s.id, local_class_code: '', name: '', description: '',
                        subject_form_code: 'none', customer_restriction: '', market_scope: s.market_scope,
                        effective_from: '', effective_to: '', activity_codes: [],
                      })}>
                      <Plus className="mr-1 h-3.5 w-3.5" />Add class
                    </Button>
                    <StatusActions type="scheme" id={s.id} label={s.name} status={s.status} />
                  </div>
                </div>
                {s.classes.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-start justify-between gap-2 border-t bg-muted/30 px-4 py-2 pl-10">
                    <div>
                      <p className="text-sm">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Class {c.local_class_code}
                        {c.customer_restriction ? ` · ${c.customer_restriction}` : ''}
                        {c.activity_codes.length ? ` · ${c.activity_codes.length} activity permission(s)` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={ClassificationStatusBadgeTone(c.status) as any}>{c.status.toUpperCase()}</Badge>
                      <Button data-rbac="settings.edit" size="sm" variant="ghost" disabled={!canWrite}
                        onClick={() => setClassForm({
                          id: c.id, scheme_id: c.scheme_id, local_class_code: c.local_class_code, name: c.name,
                          description: c.description || '', subject_form_code: c.subject_form_code || 'none',
                          customer_restriction: c.customer_restriction || '', market_scope: c.market_scope || 'DOMESTIC',
                          effective_from: c.effective_from || '', effective_to: c.effective_to || '',
                          activity_codes: c.activity_codes,
                        })}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                      </Button>
                      <StatusActions type="class" id={c.id} label={c.name} status={c.status} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {bt.schemes.length === 0 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">No schemes yet.</p>}
          </CardContent>
        </Card>
      ))}

      {/* Scheme dialog */}
      <Dialog open={!!schemeForm} onOpenChange={(o) => { if (!o) setSchemeForm(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{schemeForm?.id ? 'Edit scheme' : 'Add scheme'}</DialogTitle></DialogHeader>
          {schemeForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Code</Label>
                <Input value={schemeForm.code} onChange={(e) => setSchemeForm({ ...schemeForm, code: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Name</Label>
                <Input value={schemeForm.name} onChange={(e) => setSchemeForm({ ...schemeForm, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Authorization method</Label>
                <Select value={schemeForm.authorization_method} onValueChange={(v) => setSchemeForm({ ...schemeForm, authorization_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AUTHORIZATION_METHODS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label>Market scope</Label>
                <Select value={schemeForm.market_scope} onValueChange={(v) => setSchemeForm({ ...schemeForm, market_scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MARKET_SCOPES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label>Version</Label>
                <Input value={schemeForm.version} onChange={(e) => setSchemeForm({ ...schemeForm, version: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Local legal name</Label>
                <Input value={schemeForm.local_legal_name} onChange={(e) => setSchemeForm({ ...schemeForm, local_legal_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Effective from</Label>
                <Input type="date" value={schemeForm.effective_from} onChange={(e) => setSchemeForm({ ...schemeForm, effective_from: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Effective to</Label>
                <Input type="date" value={schemeForm.effective_to} onChange={(e) => setSchemeForm({ ...schemeForm, effective_to: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Legal basis</Label>
                <Input value={schemeForm.legal_basis} onChange={(e) => setSchemeForm({ ...schemeForm, legal_basis: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchemeForm(null)}>Cancel</Button>
            <Button data-rbac="settings.edit" onClick={saveScheme}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Class dialog */}
      <Dialog open={!!classForm} onOpenChange={(o) => { if (!o) setClassForm(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{classForm?.id ? 'Edit class' : 'Add class'}</DialogTitle></DialogHeader>
          {classForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Class code</Label>
                <Input value={classForm.local_class_code} onChange={(e) => setClassForm({ ...classForm, local_class_code: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Name</Label>
                <Input value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Subject form</Label>
                <Select value={classForm.subject_form_code} onValueChange={(v) => setClassForm({ ...classForm, subject_form_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {(forms.data || []).filter((f) => f.status === 'active').map((f) => <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label>Market scope</Label>
                <Select value={classForm.market_scope} onValueChange={(v) => setClassForm({ ...classForm, market_scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MARKET_SCOPES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label>Customer restriction</Label>
                <Input value={classForm.customer_restriction} onChange={(e) => setClassForm({ ...classForm, customer_restriction: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Effective from</Label>
                <Input type="date" value={classForm.effective_from} onChange={(e) => setClassForm({ ...classForm, effective_from: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label>
                <Textarea rows={2} value={classForm.description} onChange={(e) => setClassForm({ ...classForm, description: e.target.value })} /></div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Permitted regulated activities</Label>
                <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                  {(activities.data || []).filter((a) => a.status === 'active').map((a) => (
                    <label key={a.code} className="flex items-start gap-2 text-sm">
                      <Checkbox checked={classForm.activity_codes.includes(a.code)}
                        onCheckedChange={(v) => setClassForm({
                          ...classForm,
                          activity_codes: v
                            ? [...classForm.activity_codes, a.code]
                            : classForm.activity_codes.filter((c) => c !== a.code),
                        })} />
                      <span>{a.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassForm(null)}>Cancel</Button>
            <Button data-rbac="settings.edit" onClick={saveClass}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StatusChangeDialog request={statusReq} onClose={() => setStatusReq(null)} onConfirm={confirmStatus} />
    </div>
  );
}
