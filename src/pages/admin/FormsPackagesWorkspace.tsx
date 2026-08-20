/**
 * RDM-ENTITY-001 Wave B — Forms & Packages Workspace (`/admin/forms-packages`).
 *
 * The single admin surface for the semantic form layer:
 *  - Logical field definitions and their canonical data-concept bindings
 *  - Form packages (which forms are filed together) and package items
 *  - Applicability rules + a live resolver preview
 *  - The Wave B migration workbench (legacy templates, unmapped fields,
 *    applications without pinned requirements)
 *
 * Every write is a governed RPC; nothing here writes the Wave B tables directly.
 */
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Info, Loader2, Package, PlugZap, Wrench, Link2, Plus, Trash2, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/datetime';
import { useCan } from '@/hooks/useCan';
import {
  useApplicabilityRules, useDataConceptMutations, useDataConcepts, useDataDomains,
  useFieldDefinitions, useFormPackageItems, useFormPackages, useFormTemplatesLite,
  useMigrationWorkbenchMutations, usePackageMutations, useResolvePackagePreview, useWaveBMigrationReport,
} from '@/hooks/useWaveB';

const NONE = 'none';

function Empty({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">{text}</TableCell>
    </TableRow>
  );
}

/* ================= Logical fields & concepts ================= */

