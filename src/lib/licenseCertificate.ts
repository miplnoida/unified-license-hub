import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Shared licence certificate download used by both the licence list and the
 * licence detail page so external holders and internal staff behave identically.
 *
 * Internal staff regenerate first so the PDF reflects the licence's current
 * status; external holders (applicant / pre-licensee / mapped entity user) are
 * only allowed the holder-scoped `download` mode.
 */
export async function downloadLicenseCertificate(opts: {
  licenseId: string;
  licenseNumber?: string | null;
  regenerate?: boolean;
}): Promise<boolean> {
  const { licenseId, licenseNumber, regenerate = false } = opts;

  if (regenerate) {
    const gen = await supabase.functions.invoke('generate-license-certificate', {
      body: { mode: 'generate', license_id: licenseId },
    });
    const genErr = (gen.data as any)?.error;
    if (gen.error || genErr) {
      toast.error(genErr || 'Failed to generate certificate');
      return false;
    }
  }

  const { data, error } = await supabase.functions.invoke('generate-license-certificate', {
    body: { mode: 'download', license_id: licenseId },
  });
  const errMsg = (data as any)?.error;
  const code = (data as any)?.code;
  if (error || errMsg) {
    if (code === 'NOT_FOUND') {
      toast.error('Your certificate is being prepared. Please check back shortly.');
    } else {
      toast.error(errMsg || 'Failed to load certificate');
    }
    return false;
  }

  await openSignedCertificateUrl((data as any).url, licenseNumber);
  return true;
}

/**
 * Fetch the signed URL as a blob and trigger a same-origin download so Chrome
 * does not block cross-origin PDF navigations from the preview iframe.
 */
export async function openSignedCertificateUrl(url: string, licenseNumber?: string | null) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `license-certificate-${licenseNumber || 'certificate'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
