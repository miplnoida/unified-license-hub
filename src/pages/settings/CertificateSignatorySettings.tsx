import { useEffect, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, Save, Upload, Trash2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { siteSettingSave } from '@/lib/configWriter';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const SETTINGS_KEY = 'license_certificate_signatory';
const BUCKET = 'certificate-assets';
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg'];

type SignatoryValue = {
  name: string;
  title: string;
  signature_image_path: string | null;
  seal_image_path: string | null;
  is_active: boolean;
};

const EMPTY: SignatoryValue = {
  name: '',
  title: '',
  signature_image_path: null,
  seal_image_path: null,
  is_active: true,
};

function fmtBytes(n: number) {
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function CertificateSignatorySettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SignatoryValue>(EMPTY);
  const [original, setOriginal] = useState<SignatoryValue>(EMPTY);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [sealUrl, setSealUrl] = useState<string | null>(null);
  const [sigError, setSigError] = useState<string | null>(null);
  const [sealError, setSealError] = useState<string | null>(null);
  const [uploadingSig, setUploadingSig] = useState(false);
  const [uploadingSeal, setUploadingSeal] = useState(false);
  const sigInput = useRef<HTMLInputElement>(null);
  const sealInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('site_settings' as any)
        .select('value')
        .eq('key', SETTINGS_KEY)
        .maybeSingle();
      const v = ((data as any)?.value || {}) as Partial<SignatoryValue>;
      const merged: SignatoryValue = {
        name: v.name || '',
        title: v.title || '',
        signature_image_path: v.signature_image_path || null,
        seal_image_path: v.seal_image_path || null,
        is_active: v.is_active ?? true,
      };
      setForm(merged);
      setOriginal(merged);
      await Promise.all([
        refreshPreview(merged.signature_image_path, setSigUrl),
        refreshPreview(merged.seal_image_path, setSealUrl),
      ]);
      setLoading(false);
    })();
  }, []);

  async function refreshPreview(path: string | null, setter: (u: string | null) => void) {
    if (!path) { setter(null); return; }
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    setter(data?.signedUrl || null);
  }

  async function uploadImage(
    file: File,
    kind: 'signature' | 'seal',
  ): Promise<string | null> {
    const setErr = kind === 'signature' ? setSigError : setSealError;
    setErr(null);

    if (!ALLOWED.includes(file.type)) {
      setErr(`Unsupported file type. Please upload a PNG or JPG image.`);
      return null;
    }
    if (file.size > MAX_BYTES) {
      setErr(`This image is ${fmtBytes(file.size)}. Please upload an image under 2 MB.`);
      return null;
    }

    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${kind}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    if (error) {
      setErr(error.message || 'Upload failed');
      return null;
    }
    return path;
  }

  async function handleSigFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingSig(true);
    const path = await uploadImage(f, 'signature');
    if (path) {
      setForm((p) => ({ ...p, signature_image_path: path }));
      await refreshPreview(path, setSigUrl);
    }
    setUploadingSig(false);
    if (sigInput.current) sigInput.current.value = '';
  }

  async function handleSealFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingSeal(true);
    const path = await uploadImage(f, 'seal');
    if (path) {
      setForm((p) => ({ ...p, seal_image_path: path }));
      await refreshPreview(path, setSealUrl);
    }
    setUploadingSeal(false);
    if (sealInput.current) sealInput.current.value = '';
  }

  async function removeImage(kind: 'signature' | 'seal') {
    const path = kind === 'signature' ? form.signature_image_path : form.seal_image_path;
    if (path) {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    }
    if (kind === 'signature') {
      setForm((p) => ({ ...p, signature_image_path: null }));
      setSigUrl(null);
      setSigError(null);
    } else {
      setForm((p) => ({ ...p, seal_image_path: null }));
      setSealUrl(null);
      setSealError(null);
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.title.trim()) {
      toast.error('Please provide both the signatory name and title.');
      return;
    }
    setSaving(true);
    try {
      const value = {
        ...form,
        name: form.name.trim(),
        title: form.title.trim(),
      };
      // GAP-F1-03: governed writer (settings.edit + audit).
      await siteSettingSave(SETTINGS_KEY, value);

      await supabase.from('audit_logs' as any).insert({
        user_id: user?.id || null,
        action: 'certificate_signatory_updated',
        entity_type: 'site_settings',
        entity_id: SETTINGS_KEY,
        old_value: original as any,
        new_value: value as any,
      });

      setOriginal(value);
      toast.success('Authorized signatory saved. Regenerate certificates to apply.');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to save: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader
          title="Certificate Signatory"
          description="Configure the authorized signatory shown on generated license certificates."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}>
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
              <Button data-rbac="settings.edit" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Authorized Signatory</CardTitle>
            <CardDescription>
              This single signatory is shown on every newly generated license certificate.
              Workflow approval signatures are unrelated and remain only in workflow history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Signatory Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Jane Doe"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label>Signatory Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Director, Licensing"
                  maxLength={120}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
              />
              <Label className="cursor-pointer">Active — show on new certificates</Label>
            </div>

            <ImageBlock
              label="Signature Image"
              hint="PNG or JPG, under 2 MB. Recommended 600 × 200 px on transparent background."
              previewUrl={sigUrl}
              error={sigError}
              uploading={uploadingSig}
              inputRef={sigInput}
              onChange={handleSigFile}
              onRemove={() => removeImage('signature')}
              hasFile={!!form.signature_image_path}
            />

            <ImageBlock
              label="Seal / Stamp (optional)"
              hint="PNG or JPG, under 2 MB. Recommended square, ~400 × 400 px."
              previewUrl={sealUrl}
              error={sealError}
              uploading={uploadingSeal}
              inputRef={sealInput}
              onChange={handleSealFile}
              onRemove={() => removeImage('seal')}
              hasFile={!!form.seal_image_path}
            />

            <Alert>
              <AlertDescription className="text-sm text-muted-foreground">
                Existing PDFs are not modified. Regenerate a certificate from the license page
                to produce a new version with the updated signatory.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function ImageBlock(props: {
  label: string;
  hint: string;
  previewUrl: string | null;
  error: string | null;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  hasFile: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{props.label}</Label>
      <div className="flex items-start gap-4">
        <div className="h-24 w-48 border rounded-md bg-muted/30 flex items-center justify-center overflow-hidden">
          {props.previewUrl ? (
            <img src={props.previewUrl} alt={props.label} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">No image</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
            ref={props.inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={props.onChange}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => props.inputRef.current?.click()}
              disabled={props.uploading}
            >
              {props.uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {props.hasFile ? 'Replace' : 'Upload'}
            </Button>
            {props.hasFile && (
              <Button data-rbac="settings.edit" type="button" variant="ghost" size="sm" onClick={props.onRemove}>
                <Trash2 className="h-4 w-4 mr-2" />Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{props.hint}</p>
          {props.error && (
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{props.error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
