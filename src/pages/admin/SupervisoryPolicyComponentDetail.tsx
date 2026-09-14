/**
 * Supervisory Policy Component workspace.
 *
 * One version of one policy area: its entries, the server's validation verdict,
 * the governed lifecycle (draft → submitted → approved → active), and its full
 * history. The editor is generated from the server-published content contract,
 * so no policy field list is duplicated in the browser and no state, validity or
 * authority is decided here — every verdict on this screen comes from the server.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { toast } from '@/hooks/use-toast';
import {
  ErrorPanel, Field, ProfileStatusBadge, errorMessage, formatDate, formatDateTime, humanize,
} from '@/components/admin/supervisory-policy-profile/labels';
import {
  usePolicyComponentDetail, usePolicyComponentLifecycle, useNewPolicyComponentVersion,
  usePolicyComponentReferenceOptions, useSavePolicyComponent,
  type PolicyComponentContract,
} from '@/hooks/useSupervisoryPolicyComponents';
import { EvidencePolicyRuleEditor } from '@/components/admin/supervisory-policy-profile/EvidencePolicyRuleEditor';
import {
  PolicyComponentEntryEditor, type EntryFieldSpec,
} from '@/components/admin/supervisory-policy-profile/PolicyComponentEntryEditor';
import { AREA_COPY } from '@/components/admin/supervisory-policy-profile/policyComponentVocabulary';

type Item = Record<string, unknown>;

function fieldSpecs(contract: PolicyComponentContract | null): EntryFieldSpec[] {
  if (!contract) return [];
  const names: string[] = [];
  const push = (n: string) => { if (!names.includes(n)) names.push(n); };
  (contract.required_fields ?? []).forEach(push);
  Object.keys(contract.enums ?? {}).forEach(push);
  Object.keys(contract.enum_arrays ?? {}).forEach(push);
  (contract.non_empty_arrays ?? []).forEach(push);
  (contract.positive_numbers ?? []).forEach(push);
  (contract.booleans ?? []).forEach(push);
  const required = (name: string) => (contract.required_fields ?? []).includes(name);
  return names.map((name) => {
    if (contract.enums?.[name]) return { name, kind: 'enum' as const, required: required(name), options: contract.enums[name] };
    if (contract.enum_arrays?.[name]) return { name, kind: 'enum_array' as const, required: required(name), options: contract.enum_arrays[name] };
    if ((contract.non_empty_arrays ?? []).includes(name)) return { name, kind: 'array' as const, required: required(name), options: [] };
    if ((contract.booleans ?? []).includes(name)) return { name, kind: 'boolean' as const, required: required(name), options: [] };
    if ((contract.positive_numbers ?? []).includes(name)) return { name, kind: 'number' as const, required: required(name), options: [] };
    return { name, kind: 'text' as const, required: required(name), options: [] };
  });
}

export default function SupervisoryPolicyComponentDetailPage() {
  const { componentId } = useParams<{ componentId: string }>();
  const navigate = useNavigate();
  const detail = usePolicyComponentDetail(componentId);
  const save = useSavePolicyComponent();
  const lifecycle = usePolicyComponentLifecycle();
  const newVersion = useNewPolicyComponentVersion();

  const contract = detail.data?.contract ?? null;
  const specs = useMemo(() => fieldSpecs(contract), [contract]);
  const collection = contract?.collection ?? 'items';

  const references = usePolicyComponentReferenceOptions({
    componentType: detail.data?.component.component_type ?? null,
    domainCode: detail.data?.component.domain_code ?? null,
    regulatorId: detail.data?.component.regulator_id ?? null,
  });
  const refFields = references.data ?? {};

  const [items, setItems] = useState<Item[]>([]);
  const [dirty, setDirty] = useState(false);
  const [transition, setTransition] = useState<string | null>(null);
  const [rationale, setRationale] = useState('');
  const [versionLabel, setVersionLabel] = useState('');
  const [versioning, setVersioning] = useState(false);
  const [dates, setDates] = useState({ effective_from: '', effective_to: '' });
  const [datesDirty, setDatesDirty] = useState(false);

  useEffect(() => {
    const content = detail.data?.component.content as Record<string, unknown> | undefined;
    const rows = content?.[collection];
    setItems(Array.isArray(rows) ? (rows as Item[]) : []);
    setDirty(false);
    setDates({
      effective_from: detail.data?.component.effective_from?.slice(0, 10) ?? '',
      effective_to: detail.data?.component.effective_to?.slice(0, 10) ?? '',
    });
    setDatesDirty(false);
  }, [detail.data?.component.id, detail.data?.component.updated_at, collection]);

  if (detail.isLoading) return <Skeleton className="h-96 w-full" />;
  if (detail.error) return <ErrorPanel error={detail.error} title="This policy component could not be loaded" />;
  if (!detail.data) return null;

  const c = detail.data.component;
  const caps = detail.data.capabilities;
  const validation = detail.data.validation;
  const editable = caps.can_edit;

  const area = AREA_COPY[c.component_type] ?? null;
  const addItem = () => { setItems((prev) => [...prev, {}]); setDirty(true); };

  const persist = async () => {
    try {
      await save.mutateAsync({
        componentId: c.id,
        payload: { content: { ...(c.content ?? {}), [collection]: items } },
      });
      setDirty(false);
      toast({ title: 'Draft saved', description: 'The server has re-checked the configuration.' });
    } catch (e) {
      toast({ title: 'Save refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const persistDates = async () => {
    try {
      await save.mutateAsync({
        componentId: c.id,
        payload: { effective_from: dates.effective_from, effective_to: dates.effective_to },
      });
      setDatesDirty(false);
      toast({ title: 'Period of effect saved', description: 'The dates are recorded against this version.' });
    } catch (e) {
      toast({ title: 'Save refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const runTransition = async () => {
    if (!transition) return;
    try {
      await lifecycle.mutateAsync({ componentId: c.id, toStatus: transition, rationale });
      toast({ title: 'Recorded', description: `This version is now ${humanize(transition).toLowerCase()}.` });
      setTransition(null); setRationale('');
    } catch (e) {
      toast({ title: 'Action refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const createVersion = async () => {
    try {
      const r = await newVersion.mutateAsync({ componentId: c.id, newVersion: versionLabel, rationale });
      setVersioning(false); setVersionLabel(''); setRationale('');
      navigate(`/admin/supervisory-policy-components/${r.component_id}`);
    } catch (e) {
      toast({ title: 'Action refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${c.type_label} · ${c.code} ${c.component_version}`}
        description={c.purpose ?? c.name}
        backHref="/admin/supervisory-policy-components"
        backLabel="Policy Components"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ProfileStatusBadge status={c.status} />
            {caps.can_submit ? (
              <Button size="sm" variant="outline" data-rbac="aml_supervision.manage_config"
                onClick={() => setTransition('SUBMITTED')}>Submit for approval</Button>
            ) : null}
            {caps.can_return ? (
              <Button size="sm" variant="outline" data-rbac="aml_supervision.manage_config"
                onClick={() => setTransition('DRAFT')}>Return to draft</Button>
            ) : null}
            {caps.can_approve_now ? (
              <Button size="sm" data-rbac="aml_supervision.manage_config"
                onClick={() => setTransition('APPROVED')}>Approve</Button>
            ) : null}
            {caps.can_activate ? (
              <Button size="sm" data-rbac="aml_supervision.manage_config"
                onClick={() => setTransition('ACTIVE')}>Activate</Button>
            ) : null}
            {caps.can_retire ? (
              <Button size="sm" variant="outline" data-rbac="aml_supervision.manage_config"
                onClick={() => setTransition('RETIRED')}>Retire</Button>
            ) : null}
            {caps.can_new_version ? (
              <Button size="sm" variant="outline" data-rbac="aml_supervision.manage_config"
                onClick={() => setVersioning(true)}>New version</Button>
            ) : null}
          </div>
        }
      />

      {area ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">What this area sets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm">{area.purpose}</p>
            <p className={area.consumed ? 'text-xs text-muted-foreground' : 'text-xs text-warning'}>
              {area.effect}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Version</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Name">{c.name}</Field>
            <Field label="Supervisory domain">{humanize(c.domain_code)}</Field>
            <Field label="Origin">{humanize(c.origin)}</Field>
            <Field label="Submitted">{formatDateTime(c.submitted_at)}</Field>
            <Field label="Approved">{formatDateTime(c.approved_at)}</Field>
            <Field label="Activated">{formatDateTime(c.activated_at)}</Field>
            <Field label="Last updated">{formatDateTime(c.updated_at)}</Field>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Period of effect</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              The dates from which this version applies, and the date it stops applying. Leave the end date empty
              while it applies until further notice.
            </p>
          </div>
          {editable ? (
            <Button size="sm" className="gap-1.5" onClick={persistDates}
              disabled={!datesDirty || save.isPending} data-rbac="aml_supervision.manage_config">
              <Save className="h-3.5 w-3.5" />Save dates
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {editable ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:max-w-md">
              <div className="space-y-1.5">
                <Label htmlFor="pc-eff-from">Applies from</Label>
                <Input id="pc-eff-from" type="date" value={dates.effective_from}
                  onChange={(e) => { setDates((d) => ({ ...d, effective_from: e.target.value })); setDatesDirty(true); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-eff-to">Applies until</Label>
                <Input id="pc-eff-to" type="date" value={dates.effective_to}
                  onChange={(e) => { setDates((d) => ({ ...d, effective_to: e.target.value })); setDatesDirty(true); }} />
              </div>
            </div>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:max-w-md">
              <Field label="Applies from">{formatDate(c.effective_from)}</Field>
              <Field label="Applies until">{c.effective_to ? formatDate(c.effective_to) : 'Until further notice'}</Field>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              {humanize(collection)} · {items.length} {items.length === 1 ? 'entry' : 'entries'}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {validation.valid
                ? 'The server accepts this configuration.'
                : 'The server will not accept this configuration yet.'}
            </p>
          </div>
          {editable ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={addItem}
                data-rbac="aml_supervision.manage_config">
                <Plus className="h-3.5 w-3.5" />Add {contract?.item_label ?? 'entry'}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={persist} disabled={!dirty || save.isPending}
                data-rbac="aml_supervision.manage_config">
                <Save className="h-3.5 w-3.5" />{save.isPending ? 'Saving…' : 'Save draft'}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {c.status === 'DRAFT'
                ? 'You do not have authority to edit this configuration.'
                : 'Approved configuration is immutable — create a new version to change it.'}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {c.component_type === 'EVIDENCE_POLICY' ? (
            <EvidencePolicyRuleEditor
              componentId={c.id}
              items={items}
              editable={editable}
              onChange={(next) => { setItems(next); setDirty(true); }}
            />
          ) : (
            <PolicyComponentEntryEditor
              componentType={c.component_type}
              itemLabel={contract?.item_label ?? 'entry'}
              specs={specs}
              items={items}
              refFields={refFields}
              editable={editable}
              onChange={(next) => { setItems(next); setDirty(true); }}
            />
          )}

          {validation.errors.length ? (
            <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
              <p className="text-xs font-medium">Outstanding before this version can be submitted</p>
              <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                {validation.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          ) : null}
          {dirty ? (
            <p className="text-xs text-muted-foreground">
              Unsaved changes. The list above is re-checked by the server once saved.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!detail.data.history.length ? (
            <p className="text-sm text-muted-foreground">No events recorded yet.</p>
          ) : detail.data.history.map((h) => (
            <div key={h.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{humanize(h.event_type)}</span>
                {h.from_status || h.to_status ? (
                  <span className="text-xs text-muted-foreground">
                    {humanize(h.from_status)} → {humanize(h.to_status)}
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(h.created_at)}</span>
              </div>
              {h.rationale ? <p className="mt-1 text-xs text-muted-foreground">{h.rationale}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!transition} onOpenChange={(o) => (o ? null : (setTransition(null), setRationale('')))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{humanize(transition)} this version</DialogTitle>
            <DialogDescription>
              The server checks your authority, the maker/checker rule and the configuration itself before recording this.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pc-rationale">Reason</Label>
            <Textarea id="pc-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTransition(null); setRationale(''); }}>Cancel</Button>
            <Button onClick={runTransition} disabled={rationale.trim().length < 10 || lifecycle.isPending}>
              {lifecycle.isPending ? 'Recording…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={versioning} onOpenChange={(o) => (o ? null : (setVersioning(false), setRationale('')))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new version</DialogTitle>
            <DialogDescription>
              The current entries are copied into a new draft. This version stays exactly as approved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pc-newversion">New version label</Label>
              <Input id="pc-newversion" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-version-rationale">Reason</Label>
              <Textarea id="pc-version-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVersioning(false); setRationale(''); }}>Cancel</Button>
            <Button onClick={createVersion}
              disabled={!versionLabel.trim() || rationale.trim().length < 10 || newVersion.isPending}>
              {newVersion.isPending ? 'Creating…' : 'Create draft version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