function FieldSemanticsTab({ canWrite }: { canWrite: boolean }) {
  const { data: templates = [] } = useFormTemplatesLite();
  const [templateId, setTemplateId] = useState<string>(NONE);
  const { data: definitions = [], isLoading } = useFieldDefinitions(templateId === NONE ? null : templateId);
  const { data: concepts = [] } = useDataConcepts();
  const { data: domains = [] } = useDataDomains();
  const { bindField, save } = useDataConceptMutations();
  const { backfillFieldDefinitions } = useMigrationWorkbenchMutations();
  const [newConcept, setNewConcept] = useState<{ code: string; name: string; domain: string; sensitivity: string } | null>(null);

  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" /> Logical field identities</CardTitle>
          <CardDescription>
            Each form field has a stable logical identity (<code>template + field_key</code>) that survives versioning.
            Binding it to a canonical data concept is what makes submitted data reusable across the regulatory data model.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1">
              <Label className="text-xs">Form template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All templates</SelectItem>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {canWrite && (
              <Button
                variant="outline" size="sm"
                disabled={backfillFieldDefinitions.isPending}
                onClick={() => backfillFieldDefinitions.mutate(templateId === NONE ? null : templateId, {
                  onSuccess: (r: any) => toast.success(`Logical identities created: ${r?.definitions_created ?? 0}, fields linked: ${r?.fields_linked ?? 0}`),
                  onError: (e: any) => toast.error(e.message),
                })}
              >
                {backfillFieldDefinitions.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wrench className="mr-1.5 h-3.5 w-3.5" />}
                Create missing identities
              </Button>
            )}
            {canWrite && (
              <Button size="sm" onClick={() => setNewConcept({ code: '', name: '', domain: NONE, sensitivity: 'INTERNAL' })}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> New concept
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field key</TableHead>
                  <TableHead>Label hint</TableHead>
                  <TableHead>Canonical concept</TableHead>
                  <TableHead>Sensitivity</TableHead>
                  <TableHead>Published</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <Empty colSpan={5} text="Loading logical fields…" />}
                {!isLoading && definitions.length === 0 && <Empty colSpan={5} text="No logical field identities for this selection." />}
                {definitions.map((d) => {
                  const concept = d.data_concept_id ? conceptById.get(d.data_concept_id) : null;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.field_key}</TableCell>
                      <TableCell className="text-sm">{d.label_hint || '—'}</TableCell>
                      <TableCell>
                        {canWrite ? (
                          <Select
                            value={d.data_concept_id ?? NONE}
                            onValueChange={(v) => bindField.mutate(
                              { definitionId: d.id, conceptId: v === NONE ? null : v },
                              { onSuccess: () => toast.success('Concept binding saved'), onError: (e: any) => toast.error(e.message) },
                            )}
                          >
                            <SelectTrigger className="h-8 w-[280px]"><SelectValue placeholder="Unbound" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Unbound</SelectItem>
                              {concepts.filter((c) => c.is_active).map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm">{concept ? `${concept.code} — ${concept.name}` : 'Unbound'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {concept?.sensitivity_classification
                          ? <Badge variant="outline" className="text-xs">{concept.sensitivity_classification}</Badge>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={d.is_published ? 'default' : 'outline'} className="text-xs">
                          {d.is_published ? 'published' : 'draft'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!newConcept} onOpenChange={(o) => !o && setNewConcept(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New data concept</DialogTitle>
            <DialogDescription>Concept codes are immutable once created — they are the semantic identity of the data.</DialogDescription>
          </DialogHeader>
          {newConcept && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Code</Label>
                <Input value={newConcept.code} onChange={(e) => setNewConcept({ ...newConcept, code: e.target.value.toUpperCase() })} placeholder="ENTITY_LEGAL_NAME" />
              </div>
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={newConcept.name} onChange={(e) => setNewConcept({ ...newConcept, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Data domain</Label>
                <Select value={newConcept.domain} onValueChange={(v) => setNewConcept({ ...newConcept, domain: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unassigned</SelectItem>
                    {domains.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sensitivity</Label>
                <Select value={newConcept.sensitivity} onValueChange={(v) => setNewConcept({ ...newConcept, sensitivity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'SENSITIVE'].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewConcept(null)}>Cancel</Button>
            <Button
              disabled={!newConcept?.code || !newConcept?.name || save.isPending}
              onClick={() => newConcept && save.mutate(
                {
                  values: {
                    code: newConcept.code,
                    name: newConcept.name,
                    data_domain_id: newConcept.domain === NONE ? null : newConcept.domain,
                    sensitivity_classification: newConcept.sensitivity,
                    is_active: true,
                  },
                },
                { onSuccess: () => { toast.success('Concept created'); setNewConcept(null); }, onError: (e: any) => toast.error(e.message) },
              )}
            >
              {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================= Packages ================= */

function PackagesTab({ canWrite, canPublish }: { canWrite: boolean; canPublish: boolean }) {
  const { data: packages = [], isLoading } = useFormPackages();
  const { data: templates = [] } = useFormTemplatesLite();
  const [selected, setSelected] = useState<string | null>(null);
  const activeId = selected ?? packages[0]?.id ?? null;
  const { data: items = [] } = useFormPackageItems(activeId);
  const { savePackage, saveItem, deleteItem } = usePackageMutations();
  const [draft, setDraft] = useState<{ code: string; name: string; description: string } | null>(null);
  const [addTemplate, setAddTemplate] = useState<string>(NONE);
  const [addRequired, setAddRequired] = useState(true);

  const active = packages.find((p) => p.id === activeId) || null;

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Form packages</CardTitle>
          <CardDescription>A package is the set of forms filed together for one regulatory purpose.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {canWrite && (
            <Button size="sm" className="w-full" onClick={() => setDraft({ code: '', name: '', description: '' })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New package
            </Button>
          )}
          {isLoading && <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && packages.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No packages configured.</p>}
          {packages.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`w-full rounded-md border p-2 text-left text-sm transition hover:bg-muted/50 ${p.id === activeId ? 'border-primary bg-muted/40' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{p.name}</span>
                <Badge variant={p.status === 'published' ? 'default' : 'outline'} className="text-xs">{p.status}</Badge>
              </div>
              <p className="font-mono text-xs text-muted-foreground">{p.code} · v{p.version}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{active ? active.name : 'Package contents'}</CardTitle>
          <CardDescription>
            {active
              ? `Status ${active.status}${active.published_at ? ` · published ${formatDateTime(active.published_at)}` : ''}`
              : 'Select a package to manage its forms.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {active && canWrite && (
            <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
              <div className="min-w-[240px] flex-1">
                <Label className="text-xs">Add form template</Label>
                <Select value={addTemplate} onValueChange={setAddTemplate}>
                  <SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Select…</SelectItem>
                    {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch checked={addRequired} onCheckedChange={setAddRequired} id="req" />
                <Label htmlFor="req" className="text-xs">Mandatory</Label>
              </div>
              <Button
                size="sm"
                disabled={addTemplate === NONE || saveItem.isPending}
                onClick={() => saveItem.mutate(
                  { package_id: active.id, template_id: addTemplate, is_required: addRequired, sequence: items.length + 1 },
                  { onSuccess: () => { toast.success('Form added to package'); setAddTemplate(NONE); }, onError: (e: any) => toast.error(e.message) },
                )}
              >
                Add
              </Button>
              {canPublish && active.status !== 'published' && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => savePackage.mutate(
                    { id: active.id, code: active.code, name: active.name, status: 'published' },
                    { onSuccess: () => toast.success('Package published'), onError: (e: any) => toast.error(e.message) },
                  )}
                >
                  Publish package
                </Button>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Seq</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Template status</TableHead>
                  {canWrite && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!active && <Empty colSpan={canWrite ? 5 : 4} text="No package selected." />}
                {active && items.length === 0 && <Empty colSpan={canWrite ? 5 : 4} text="This package contains no forms yet." />}
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.sequence}</TableCell>
                    <TableCell className="font-medium">{i.form_templates?.name || i.template_id}</TableCell>
                    <TableCell>
                      <Badge variant={i.is_required ? 'default' : 'outline'} className="text-xs">
                        {i.is_required ? 'Mandatory' : 'Optional'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.form_templates?.status || '—'}</TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => deleteItem.mutate(i.id, {
                            onSuccess: () => toast.success('Removed from package'),
                            onError: (e: any) => toast.error(e.message),
                          })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New form package</DialogTitle>
            <DialogDescription>Packages start as drafts and only resolve to applicants once published.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div><Label className="text-xs">Code</Label>
                <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} placeholder="BANK_NEW_LICENCE" /></div>
              <div><Label className="text-xs">Name</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
              <div><Label className="text-xs">Description</Label>
                <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button
              disabled={!draft?.code || !draft?.name || savePackage.isPending}
              onClick={() => draft && savePackage.mutate(
                { code: draft.code, name: draft.name, description: draft.description, status: 'draft' },
                { onSuccess: () => { toast.success('Package created'); setDraft(null); }, onError: (e: any) => toast.error(e.message) },
              )}
            >
              {savePackage.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================= Applicability ================= */

function ApplicabilityTab({ canWrite }: { canWrite: boolean }) {
  const { data: rules = [], isLoading } = useApplicabilityRules();
  const { data: packages = [] } = useFormPackages();
  const { saveRule, deleteRule } = usePackageMutations();
  const preview = useResolvePackagePreview();
  const [ctx, setCtx] = useState({ lifecycle_key: 'pre_authorisation', application_type: '', license_type: '', request_type_key: '' });
  const [draft, setDraft] = useState<{ package_id: string; lifecycle_key: string; application_type: string; license_type: string; request_type_key: string; priority: string } | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><PlugZap className="h-4 w-4" /> Applicability rules</CardTitle>
          <CardDescription>
            Rules decide which published package applies to a request context. The most specific active rule wins —
            regulator and category beat sector, which beats licence type and lifecycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {canWrite && (
            <Button size="sm" onClick={() => setDraft({ package_id: NONE, lifecycle_key: '', application_type: '', license_type: '', request_type_key: '', priority: '0' })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New rule
            </Button>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Lifecycle</TableHead>
                  <TableHead>Request type</TableHead>
                  <TableHead>Licence type</TableHead>
                  <TableHead>Application type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Active</TableHead>
                  {canWrite && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <Empty colSpan={canWrite ? 8 : 7} text="Loading rules…" />}
                {!isLoading && rules.length === 0 && <Empty colSpan={canWrite ? 8 : 7} text="No applicability rules configured." />}
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.form_packages?.name || r.package_id}
                      <span className="ml-2 text-xs text-muted-foreground">{r.form_packages?.status}</span>
                    </TableCell>
                    <TableCell className="text-xs">{r.lifecycle_key || 'any'}</TableCell>
                    <TableCell className="text-xs">{r.request_type_key || 'any'}</TableCell>
                    <TableCell className="text-xs">{r.license_type || 'any'}</TableCell>
                    <TableCell className="text-xs">{r.application_type || 'any'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.priority}</TableCell>
                    <TableCell><Badge variant={r.is_active ? 'default' : 'outline'} className="text-xs">{r.is_active ? 'active' : 'inactive'}</Badge></TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => deleteRule.mutate(r.id, {
                          onSuccess: () => toast.success('Rule removed'), onError: (e: any) => toast.error(e.message),
                        })}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><PlayCircle className="h-4 w-4" /> Resolver preview</CardTitle>
          <CardDescription>Test which package a given context resolves to, exactly as the applicant flow will see it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {(['lifecycle_key', 'request_type_key', 'license_type', 'application_type'] as const).map((k) => (
              <div key={k}>
                <Label className="text-xs">{k.replace(/_/g, ' ')}</Label>
                <Input value={(ctx as any)[k]} onChange={(e) => setCtx({ ...ctx, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <Button size="sm" onClick={() => preview.mutate(ctx)} disabled={preview.isPending}>
            {preview.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Resolve
          </Button>
          {preview.data && (
            <div className="rounded-md border p-3 text-sm">
              {preview.data.resolved ? (
                <>
                  <p className="font-medium">Resolved · specificity {preview.data.specificity}</p>
                  <ul className="mt-2 space-y-1">
                    {(preview.data.items || []).map((i) => (
                      <li key={i.template_id} className="flex items-center justify-between rounded border p-2">
                        <span>{i.sequence}. {i.template_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {i.is_required ? 'mandatory' : 'optional'}{i.form_version ? ` · v${i.form_version}` : ' · no published version'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-muted-foreground">No applicable package ({preview.data.reason}). The applicant flow falls back to manual form selection.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New applicability rule</DialogTitle>
            <DialogDescription>Leave a dimension blank to match any value.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Package</Label>
                <Select value={draft.package_id} onValueChange={(v) => setDraft({ ...draft, package_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Select…</SelectItem>
                    {packages.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.status})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(['lifecycle_key', 'request_type_key', 'license_type', 'application_type', 'priority'] as const).map((k) => (
                <div key={k}>
                  <Label className="text-xs">{k.replace(/_/g, ' ')}</Label>
                  <Input value={(draft as any)[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button
              disabled={!draft || draft.package_id === NONE || saveRule.isPending}
              onClick={() => draft && saveRule.mutate(
                {
                  package_id: draft.package_id,
                  lifecycle_key: draft.lifecycle_key || null,
                  request_type_key: draft.request_type_key || null,
                  license_type: draft.license_type || null,
                  application_type: draft.application_type || null,
                  priority: Number(draft.priority) || 0,
                  is_active: true,
                },
                { onSuccess: () => { toast.success('Rule saved'); setDraft(null); }, onError: (e: any) => toast.error(e.message) },
              )}
            >
              {saveRule.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================= Migration workbench ================= */

function MigrationWorkbenchTab({ canWrite }: { canWrite: boolean }) {
  const { data: report, isLoading } = useWaveBMigrationReport();
  const { decide, backfillApplicationRequirements } = useMigrationWorkbenchMutations();
  const counts = report?.counts ?? {};

  const metric = (label: string, key: string) => (
    <div key={key} className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-lg">{counts[key] ?? 0}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Evidence-only migration</AlertTitle>
        <AlertDescription>
          Legacy records are only reclassified from stored evidence. Where evidence does not exist, the record is
          explicitly marked <strong>legacy requirements unknown</strong> — requirements are never invented.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {metric('Templates', 'templates_total')}
        {metric('Unclassified templates', 'templates_unclassified')}
        {metric('Fields without identity', 'fields_without_definition')}
        {metric('Definitions without concept', 'definitions_without_concept')}
        {metric('Submitted applications', 'applications_submitted')}
        {metric('Missing pinned requirements', 'applications_missing_requirements')}
        {metric('Migrated with evidence', 'applications_migrated_with_evidence')}
        {metric('Legacy unknown', 'applications_legacy_unknown')}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Legacy template classification</CardTitle>
          <CardDescription>Give each legacy template a governed purpose and lifecycle, using its stored form type as evidence.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Legacy type</TableHead>
                <TableHead>Mapping</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Suggestion</TableHead>
                <TableHead>Fields</TableHead>
                {canWrite && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <Empty colSpan={canWrite ? 7 : 6} text="Loading migration report…" />}
              {!isLoading && (report?.legacy_templates?.length ?? 0) === 0 && <Empty colSpan={canWrite ? 7 : 6} text="No templates found." />}
              {(report?.legacy_templates || []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs">{t.legacy_form_type || '—'}</TableCell>
                  <TableCell><Badge variant={t.mapping_status === 'MAPPED' ? 'default' : 'outline'} className="text-xs">{t.mapping_status}</Badge></TableCell>
                  <TableCell className="text-xs">{t.purpose_key || '—'}</TableCell>
                  <TableCell className="text-xs">
                    {t.suggested_purpose_key || '—'}
                    {t.suggested_lifecycle ? ` · ${t.suggested_lifecycle}` : ''}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.field_count}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="outline"
                        disabled={!t.suggested_purpose_key || decide.isPending}
                        onClick={() => decide.mutate(
                          {
                            targetType: 'form_template',
                            targetId: t.id,
                            decision: 'CLASSIFY',
                            canonical: { purpose_key: t.suggested_purpose_key, lifecycle_key: t.suggested_lifecycle },
                            reason: 'Classified from stored legacy form type',
                            evidence: t.evidence as unknown as Record<string, unknown>,
                          },
                          { onSuccess: () => toast.success('Template classified'), onError: (e: any) => toast.error(e.message) },
                        )}
                      >
                        Apply suggestion
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Applications without pinned requirements</CardTitle>
          <CardDescription>Reconstruct requirements from stored form-version evidence, or record the gap honestly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {canWrite && (
            <Button
              size="sm" variant="outline"
              disabled={backfillApplicationRequirements.isPending}
              onClick={() => backfillApplicationRequirements.mutate(null, {
                onSuccess: (r: any) => toast.success(`Reconstructed ${r?.requirements_created ?? 0} requirements across ${r?.applications_processed ?? 0} applications`),
                onError: (e: any) => toast.error(e.message),
              })}
            >
              {backfillApplicationRequirements.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wrench className="mr-1.5 h-3.5 w-3.5" />}
              Reconstruct from evidence
            </Button>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Classification</TableHead>
                  {canWrite && <TableHead className="text-right">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.applications_missing_requirements_detail?.length ?? 0) === 0 && (
                  <Empty colSpan={canWrite ? 6 : 5} text="Every submitted application has pinned requirements." />
                )}
                {(report?.applications_missing_requirements_detail || []).map((a) => (
                  <TableRow key={a.application_id}>
                    <TableCell className="font-mono text-xs">{a.application_number || a.application_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">{a.status}</TableCell>
                    <TableCell className="text-xs">{a.submitted_at ? formatDateTime(a.submitted_at) : '—'}</TableCell>
                    <TableCell className="text-xs">{a.evidence_versions} versions · {a.evidence_responses} responses</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{a.classification}</Badge></TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <Button
                          size="sm" variant="ghost"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate(
                            {
                              targetType: 'application',
                              targetId: a.application_id,
                              decision: 'MARK_LEGACY_UNKNOWN',
                              reason: 'No stored form-version evidence exists for this historical application',
                            },
                            { onSuccess: () => toast.success('Recorded as legacy unknown'), onError: (e: any) => toast.error(e.message) },
                          )}
                        >
                          Mark legacy unknown
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Decision log</CardTitle>
          <CardDescription>Append-only record of every migration decision — who decided what, and on what evidence.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report?.recent_decisions?.length ?? 0) === 0 && <Empty colSpan={5} text="No migration decisions recorded yet." />}
              {(report?.recent_decisions || []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs">{formatDateTime(d.decided_at)}</TableCell>
                  <TableCell className="text-xs">{d.target_type}</TableCell>
                  <TableCell className="text-xs">{d.decision}</TableCell>
                  <TableCell className="text-xs">{d.reason || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{d.affected_rows ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ================= Page ================= */

export default function FormsPackagesWorkspace() {
  const canWrite = useCan('form_management', 'edit');
  const canPublish = useCan('form_management', 'publish');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forms & Packages"
        description="Logical field identities, canonical data concepts, form packages, applicability rules and the Wave B migration workbench."
        backHref="/admin/config/forms-master-data"
        backLabel="Configuration"
      />

      {!canWrite && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Read-only access</AlertTitle>
          <AlertDescription>You can review this configuration but not change it.</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="fields">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="fields">Field Semantics</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="applicability">Applicability</TabsTrigger>
          <TabsTrigger value="migration">Migration Workbench</TabsTrigger>
        </TabsList>
        <TabsContent value="fields" className="mt-4"><FieldSemanticsTab canWrite={canWrite} /></TabsContent>
        <TabsContent value="packages" className="mt-4"><PackagesTab canWrite={canWrite} canPublish={canPublish} /></TabsContent>
        <TabsContent value="applicability" className="mt-4"><ApplicabilityTab canWrite={canWrite} /></TabsContent>
        <TabsContent value="migration" className="mt-4"><MigrationWorkbenchTab canWrite={canWrite} /></TabsContent>
      </Tabs>
    </div>
  );
}
