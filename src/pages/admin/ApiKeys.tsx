import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Copy, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  revoked: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  created_at: string;
};

export default function ApiKeys() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api_keys'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('api_keys') as any)
        .select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as ApiKey[];
    },
  });

  const { data: usage = [] } = useQuery({
    queryKey: ['api_key_usage_recent'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('api_key_usage') as any)
        .select('*').order('created_at', { ascending: false }).limit(25);
      if (error) throw error;
      return data as any[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Name is required');
      const { data, error } = await supabase.functions.invoke('manage-api-key', {
        body: { action: 'create', name, expires_at: expiresAt || null },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { secret: string };
    },
    onSuccess: (data) => {
      setIssuedKey(data.secret);
      setName(''); setExpiresAt('');
      qc.invalidateQueries({ queryKey: ['api_keys'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('manage-api-key', {
        body: { action: 'revoke', id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      toast.success('Key revoked');
      qc.invalidateQueries({ queryKey: ['api_keys'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const projectRef = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const apiBase = projectRef ? `https://${projectRef}.supabase.co/functions/v1/developer-api` : '/functions/v1/developer-api';

  return (
    <DashboardLayout>
      <PageHeader
        title="Developer API Keys"
        description="Issue read-only API keys for external systems to consume the public registry."
        actions={<Button data-rbac="settings.edit" onClick={() => { setIssuedKey(null); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Issue key</Button>}
      />

      <Card>
        <CardHeader><CardTitle>Base URL & endpoints</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm font-mono">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Base:</span>
            <code>{apiBase}</code>
            <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(apiBase); toast.success('Copied'); }}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <div><code>GET /licensees?limit=50</code> — active licensees</div>
          <div><code>GET /licensees/&#123;id&#125;</code> — single licensee</div>
          <div><code>GET /enforcement?limit=50</code> — public enforcement decisions</div>
          <div><code>GET /health</code> — connectivity check</div>
          <div className="text-muted-foreground pt-2">
            Send your key in the <code>X-API-Key</code> header.
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Keys</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map(k => (
                  <TableRow key={k.id}>
                    <TableCell>{k.name}</TableCell>
                    <TableCell className="font-mono text-xs">{k.key_prefix}.****</TableCell>
                    <TableCell>
                      {k.revoked
                        ? <Badge variant="destructive">Revoked</Badge>
                        : k.expires_at && new Date(k.expires_at) < new Date()
                          ? <Badge variant="secondary">Expired</Badge>
                          : <Badge variant="default">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      {!k.revoked && (
                        <Button data-rbac="user_management.edit" size="sm" variant="ghost" onClick={() => revoke.mutate(k.id)}>
                          <ShieldOff className="h-3 w-3 mr-1" />Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {keys.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No keys issued</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Recent API calls</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="text-xs">{new Date(u.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{u.path}</TableCell>
                  <TableCell>
                    <Badge variant={u.status_code < 400 ? 'default' : 'destructive'}>{u.status_code}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{u.latency_ms ?? '—'} ms</TableCell>
                  <TableCell className="text-xs">{u.ip || '—'}</TableCell>
                </TableRow>
              ))}
              {usage.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No calls yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{issuedKey ? 'API key issued' : 'Issue new API key'}</DialogTitle></DialogHeader>
          {issuedKey ? (
            <div className="space-y-3">
              <Alert>
                <AlertTitle>Copy this key now</AlertTitle>
                <AlertDescription>
                  It will not be shown again. Store it in your integration's secret manager.
                </AlertDescription>
              </Alert>
              <div className="p-3 bg-muted rounded font-mono text-xs break-all">{issuedKey}</div>
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(issuedKey); toast.success('Copied'); }}>
                <Copy className="h-3 w-3 mr-2" />Copy
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ministry of Finance portal" />
              </div>
              <div>
                <Label>Expires (optional)</Label>
                <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            {issuedKey
              ? <Button onClick={() => { setIssuedKey(null); setOpen(false); }}>Done</Button>
              : <Button data-rbac="settings.edit" onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Issue key
                </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
