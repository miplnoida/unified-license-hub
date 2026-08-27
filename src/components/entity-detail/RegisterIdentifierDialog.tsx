/**
 * Governed "Register identifier" dialog for the Entity 360 Identity section.
 *
 * Writes go through the `entity_identifier_register` SECURITY DEFINER RPC,
 * which enforces internal-staff + section permission gating, duplicate
 * rejection, normalisation and audit logging server-side.
 */
import { useState } from 'react';
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
}

export interface RegisterIdentifierDialogProps {
  entityId: string;
}

export function RegisterIdentifierDialog({ entityId }: RegisterIdentifierDialogProps) {
  const [open, setOpen] = useState(false);
  const [typeKey, setTypeKey] = useState<string>('');
  const [value, setValue] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: types } = useQuery({
    queryKey: ['entity-identifier-types'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('entity_identifier_types')
        .select('id, key, label')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data ?? []) as IdentifierType[];
    },
    staleTime: 300_000,
  });

  const canSubmit = !!typeKey && value.trim().length > 0 && !submitting;

  const reset = () => {
    setTypeKey('');
    setValue('');
    setIsPrimary(false);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc('entity_identifier_register', {
        _entity_id: entityId,
        _identifier_type_key: typeKey,
        _identifier_value: value.trim(),
        _is_primary: isPrimary,
      });
      if (error) throw new Error(error.message);
      toast({ title: 'Identifier registered' });
      setOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['entity360', 'section', entityId, 'identity'] });
    } catch (e) {
      const msg = (e as Error).message || 'Failed to register identifier';
      toast({
        title: 'Could not register identifier',
        description: msg.includes('duplicate_active_identifier_for_type')
          ? 'This entity already has an active identifier of that type.'
          : msg,
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
            <Select value={typeKey} onValueChange={setTypeKey}>
              <SelectTrigger id="identifier-type">
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {(types ?? []).map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="identifier-value">Identifier value</Label>
            <Input
              id="identifier-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. CRN-2024-00123"
            />
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
