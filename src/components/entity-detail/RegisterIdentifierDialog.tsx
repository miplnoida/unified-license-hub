/**
 * Governed "Register identifier" dialog for the Entity 360 Identity section.
 *
 * Writes go through the `entity_identifier_register` SECURITY DEFINER RPC,
 * which enforces internal-staff + section permission gating, duplicate
 * rejection, normalisation and audit logging server-side.
 *
 * The form is scope-aware: the governed identifier-type catalogue declares a
 * uniqueness scope per type, and the database requires the matching context
 * (jurisdiction for JURISDICTION scope, issuer for ISSUER scope). REGULATOR
 * scope is derived server-side from the entity's lead regulator.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';

interface IdentifierType {
  id: string;
  key: string;
  label: string;
  description: string | null;
  issuer: string | null;
  uniqueness_scope: string | null;
  validation_regex: string | null;
}

interface Country {
  id: string;
  name: string;
}

export interface RegisterIdentifierDialogProps {
  entityId: string;
}

/** Plain-English mapping for the governed server-side validation errors. */
function friendlyError(message: string): string {
  if (message.includes('duplicate_active_identifier_for_type')) {
    return 'This entity already has an active identifier of that type.';
  }
  if (message.includes('requires a jurisdiction')) {
    return 'This identifier type is registry-issued — select the jurisdiction that issued it.';
  }
  if (message.includes('requires an issuer')) {
    return 'This identifier type needs the issuing body to be recorded.';
  }
  if (message.includes('requires a regulator')) {
    return 'This entity has no lead regulator on file, so a regulator-scoped identifier cannot be recorded yet.';
  }
  if (message.includes('normalises to an empty string')) {
    return 'The value contains no usable characters for this identifier type.';
  }
  if (message.includes('is retired')) {
    return 'That identifier type has been retired and can no longer be used.';
  }
  if (message.includes('forbidden')) {
    return 'Your role does not permit registering identity records for this entity.';
  }
  return message || 'Failed to register identifier';
}

export function RegisterIdentifierDialog({ entityId }: RegisterIdentifierDialogProps) {
  const [open, setOpen] = useState(false);
  const [typeKey, setTypeKey] = useState<string>('');
  const [value, setValue] = useState('');
  const [jurisdictionId, setJurisdictionId] = useState<string>('');
  const [issuerKey, setIssuerKey] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: types } = useQuery({
    queryKey: ['entity-identifier-types', 'scoped'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('entity_identifier_types')
        .select('id, key, label, description, issuer, uniqueness_scope, validation_regex')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data ?? []) as IdentifierType[];
    },
    staleTime: 300_000,
  });

  const selected = useMemo(
    () => (types ?? []).find((t) => t.key === typeKey),
    [types, typeKey],
  );
  const scope = selected?.uniqueness_scope ?? null;
  const needsJurisdiction = scope === 'JURISDICTION';
  const needsIssuer = scope === 'ISSUER';

  const { data: countries } = useQuery({
    queryKey: ['identifier-jurisdictions'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('countries')
        .select('id, name')
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as Country[];
    },
    enabled: needsJurisdiction,
    staleTime: 300_000,
  });

  const formatError = useMemo(() => {
    if (!selected?.validation_regex || !value.trim()) return null;
    try {
      return new RegExp(selected.validation_regex).test(value.trim())
        ? null
        : `Does not match the expected format for ${selected.label}`;
    } catch {
      return null;
    }
  }, [selected, value]);

  const hint = useMemo(() => {
    if (!selected) return null;
    const parts: string[] = [];
    if (selected.issuer) parts.push(`Issued by ${selected.issuer}`);
    if (scope === 'GLOBAL') parts.push('globally unique');
    if (scope === 'JURISDICTION') parts.push('unique within the issuing jurisdiction');
    if (scope === 'REGULATOR') parts.push("unique within the entity's regulator");
    return parts.length ? parts.join(' · ') : null;
  }, [selected, scope]);

  const canSubmit =
    !!typeKey &&
    value.trim().length > 0 &&
    !formatError &&
    (!needsJurisdiction || !!jurisdictionId) &&
    (!needsIssuer || issuerKey.trim().length > 0) &&
    !submitting;

  const reset = () => {
    setTypeKey('');
    setValue('');
    setJurisdictionId('');
    setIssuerKey('');
    setIsPrimary(false);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc('entity_identifier_register', {
        _entity_id: entityId,
        _identifier_type_key: typeKey,
        _identifier_value: value.trim(),
        _jurisdiction_id: needsJurisdiction ? jurisdictionId : null,
        _issuer_key: needsIssuer ? issuerKey.trim() : null,
        _is_primary: isPrimary,
      });
      if (error) throw new Error(error.message);
      toast({ title: 'Identifier registered' });
      setOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['entity360', 'section', entityId, 'identity'] });
    } catch (e) {
      toast({
        title: 'Could not register identifier',
        description: friendlyError((e as Error).message ?? ''),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-4 w-4" /> Add identifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register identifier</DialogTitle>
          <DialogDescription>
            Record an official identifier for this entity. The verification state is set from the
            entity's current identity status and the action is audit-logged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="identifier-type">Identifier type</Label>
            <Select
              value={typeKey}
              onValueChange={(v) => {
                setTypeKey(v);
                setJurisdictionId('');
                setIssuerKey('');
              }}
            >
              <SelectTrigger id="identifier-type">
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {(types ?? []).map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected?.description && (
              <p className="text-xs text-muted-foreground">{selected.description}</p>
            )}
          </div>

          {needsJurisdiction && (
            <div className="space-y-1.5">
              <Label htmlFor="identifier-jurisdiction">Issuing jurisdiction</Label>
              <Select value={jurisdictionId} onValueChange={setJurisdictionId}>
                <SelectTrigger id="identifier-jurisdiction">
                  <SelectValue placeholder="Select the issuing jurisdiction" />
                </SelectTrigger>
                <SelectContent>
                  {(countries ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This identifier type is registry-issued, so the jurisdiction is required.
              </p>
            </div>
          )}

          {needsIssuer && (
            <div className="space-y-1.5">
              <Label htmlFor="identifier-issuer">Issuing body</Label>
              <Input
                id="identifier-issuer"
                value={issuerKey}
                onChange={(e) => setIssuerKey(e.target.value)}
                placeholder={selected?.issuer ?? 'e.g. Corporate Registry'}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="identifier-value">Identifier value</Label>
            <Input
              id="identifier-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. CRN-2024-00123"
              aria-invalid={!!formatError}
            />
            {formatError ? (
              <p className="text-xs text-destructive">{formatError}</p>
            ) : hint ? (
              <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="identifier-primary"
              checked={isPrimary}
              onCheckedChange={(c) => setIsPrimary(c === true)}
            />
            <Label htmlFor="identifier-primary" className="font-normal">
              Primary identifier for this entity
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RegisterIdentifierDialog;
