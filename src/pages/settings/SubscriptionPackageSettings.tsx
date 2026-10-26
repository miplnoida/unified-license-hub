import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { SUBSCRIPTION_PACKAGE_QUERY_KEY, useSubscriptionPackage } from '@/hooks/useSubscriptionPackage';
import {
  PACKAGE_FEATURES, PACKAGE_INFO, PACKAGE_ORDER, featureIncluded, isFeatureEnabled,
  type FeatureOverrides, type PackageTier,
} from '@/lib/subscriptionPackages';
import { cn } from '@/lib/utils';

export default function SubscriptionPackageSettings() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const { activePackage, overrides, updatedAt, isLoading } = useSubscriptionPackage();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pkg, setPkg] = useState<PackageTier>(activePackage);
  const [ovr, setOvr] = useState<FeatureOverrides>(overrides);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPkg(activePackage); setOvr(overrides); }, [activePackage, overrides]);

  const dirty = useMemo(() => pkg !== activePackage || JSON.stringify(ovr) !== JSON.stringify(overrides), [pkg, ovr, activePackage, overrides]);

  const toggle = (key: string, value: boolean, defaultOn: boolean) => {
    setOvr((prev) => {
      const next = { ...prev };
      if (value === defaultOn) delete next[key]; else next[key] = value;
      return next;
    });
  };

  const save = async () => {
    if (reason.trim().length < 5) {
      toast({ title: 'Reason required', description: 'Enter a reason of at least 5 characters.', variant: 'destructive' });
      return;
    }
    const confirm = await Swal.fire({
      title: 'Apply package change?',
      text: 'Modules outside the selected package will be hidden from every user immediately.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Apply',
    });
    if (!confirm.isConfirmed) return;
    setSaving(true);
    const { error } = await (supabase as any).rpc('system_subscription_package_set', { _package: pkg, _overrides: ovr, _reason: reason.trim() });
    setSaving(false);
    if (error) { toast({ title: 'Could not save', description: error.message, variant: 'destructive' }); return; }
    setReason('');
    await qc.invalidateQueries({ queryKey: SUBSCRIPTION_PACKAGE_QUERY_KEY });
    toast({ title: 'Package updated', description: PACKAGE_INFO[pkg].name });
  };

  return (
    <DashboardLayout>
      <PageHeader title="Subscription Package" description="Choose the implemented package. Modules outside it are hidden from menus, Entity 360 and pages." />
      {!isSuperAdmin && <p className="text-sm text-muted-foreground mb-4">Only a super administrator can change the package.</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {PACKAGE_ORDER.map((tier) => (
          <Card key={tier} className={cn('cursor-pointer transition-colors', pkg === tier ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/50')}
            onClick={() => isSuperAdmin && setPkg(tier)}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{PACKAGE_INFO[tier].name}</CardTitle>
                {activePackage === tier && <Badge>Active</Badge>}
              </div>
              <CardDescription>{PACKAGE_INFO[tier].summary}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {PACKAGE_FEATURES.filter((f) => f.tier && featureIncluded(f, tier)).map((f) => (
                  <li key={f.key} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />{f.label}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Module availability</CardTitle>
          <CardDescription>Defaults follow the selected package. Switch a module on or off for pilots or add-ons.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {PACKAGE_FEATURES.map((f) => {
            const defaultOn = !f.tier || featureIncluded(f, pkg);
            const on = isFeatureEnabled(f, pkg, ovr);
            const overridden = f.tier && typeof ovr[f.key] === 'boolean';
            return (
              <div key={f.key} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {f.label}
                    {!f.tier && <Badge variant="secondary">Always on</Badge>}
                    {overridden && <Badge variant="outline">{on ? 'Add-on' : 'Switched off'}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                </div>
                <Switch checked={on} disabled={!f.tier || !isSuperAdmin} onCheckedChange={(v) => toggle(f.key, v, defaultOn)} aria-label={f.label} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {isSuperAdmin && (
        <Card className="mt-6">
          <CardContent className="pt-6 space-y-3">
            <Label htmlFor="pkg-reason">Reason for change</Label>
            <Textarea id="pkg-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Contract signed for Package B" />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{updatedAt ? `Last changed ${new Date(updatedAt).toLocaleString()}` : ''}</span>
              <Button onClick={save} disabled={!dirty || saving || isLoading}>{saving ? 'Saving…' : 'Apply package'}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
