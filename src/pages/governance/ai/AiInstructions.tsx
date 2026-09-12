/**
 * MC-08 — Governance → AI Governance → Instructions.
 *
 * Instruction versions are regulatory configuration, not a prompt playground.
 * A released version is read-only for ever, so historical AI activity keeps
 * referencing exactly the instruction that produced it. Changes are new versions.
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, Loader2, Lock, Plus } from 'lucide-react';
import {
  useAiInstructionSave, useAiInstructions, useAiUseCases, type InstructionRow,
} from '@/hooks/useAiGovernance';
import { LifecycleActions } from '@/components/governance/ai/LifecycleActions';
import { GovernanceHistory } from '@/components/governance/ai/GovernanceHistory';
import { LIFECYCLE_LABEL, LIFECYCLE_VARIANT, label } from '@/lib/aiGovernanceLabels';
import { formatDateTime } from '@/lib/datetime';
import { useCan } from '@/hooks/useCan';
import { useAuth } from '@/contexts/AuthContext';

const RELEASED = ['ACTIVE', 'SUSPENDED', 'RETIRED'];

interface FormState {
  id: string | null; templateCode: string; version: string; title: string; purpose: string;
  useCaseCode: string; instructionBody: string;
}

const EMPTY: FormState = {
  id: null, templateCode: '', version: '', title: '', purpose: '', useCaseCode: 'none', instructionBody: '',
};

export default function AiInstructions() {
  const { user } = useAuth();
  // Hooks must run unconditionally: evaluate both permissions, then combine.
  const canAuthorPrimary = useCan('ai_management', 'edit');
  const canAuthorAlternate = useCan('ai_management', 'approve');
  const canAuthor = canAuthorPrimary || canAuthorAlternate;
  const { data: instructions = [], isLoading } = useAiInstructions();
  const { data: useCases = [] } = useAiUseCases();
  const save = useAiInstructionSave();
  const [form, setForm] = useState<FormState | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const nextVersionFrom = (i: InstructionRow) => setForm({
    id: null, templateCode: i.template_code, version: '', title: i.title, purpose: i.purpose ?? '',
    useCaseCode: i.use_case_code ?? 'none', instructionBody: i.instruction_body ?? '',
  });

  const canSubmit = !!form && form.templateCode.trim() && form.version.trim()
    && form.title.trim() && form.purpose.trim().length >= 10;

  const submit = async () => {
    if (!form || !canSubmit) return;
    await save.mutateAsync({
      id: form.id,
      templateCode: form.templateCode.trim(),
      version: form.version.trim(),
      title: form.title.trim(),
      purpose: form.purpose.trim(),
      useCaseCode: form.useCaseCode === 'none' ? null : form.useCaseCode,
      instructionBody: form.instructionBody.trim() || null,
    });
    setForm(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="AI Instructions"
          description="The instruction versions the regulator has released, including the permitted fact scope, required caveats, citation expectations, prohibited behaviours and confidence expectations."
          actions={canAuthor ? (
            <Button data-rbac="ai_management.edit" size="sm" onClick={() => setForm({ ...EMPTY })}>
              <Plus className="mr-1 h-4 w-4" /> Register an instruction version
            </Button>
          ) : <Badge variant="outline">Read only</Badge>}
        />

        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription className="text-sm">
            A released instruction version is permanently read-only. Any change is registered as a new version, and
            every historical AI activity continues to reference the exact version in force when it was prepared.
            The instruction is held and applied on the server; it is never supplied by a browser.
          </AlertDescription>
        </Alert>

        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading instruction register…
          </p>
        )}

        {instructions.map((i) => {
          const released = RELEASED.includes(i.lifecycle_state);
          const authored = !!user?.id && i.created_by === user.id;
          const boundUseCase = useCases.find((u) => u.code === i.use_case_code);
          return (
            <Card key={i.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{i.title}</CardTitle>
                  <Badge variant="outline" className="font-mono text-xs">{i.template_code} {i.version}</Badge>
                  <Badge variant={LIFECYCLE_VARIANT[i.lifecycle_state] ?? 'outline'}>
                    {label(LIFECYCLE_LABEL, i.lifecycle_state)}
                  </Badge>
                  {released && <Badge variant="outline"><Lock className="mr-1 h-3 w-3" /> Immutable</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <F l="Associated capability" v={boundUseCase?.label ?? i.use_case_code ?? 'Not associated'} />
                  <F l="Permitted fact scope" v={i.allowed_fact_scope ?? 'Not recorded'} mono />
                  <F l="Released on" v={i.released_at ? formatDateTime(i.released_at) : 'Not released'} />
                  <F l="Registered on" v={formatDateTime(i.created_at)} />
                  <F l="Citation expectation" v={i.citation_expectation ?? 'Not recorded'} />
                  <F l="Confidence expectation" v={i.confidence_expectation ?? 'Not recorded'} />
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Purpose</p>
                  <p className="mt-1 text-sm">{i.purpose ?? 'Not recorded'}</p>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required caveats</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                      {(i.required_caveats ?? []).map((c, n) => <li key={n}>{c}</li>)}
                      {(i.required_caveats ?? []).length === 0 && <li className="list-none text-muted-foreground">Not recorded.</li>}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prohibited behaviours</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                      {(i.prohibited_behaviours ?? []).map((c, n) => <li key={n}>{c}</li>)}
                      {(i.prohibited_behaviours ?? []).length === 0 && <li className="list-none text-muted-foreground">Not recorded.</li>}
                    </ul>
                  </div>
                </div>

                {i.suspension_reason && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason for suspension</p>
                    <p className="mt-1 text-sm">{i.suspension_reason}</p>
                  </div>
                )}

                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      Full instruction as held on the server <ChevronDown className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
{i.instruction_body ?? 'Not recorded.'}
                    </pre>
                    {released && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        This text is read-only. It is the exact instruction referenced by AI activity prepared under this version.
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                <div className="flex flex-wrap items-center gap-2">
                  <LifecycleActions
                    objectType="INSTRUCTION"
                    objectKey={i.id}
                    currentState={i.lifecycle_state}
                    authoredByCurrentUser={authored}
                  />
                  {canAuthor && (
                    <Button data-rbac="ai_management.create" size="sm" variant="outline" onClick={() => nextVersionFrom(i)}>Create new version</Button>
                  )}
                  {canAuthor && !released && (
                    <Button data-rbac="ai_management.edit"
                      size="sm" variant="ghost"
                      onClick={() => setForm({
                        id: i.id, templateCode: i.template_code, version: i.version, title: i.title,
                        purpose: i.purpose ?? '', useCaseCode: i.use_case_code ?? 'none',
                        instructionBody: i.instruction_body ?? '',
                      })}
                    >
                      Edit draft
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setOpenHistory(openHistory === i.id ? null : i.id)}>
                    {openHistory === i.id ? 'Hide history' : 'Governance history'}
                  </Button>
                </div>

                {openHistory === i.id && (
                  <GovernanceHistory objectType="INSTRUCTION" objectCode={`${i.template_code} ${i.version}`} />
                )}
              </CardContent>
            </Card>
          );
        })}

        {!isLoading && instructions.length === 0 && (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No instruction version is registered.</CardContent></Card>
        )}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit draft instruction version' : 'Register an instruction version'}</DialogTitle>
            <DialogDescription>
              Saved as a draft. It cannot be used for any AI request until an authorised approver, who is not its
              author, releases it. Once released it can never be edited.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="i-code">Template code</Label>
                  <Input id="i-code" value={form.templateCode} onChange={(e) => setForm({ ...form, templateCode: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="i-version">Version</Label>
                  <Input id="i-version" placeholder="v2" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="i-usecase">Associated capability</Label>
                  <Select value={form.useCaseCode} onValueChange={(v) => setForm({ ...form, useCaseCode: v })}>
                    <SelectTrigger id="i-usecase"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not associated</SelectItem>
                      {useCases.map((u) => <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="i-title">Title</Label>
                <Input id="i-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="i-purpose">Purpose <span className="text-destructive">*</span></Label>
                <Textarea id="i-purpose" rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="i-body">Instruction text</Label>
                <Textarea id="i-body" rows={10} className="font-mono text-xs" value={form.instructionBody}
                  onChange={(e) => setForm({ ...form, instructionBody: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">
                  This text is held and applied on the server. It is never sent from a browser at generation time.
                </p>
              </div>
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
