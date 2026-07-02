import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LicenseConditionsPanel } from './LicenseConditionsPanel';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  applicationId: string;
  applicationStatus: string;
  isInternal: boolean;
}

/**
 * Resolves the license issued for this application (if any) and renders the
 * License Conditions panel. Hidden until a license exists.
 */
export function ApplicationConditionsTab({ applicationId, applicationStatus, isInternal }: Props) {
  const [licenseId, setLicenseId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('licenses')
        .select('id')
        .eq('application_id', applicationId)
        .order('issued_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setLicenseId((data as any)?.id || null);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [applicationId]);

  if (!loaded) return null;

  if (!licenseId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          License conditions become available once the application is approved and a license is issued.
        </CardContent>
      </Card>
    );
  }

  return <LicenseConditionsPanel licenseId={licenseId} applicationId={applicationId} isInternal={isInternal} />;
}

export default ApplicationConditionsTab;
