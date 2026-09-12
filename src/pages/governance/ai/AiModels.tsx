/**
 * MC-08 — Governance → AI Governance → Models.
 *
 * The register of AI models the regulator has assessed. A released version is
 * immutable: a change of configuration is registered as a new version so that
 * historical AI activity keeps pointing at exactly what was used at the time.
 */
import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Lock, Plus } from 'lucide-react';
import { useAiModelSave, useAiModels, useAiUseCases, type ModelRow } from '@/hooks/useAiGovernance';
import { LifecycleActions } from '@/components/governance/ai/LifecycleActions';
import { TechnicalProvenance } from '@/components/governance/ai/TechnicalProvenance';
import { GovernanceHistory } from '@/components/governance/ai/GovernanceHistory';
import { LIFECYCLE_LABEL, LIFECYCLE_VARIANT, label } from '@/lib/aiGovernanceLabels';
import { formatDateTime } from '@/lib/datetime';
import { useCan } from '@/hooks/useCan';
import { useAuth } from '@/contexts/AuthContext';

const RELEASED = ['ACTIVE', 'SUSPENDED', 'RETIRED'];

interface FormState {
  id: string | null; provider: string; technicalIdentifier: string; modelKey: string;
  displayName: string; modelVersion: string; regulatoryPurpose: string; knownLimitations: string;
  governanceDisplayName: string; governanceVersionLabel: string;
}

const EMPTY: FormState = {
  id: null, provider: '', technicalIdentifier: '', modelKey: '',
  displayName: '', modelVersion: '', regulatoryPurpose: '', knownLimitations: '',
  governanceDisplayName: '', governanceVersionLabel: '',
};

