import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CheckCircle2, FileSignature, Send, ShieldCheck, Loader2 } from 'lucide-react';
import { INTERNAL_ROLES } from '@/types/platform';

type Certificate = {
  id: string;
  license_id: string;
  version: number;
  is_signed: boolean;
  signed_at: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  signature_fingerprint: string | null;
  dispatch_status: 'draft' | 'ready' | 'dispatched' | 'revoked';
  dispatched_at: string | null;
};

type SignatureRow = {
  id: string;
  signer_name: string;
  signer_title: string | null;
  signed_at: string;
  content_sha256: string;
  signing_key_fingerprint: string;
  reason: string | null;
};

interface Props {
  licenseId: string;
  onChanged?: () => void;
}

const SIGNING_ROLES = new Set([
  'super_admin', 'admin', 'supervisor', 'licensing_officer', 'analyst', 'legal_compliance',
]);
const DISPATCH_ROLES = new Set([
  'super_admin', 'admin', 'supervisor', 'licensing_officer',
]);

export function LicenseSignaturePanel({ licenseId, onChanged }: Props) {
  const { user } = useAuth();
  const [cert, setCert] = useState<Certificate | null>(null);
  const [sigs, setSigs] = useState<SignatureRow[]>([]);
  const [roles, setRoles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [signOpen, setSignOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);

  const canSign = [...roles].some(r => SIGNING_ROLES.has(r));
  const canDispatch = [...roles].some(r => DISPATCH_ROLES.has(r));

  async function load() {
    setLoading(true);
    const [{ data: certRow }, { data: rolesRows }] = await Promise.all([
      supabase
        .from('license_certificates')
        .select('id,license_id,version,is_signed,signed_at,signatory_name,signatory_title,signature_fingerprint,dispatch_status,dispatched_at')
        .eq('license_id', licenseId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      user
        ? supabase.from('user_roles').select('role').eq('user_id', user.id)
        : Promise.resolve({ data: [] as { role: string }[] }),
    ]);
    setCert((certRow as Certificate) || null);
    setRoles(new Set(((rolesRows as { role: string }[] | null) || []).map(r => r.role)));
    if (certRow?.id) {
      const { data: rows } = await supabase
        .from('license_certificate_signatures')
        .select('id,signer_name,signer_title,signed_at,content_sha256,signing_key_fingerprint,reason')
        .eq('certificate_id', certRow.id)
        .order('signed_at', { ascending: false });
      setSigs((rows as SignatureRow[]) || []);
    } else {
      setSigs([]);
    }
    setLoading(false);
  }

  useEffect(() => { load();   }, [licenseId, user?.id]);

  async function describeFnError(
    error: { message?: string; context?: unknown } | null,
    data: unknown,
    fallback: string,
  ): Promise<string> {
    const raw = (data as { error?: string } | null)?.error;
    let code = raw;
    // supabase-js surfaces non-2xx as an error with the Response in `context`.
    const res = (error as { context?: Response } | null)?.context;
    if (!code && res && typeof (res as Response).json === 'function') {
      try {
        const body = await (res as Response).clone().json();
        code = body?.error;
      } catch { /* body not JSON */ }
    }
    const map: Record<string, string> = {
      Forbidden: 'You do not have permission to manage licence certificates.',
      Unauthorized: 'Your session has expired. Please sign in again.',
      already_dispatched: 'This certificate has already been dispatched.',
      not_ready_for_dispatch: 'This certificate must be signed before it can be dispatched.',
      certificate_not_found: 'No certificate exists for this licence yet.',
      reason_min_10_chars: 'Reason must be at least 10 characters.',
      server_misconfigured: 'Certificate signing is not configured on the server.',
      certificate_download_failed: 'The certificate file could not be read from storage.',
    };
    if (code && map[code]) return map[code];
    if (code) return code.replace(/_/g, ' ');
    return error?.message ? fallback : fallback;
  }

  async function handleSign() {
    if (reason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters.');
      return;
    }
    setWorking(true);
    const { data, error } = await supabase.functions.invoke('sign-license-certificate', {
      body: { license_id: licenseId, reason: reason.trim() },
    });
    setWorking(false);
    if (error || (data as any)?.error) {
      toast.error(await describeFnError(error, data, 'Signing failed'));
      return;
    }
    toast.success('Certificate signed. Ready for dispatch.');
    setSignOpen(false);
    setReason('');
    onChanged?.();
    load();
  }

  async function handleDispatch() {
    if (!cert) return;
    setWorking(true);
    const { data, error } = await supabase.functions.invoke('dispatch-license-certificate', {
      body: { certificate_id: cert.id, note: note.trim() || null },
    });
    setWorking(false);
    if (error || (data as any)?.error) {
      toast.error(await describeFnError(error, data, 'Dispatch failed'));
      return;
    }
    toast.success('Certificate dispatched to licensee.');
    setDispatchOpen(false);
    setNote('');
    onChanged?.();
    load();
  }

  async function handleGenerate() {
    setWorking(true);
    const { data, error } = await supabase.functions.invoke('generate-license-certificate', {
      body: { mode: 'generate', license_id: licenseId },
    });
    setWorking(false);
    if (error || (data as any)?.error) {
      toast.error(await describeFnError(error, data, 'Certificate generation failed'));
      return;
    }
    toast.success('Certificate generated.');
    onChanged?.();
    load();
  }



  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Certificate Signing</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    );
  }

  if (!cert) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Certificate Signing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This licence has no certificate document yet. Generate version 1 to enable signing and dispatch.
          </p>
          {canSign && (
            <Button data-rbac="license_management.edit" size="sm" onClick={handleGenerate} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSignature className="h-4 w-4 mr-1" />}
              Generate Certificate
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }


  const statusColor: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    ready: 'bg-warning/15 text-warning-foreground border border-warning/30',
    dispatched: 'bg-success/15 text-success-foreground border border-success/30',
    revoked: 'bg-destructive/15 text-destructive border border-destructive/30',
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Certificate Signing & Dispatch
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">Version {cert.version}</span>
            <Badge className={statusColor[cert.dispatch_status] || ''} variant="outline">
              {cert.dispatch_status.toUpperCase()}
            </Badge>
            {cert.is_signed && cert.signed_at && (
              <span className="text-muted-foreground">
                Signed {new Date(cert.signed_at).toLocaleString()} by {cert.signatory_name || 'signer'}
              </span>
            )}
            {cert.dispatched_at && (
              <span className="text-muted-foreground">
                Dispatched {new Date(cert.dispatched_at).toLocaleString()}
              </span>
            )}
          </div>

          {cert.signature_fingerprint && (
            <div className="text-xs text-muted-foreground font-mono break-all">
              fingerprint: {cert.signature_fingerprint}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {canSign && cert.dispatch_status !== 'dispatched' && (
              <Button size="sm" onClick={() => setSignOpen(true)}>
                <FileSignature className="h-4 w-4 mr-1" />
                {cert.is_signed ? 'Re-sign (new version)' : 'Sign Certificate'}
              </Button>
            )}
            {canDispatch && cert.dispatch_status === 'ready' && (
              <Button data-rbac="license_management.approve" size="sm" variant="secondary" onClick={() => setDispatchOpen(true)}>
                <Send className="h-4 w-4 mr-1" />
                Dispatch to Licensee
              </Button>
            )}
            {cert.dispatch_status === 'dispatched' && (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> Dispatched
              </span>
            )}
          </div>

          {sigs.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Signature Ledger</div>
              <div className="divide-y divide-border rounded border">
                {sigs.map(s => (
                  <div key={s.id} className="p-3 text-xs space-y-1">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium">{s.signer_name}{s.signer_title ? ` — ${s.signer_title}` : ''}</span>
                      <span className="text-muted-foreground">{new Date(s.signed_at).toLocaleString()}</span>
                    </div>
                    {s.reason && <div className="text-muted-foreground">Reason: {s.reason}</div>}
                    <div className="font-mono text-[10px] text-muted-foreground break-all">
                      sha256={s.content_sha256} · key={s.signing_key_fingerprint}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign license certificate</DialogTitle>
            <DialogDescription>
              Your signature is recorded in the tamper-evident ledger. Provide a reason for signing (minimum 10 characters).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sign-reason">Reason</Label>
            <Textarea
              id="sign-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Final approval by Licensing Committee, minutes ref …"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(false)} disabled={working}>Cancel</Button>
            <Button data-rbac="license_management.approve" onClick={handleSign} disabled={working || reason.trim().length < 10}>
              {working ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSignature className="h-4 w-4 mr-1" />}
              Sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispatch certificate to licensee</DialogTitle>
            <DialogDescription>
              This marks the certificate as delivered and locks the version. Add an optional dispatch note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dispatch-note">Note (optional)</Label>
            <Textarea id="dispatch-note" value={note} onChange={e => setNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchOpen(false)} disabled={working}>Cancel</Button>
            <Button data-rbac="license_management.approve" onClick={handleDispatch} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default LicenseSignaturePanel;
