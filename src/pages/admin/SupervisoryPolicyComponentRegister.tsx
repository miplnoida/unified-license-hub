/**
 * Supervisory Policy Component register.
 *
 * One generic administration surface for every versioned policy component the
 * regulator authors itself: sector overlays, fact configuration, source
 * bindings, evidence, materiality, judgement/override, supervisory response,
 * SLA, dashboard and notification policy. Nothing is domain-specific here — the
 * component catalogue and the server-side content contract drive the screen.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { toast } from '@/hooks/use-toast';
import {
  EmptyPanel, ErrorPanel, ProfileStatusBadge, errorMessage, formatDate, humanize,
} from '@/components/admin/supervisory-policy-profile/labels';
import {
  useCreatePolicyComponent, usePolicyComponents, usePolicyComponentApprovalQueue,
} from '@/hooks/useSupervisoryPolicyComponents';
import { useSupervisoryPolicyProfileOptions } from '@/hooks/useSupervisoryPolicyProfiles';

export default function SupervisoryPolicyComponentRegisterPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');

  const query = usePolicyComponents({
    componentType: type === 'all' ? null : type,
    status: status === 'all' ? null : status,
    search: search || null,
  });
  const options = useSupervisoryPolicyProfileOptions();

  const authorable = useMemo(
    () => (query.data?.types ?? []).filter((t) => t.authorable),
    [query.data?.types],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supervisory Policy Components"
        description="The regulator's own versioned configuration for each supervisory policy area — applicability, facts and sources, evidence, materiality, override rules, supervisory responses, service levels, dashboards and notifications. Every version is validated, approved by a second officer and then bound to a policy profile."
        actions={
          <CreateComponentDialog
            types={authorable}
            domains={(options.data?.domains ?? []).map((d) => d.domain_code)}
            regulators={options.data?.regulators ?? []}
            onCreated={(id) => navigate(`/admin/supervisory-policy-components/${id}`)}
          />
        }
      />

      <RegisterToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search code or name">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-[16rem]" aria-label="Policy area"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All policy areas</SelectItem>
            {authorable.map((t) => (
              <SelectItem key={t.component_type} value={t.component_type}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['all', 'DRAFT', 'SUBMITTED', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'RETIRED'].map((s) => (
              <SelectItem key={s} value={s}>{s === 'all' ? 'All statuses' : humanize(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </RegisterToolbar>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : query.error ? (
        <ErrorPanel error={query.error} title="The policy component register could not be loaded" />
      ) : !query.data?.rows.length ? (
        <EmptyPanel
          title="No policy component versions yet"
          description="Create the first version for a policy area. It stays in draft until a second officer approves it."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy area</TableHead>
                    <TableHead>Code &amp; version</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Entries</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Effective from</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/admin/supervisory-policy-components/${r.id}`)}
                    >
                      <TableCell className="text-sm">{r.type_label}</TableCell>
                      <TableCell className="font-mono text-xs">{r.code} · {r.component_version}</TableCell>
                      <TableCell className="text-sm">{r.name}</TableCell>
                      <TableCell className="text-sm">{humanize(r.domain_code)}</TableCell>
                      <TableCell className="text-sm">
                        {r.item_count ?? 0}
                        {r.is_valid === false ? (
                          <span className="ml-2 text-xs text-destructive">incomplete</span>
                        ) : null}
                      </TableCell>
                      <TableCell><ProfileStatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-sm">{formatDate(r.effective_from)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CreateComponentDialog({
  types, domains, regulators, onCreated,
}: {
  types: Array<{ component_type: string; label: string; description: string | null }>;
  domains: string[];
  regulators: Array<{ id: string; code: string; name: string }>;
  onCreated: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    component_type: '', domain_code: '', regulator_id: 'none',
    code: '', component_version: '1.0', name: '', purpose: '',
  });
  const create = useCreatePolicyComponent();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const ready = form.component_type && form.domain_code && form.code.trim() && form.name.trim()
    && form.component_version.trim();

  const submit = async () => {
    try {
      const r = await create.mutateAsync({
        component_type: form.component_type,
        domain_code: form.domain_code,
        regulator_id: form.regulator_id === 'none' ? null : form.regulator_id,
        code: form.code.trim(),
        component_version: form.component_version.trim(),
        name: form.name.trim(),
        purpose: form.purpose.trim() || null,
        content: {},
      });
      toast({ title: 'Draft created', description: 'Add the configuration entries, then submit it for approval.' });
      setOpen(false);
      onCreated(r.component_id);
    } catch (e) {
      toast({ title: 'Creation refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5" data-rbac="aml_supervision.manage_config">
          <Plus className="h-4 w-4" />New component version
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a policy component version</DialogTitle>
          <DialogDescription>
            The new version starts as a draft. Its entries are validated by the server and a second officer must
            approve it before it can be bound to a policy profile.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pc-type">Policy area</Label>
            <Select value={form.component_type} onValueChange={(v) => set('component_type', v)}>
              <SelectTrigger id="pc-type"><SelectValue placeholder="Select a policy area" /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.component_type} value={t.component_type}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pc-domain">Supervisory domain</Label>
              <Select value={form.domain_code} onValueChange={(v) => set('domain_code', v)}>
                <SelectTrigger id="pc-domain"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {domains.map((d) => <SelectItem key={d} value={d}>{humanize(d)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-regulator">Regulator</Label>
              <Select value={form.regulator_id} onValueChange={(v) => set('regulator_id', v)}>
                <SelectTrigger id="pc-regulator"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Platform-wide</SelectItem>
                  {regulators.map((r) => <SelectItem key={r.id} value={r.id}>{r.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pc-code">Code</Label>
              <Input id="pc-code" value={form.code} onChange={(e) => set('code', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-version">Version</Label>
              <Input id="pc-version" value={form.component_version} onChange={(e) => set('component_version', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-name">Name</Label>
            <Input id="pc-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-purpose">Purpose (optional)</Label>
            <Textarea id="pc-purpose" rows={2} value={form.purpose} onChange={(e) => set('purpose', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!ready || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