export default function AiModels() {
  const { user } = useAuth();
  // Hooks must run unconditionally: evaluate both permissions, then combine.
  const canAuthorPrimary = useCan('ai_management', 'edit');
  const canAuthorAlternate = useCan('ai_management', 'approve');
  const canAuthor = canAuthorPrimary || canAuthorAlternate;
  const { data: models = [], isLoading } = useAiModels();
  const { data: useCases = [] } = useAiUseCases();
  const save = useAiModelSave();
  const [form, setForm] = useState<FormState | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const newVersionFrom = (m: ModelRow) => setForm({
    id: null, provider: m.provider ?? '', technicalIdentifier: m.technical_identifier ?? '',
    modelKey: m.model_key ?? '',
    displayName: m.registered_display_name ?? m.governance_display_name,
    modelVersion: '', regulatoryPurpose: m.regulatory_purpose ?? '',
    knownLimitations: m.known_limitations ?? '',
    governanceDisplayName: m.governance_display_name ?? '',
    governanceVersionLabel: '',
  });

  const approvedFor = (id: string) =>
    useCases.filter((u) => u.approved_model_id === id).map((u) => u.label);

  const canSubmit = !!form
    && form.provider.trim() && form.technicalIdentifier.trim() && form.displayName.trim()
    && form.governanceDisplayName.trim()
    && form.regulatoryPurpose.trim().length >= 10;

  const submit = async () => {
    if (!form || !canSubmit) return;
    await save.mutateAsync({
      id: form.id,
      provider: form.provider.trim(),
      technicalIdentifier: form.technicalIdentifier.trim(),
      modelKey: (form.modelKey || form.technicalIdentifier).trim(),
      displayName: form.displayName.trim(),
      modelVersion: form.modelVersion.trim() || null,
      regulatoryPurpose: form.regulatoryPurpose.trim(),
      knownLimitations: form.knownLimitations.trim() || null,
      governanceDisplayName: form.governanceDisplayName.trim() || null,
      governanceVersionLabel: form.governanceVersionLabel.trim() || null,
    });
    setForm(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="AI Models"
          description="Models the regulator has assessed and versioned, with their intended purpose, data-handling classification, external-data capability and approval status."
          actions={canAuthor ? (
            <Button data-rbac="ai_management.edit" size="sm" onClick={() => setForm({ ...EMPTY })}>
              <Plus className="mr-1 h-4 w-4" /> Register a model version
            </Button>
          ) : <Badge variant="outline">Read only</Badge>}
        />

        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription className="text-sm">
            A model version approved for production cannot be edited. If the configuration must change, register a
            new version. Historical AI activity continues to reference the exact version used when it was prepared.
          </AlertDescription>
        </Alert>

        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading model register…
          </p>
        )}

        {models.map((m) => {
          const released = RELEASED.includes(m.lifecycle_state);
          const authored = !!user?.id && m.created_by === user.id;
          return (
            <Card key={m.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{m.governance_display_name}</CardTitle>
                  <Badge variant={LIFECYCLE_VARIANT[m.lifecycle_state] ?? 'outline'}>
                    {label(LIFECYCLE_LABEL, m.lifecycle_state)}
                  </Badge>
                  {released && <Badge variant="outline"><Lock className="mr-1 h-3 w-3" /> Immutable</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <F l="Governance identity" v={m.governance_display_name} />
                  <F l="Governance version" v={m.governance_version_label ?? 'Not recorded'} mono />
                  <F l="Data handling" v={m.data_handling_class ?? 'Not recorded'} />
                  <F l="External data capability" v={m.external_data_capable ? 'Capable — not permitted for supervisory advice' : 'None'} />
                  <F l="Registered on" v={formatDateTime(m.created_at)} />
                  <F l="Approved on" v={m.approved_at ? formatDateTime(m.approved_at) : 'Not approved'} />
                  <F l="Retired on" v={m.retired_at ? formatDateTime(m.retired_at) : '—'} />
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intended regulatory purpose</p>
                  <p className="mt-1 text-sm">{m.regulatory_purpose ?? 'Not recorded'}</p>
                </div>
                {m.known_limitations && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Known limitations</p>
                    <p className="mt-1 text-sm">{m.known_limitations}</p>
                  </div>
                )}
                {m.suspension_reason && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason for suspension</p>
                    <p className="mt-1 text-sm">{m.suspension_reason}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Capabilities using this model</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {approvedFor(m.id).map((l) => <Badge key={l} variant="secondary">{l}</Badge>)}
                    {approvedFor(m.id).length === 0 && <p className="text-sm text-muted-foreground">None currently bound.</p>}
                  </div>
                </div>

                <TechnicalProvenance
                  available={m.technical_provenance_available}
                  fields={[
                    { label: 'Actual AI service / gateway', value: m.provider },
                    { label: 'Technical model identifier', value: m.technical_identifier, mono: true },
                    { label: 'Provider model version', value: m.model_version, mono: true },
                    { label: 'Registered technical name', value: m.registered_display_name },
                  ]}
                />

                <Separator />

                <div className="flex flex-wrap items-center gap-2">
                  <LifecycleActions
                    objectType="MODEL"
                    objectKey={m.id}
                    currentState={m.lifecycle_state}
                    authoredByCurrentUser={authored}
                  />
                  {canAuthor && m.technical_provenance_available && (
                    <Button data-rbac="ai_management.create" size="sm" variant="outline" onClick={() => newVersionFrom(m)}>Create new version</Button>
                  )}
                  {canAuthor && !released && m.technical_provenance_available && (
                    <Button data-rbac="ai_management.edit"
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({
                        id: m.id, provider: m.provider ?? '', technicalIdentifier: m.technical_identifier ?? '',
                        modelKey: m.model_key ?? '',
                        displayName: m.registered_display_name ?? m.governance_display_name,
                        modelVersion: m.model_version ?? '',
                        regulatoryPurpose: m.regulatory_purpose ?? '', knownLimitations: m.known_limitations ?? '',
                        governanceDisplayName: m.governance_display_name ?? '',
                        governanceVersionLabel: m.governance_version_label ?? '',
                      })}
                    >
                      Edit draft
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setOpenHistory(openHistory === m.id ? null : m.id)}>
                    {openHistory === m.id ? 'Hide history' : 'Governance history'}
                  </Button>
                </div>

                {openHistory === m.id && <GovernanceHistory objectType="MODEL" objectId={m.id} />}
              </CardContent>
            </Card>
          );
        })}

        {!isLoading && models.length === 0 && (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No model is registered.</CardContent></Card>
        )}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit draft model version' : 'Register a model version'}</DialogTitle>
            <DialogDescription>
              The version is saved as a draft. It cannot be used for any AI request until an authorised approver,
              who is not its author, approves it for production.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="m-gov-name">Governance identity shown to supervisors <span className="text-destructive">*</span></Label>
                  <Input id="m-gov-name" value={form.governanceDisplayName}
                    onChange={(e) => setForm({ ...form, governanceDisplayName: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="m-gov-version">Governance version label</Label>
                  <Input id="m-gov-version" value={form.governanceVersionLabel}
                    onChange={(e) => setForm({ ...form, governanceVersionLabel: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="m-provider">Actual AI service / gateway (restricted)</Label>
                  <Input id="m-provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="m-ident">Technical model identifier (restricted)</Label>
                  <Input id="m-ident" value={form.technicalIdentifier}
                    onChange={(e) => setForm({ ...form, technicalIdentifier: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="m-name">Registered technical name (restricted)</Label>
                  <Input id="m-name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="m-version">Provider model version (restricted)</Label>
                  <Input id="m-version" value={form.modelVersion} onChange={(e) => setForm({ ...form, modelVersion: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="m-purpose">Intended regulatory purpose <span className="text-destructive">*</span></Label>
                <Textarea id="m-purpose" rows={3} value={form.regulatoryPurpose}
                  onChange={(e) => setForm({ ...form, regulatoryPurpose: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="m-limits">Known limitations</Label>
                <Textarea id="m-limits" rows={3} value={form.knownLimitations}
                  onChange={(e) => setForm({ ...form, knownLimitations: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground">
                Fields marked restricted record the true technical provenance. They are retained in full and shown only
                to authorised technical administrators and auditors; supervisory and customer-facing screens show the
                governance identity.
              </p>
              <p className="text-xs text-muted-foreground">
                Data handling is fixed to internal regulatory facts and external data access is not permitted.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={save.isPending}>Cancel</Button>
            <Button data-rbac="ai_management.edit" onClick={submit} disabled={!canSubmit || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save as draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function F({ l, v, mono }: { l: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{l}</p>
      <p className={`mt-0.5 text-sm font-medium ${mono ? 'font-mono text-xs' : ''}`}>{v}</p>
    </div>
  );
}
