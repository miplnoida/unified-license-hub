/**
 * Response Semantics — version-owned profiles, with governed authoring.
 *
 * Ownership is shown explicitly: a profile belongs to this methodology version.
 * Authoring is offered only when the server allows it, retirement is refused
 * while an active question still uses the profile, and a frozen version stays
 * read only.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useRetireMethodologySemanticProfile,
  useSupervisoryMethodologySemantics,
  useSupervisoryMethodologyStudioCapabilities,
  type MethodologySemanticProfile,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { EmptyPanel, ErrorPanel, humanize } from '../labels';
import { SemanticProfileEditorDialog } from '../studio/SemanticProfileEditorDialog';
import { AuthoringHeader } from '../studio/StudioKit';

function ResponseMeaning({ meaning }: { meaning: Record<string, unknown> | null }) {
  const entries = Object.entries(meaning ?? {});
  if (!entries.length) return <p className="text-sm text-muted-foreground">No response meaning is recorded.</p>;
  return (
    <ul className="space-y-1.5">
      {entries.map(([k, v]) => (
        <li key={k} className="flex flex-wrap items-baseline gap-2 text-sm">
          <Badge variant="secondary" className="font-mono text-[11px]">{k}</Badge>
          <span className="text-foreground">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
        </li>
      ))}
    </ul>
  );
}

function RetireProfileDialog({
  methodologyId, code, open, onClose,
}: { methodologyId: string; code: string | null; open: boolean; onClose: () => void }) {
  const [rationale, setRationale] = useState('');
  const retire = useRetireMethodologySemanticProfile();

  const submit = async () => {
    if (!code) return;
    try {
      await retire.mutateAsync({ methodologyId, semanticCode: code, rationale: rationale.trim() });
      toast.success(`${code} retired from this draft version`);
      setRationale('');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The profile could not be retired');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Retire {code}</DialogTitle>
          <DialogDescription>
            Retirement is refused while an active question still uses this profile. Reassign those questions first.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="sem-retire-rationale">Reason (at least 10 characters)</Label>
          <Input id="sem-retire-rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={retire.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={submit} data-rbac="aml_supervision.manage_config"
                  disabled={retire.isPending || rationale.trim().length < 10}>
            {retire.isPending ? 'Retiring…' : 'Retire profile'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SemanticsTab({ methodologyId }: { methodologyId: string }) {
  const { data, isLoading, error } = useSupervisoryMethodologySemantics(methodologyId);
  const caps = useSupervisoryMethodologyStudioCapabilities(methodologyId);
  const canAuthor = caps.data?.can_author_semantics?.allowed === true;
  const [editing, setEditing] = useState<{ open: boolean; profile: MethodologySemanticProfile | null }>({ open: false, profile: null });
  const [retiring, setRetiring] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorPanel error={error} />;

  const header = (
    <AuthoringHeader
      capability={caps.data?.can_author_semantics}
      label="Add profile"
      onAdd={() => setEditing({ open: true, profile: null })}
      note="Response meaning belongs to this version. Editing it here changes this draft only."
    />
  );

  const dialogs = (
    <>
      <SemanticProfileEditorDialog
        methodologyId={methodologyId}
        open={editing.open}
        existing={editing.profile}
        onClose={() => setEditing({ open: false, profile: null })}
      />
      <RetireProfileDialog
        methodologyId={methodologyId}
        code={retiring}
        open={!!retiring}
        onClose={() => setRetiring(null)}
      />
    </>
  );

  if (!data?.length) {
    return (
      <div className="space-y-3">
        {header}
        <EmptyPanel title="No response semantics profile is defined for this version." />
        {dialogs}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}
      <p className="text-sm text-muted-foreground">
        {data.length} version-owned response semantics {data.length === 1 ? 'profile' : 'profiles'}: each one belongs to this methodology version.
      </p>
      {data.map((p) => (
        <Card key={p.id}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                <span className="font-mono">{p.semantic_code}</span>
                {p.label ? <span className="ml-2 font-normal text-muted-foreground">{p.label}</span> : null}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                {p.profile_version ? <Badge variant="outline">Profile version {p.profile_version}</Badge> : null}
                <Badge variant="outline">{p.question_count ?? 0} questions</Badge>
                {p.owner ? <Badge variant="secondary">Owned by {p.owner.code} v{p.owner.version}</Badge> : null}
              </div>
            </div>
            {p.description ? <p className="text-sm text-muted-foreground">{p.description}</p> : null}
            {canAuthor ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setEditing({ open: true, profile: p })}
                        data-rbac="aml_supervision.manage_config">Edit profile</Button>
                <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={() => setRetiring(p.semantic_code)}
                        data-rbac="aml_supervision.manage_config">Retire profile</Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Response meaning</p>
            <ResponseMeaning meaning={p.response_meaning} />
            {p.owner ? (
              <p className="mt-3 text-xs text-muted-foreground">Origin: {humanize(p.owner.origin_label)}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
      {dialogs}
    </div>
  );
}
