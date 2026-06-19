import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import Swal from 'sweetalert2';
import {
  ArrowLeft, Loader2, Building2, Users, GitBranch, Shield, Gavel,
  ShieldAlert, Users2, FileText, ClipboardCheck, Umbrella, Hash, Target
} from 'lucide-react';
import { LicenseStatusBadge } from '@/lib/licenseStatusBadge';

// Lazy-load tab components
const BackgroundInfoTab = lazy(() => import('@/components/entity-detail/BackgroundInfoTab'));
const RelationshipsTab = lazy(() => import('@/components/entity-detail/RelationshipsTab'));
const OwnershipTab = lazy(() => import('@/components/entity-detail/OwnershipTab'));
const LicensesTab = lazy(() => import('@/components/entity-detail/LicensesTab'));
const EnforcementTab = lazy(() => import('@/components/entity-detail/EnforcementTab'));
const RiskRatingsTab = lazy(() => import('@/components/entity-detail/RiskRatingsTab'));
const WebUsersTab = lazy(() => import('@/components/entity-detail/WebUsersTab'));
const ReturnsTab = lazy(() => import('@/components/entity-detail/ReturnsTab'));
const InspectionsTab = lazy(() => import('@/components/entity-detail/InspectionsTab'));
const ReinsuranceTab = lazy(() => import('@/components/entity-detail/ReinsuranceTab'));
const SupervisoryPlanTab = lazy(() => import('@/components/entity-detail/SupervisoryPlanTab'));

interface LookupMap { [id: string]: string }

const TabLoader = () => (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function LicenseeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [licensee, setLicensee] = useState<any>(null);
  const [license, setLicense] = useState<any>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [sectors, setSectors] = useState<LookupMap>({});
  const [subSectors, setSubSectors] = useState<LookupMap>({});
  const [categories, setCategories] = useState<LookupMap>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('background');
  const [isDirty, setIsDirty] = useState(false);
  const [hasReinsurance, setHasReinsurance] = useState(false);
  // Track which tabs have been loaded (for caching)
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set(['background']));

  const loadEntity = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [licRes, secRes, subRes, catRes, reinsRes] = await Promise.all([
      supabase.from('licensees').select('*').eq('id', id).single(),
      supabase.from('sectors').select('id, name'),
      supabase.from('sub_sectors').select('id, name'),
      supabase.from('categories').select('id, name'),
      supabase.from('reinsurance_contracts' as any).select('id').eq('entity_id', id).limit(1),
    ]);

    const sMap: LookupMap = {};
    (secRes.data || []).forEach(s => { sMap[s.id] = s.name; });
    setSectors(sMap);
    const ssMap: LookupMap = {};
    (subRes.data || []).forEach(s => { ssMap[s.id] = s.name; });
    setSubSectors(ssMap);
    const cMap: LookupMap = {};
    (catRes.data || []).forEach(c => { cMap[c.id] = c.name; });
    setCategories(cMap);

    setLicensee(licRes.data);
    setHasReinsurance(((reinsRes.data as any[]) || []).length > 0);

    if (licRes.data?.license_id) {
      const { data: licenseData } = await supabase
        .from('licenses')
        .select('id, license_number, status')
        .eq('id', licRes.data.license_id)
        .maybeSingle();
      setLicense(licenseData);
    } else {
      setLicense(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { loadEntity(); }, [loadEntity]);

  // Resolve a human-friendly display name (applicant/entity name) instead of
  // the stored licensees.name which may contain a sector-subsector-category slug.
  useEffect(() => {
    let cancelled = false;
    if (!licensee?.id) { setDisplayName(''); return; }
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('get-licensee-registration', {
          body: {
            entity_id: licensee.id,
            license_id: licensee.license_id || null,
            name: licensee.name || '',
            sector_id: licensee.sector_id || null,
            sub_sector_id: licensee.sub_sector_id || null,
            category_id: licensee.category_id || null,
          },
        });
        if (cancelled) return;
        const reg = data?.registration || {};
        const ad = (data?.application?.data && typeof data.application.data === 'object') ? data.application.data : {};
        const ap = data?.applicant || {};
        const resolved =
          reg.applicant_name ||
          ad.applicant_name ||
          ad.entity_name ||
          ap.entity_name ||
          ap.full_name ||
          licensee.name ||
          '';
        setDisplayName(String(resolved || '').trim() || licensee.name || '');
      } catch {
        if (!cancelled) setDisplayName(licensee.name || '');
      }
    })();
    return () => { cancelled = true; };
  }, [licensee?.id, licensee?.license_id, licensee?.name, licensee?.sector_id, licensee?.sub_sector_id, licensee?.category_id]);


  const handleTabChange = async (newTab: string) => {
    if (isDirty) {
      const result = await Swal.fire({
        title: 'Unsaved Changes',
        text: 'You have unsaved changes. Are you sure you want to switch tabs?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, switch tab',
        cancelButtonText: 'Cancel',
      });
      if (!result.isConfirmed) return;
      setIsDirty(false);
    }
    setActiveTab(newTab);
    setLoadedTabs(prev => new Set(prev).add(newTab));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!licensee) {
    return (
      <DashboardLayout>
        <div className="text-center py-24">
          <p className="text-muted-foreground">Licensee not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/licensees')}>
            <ArrowLeft className="h-4 w-4 mr-2" />Back to Licensees
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const tabs = [
    { id: 'background', label: 'Background Info', icon: Building2 },
    { id: 'relationships', label: 'Relationships', icon: Users },
    { id: 'ownership', label: 'Ownership', icon: GitBranch },
    { id: 'licenses', label: 'Licenses', icon: Shield },
    { id: 'enforcement', label: 'Enforcement', icon: Gavel },
    { id: 'risk', label: 'Risk Ratings', icon: ShieldAlert },
    { id: 'supervisory', label: 'Supervisory Plan', icon: Target },
    { id: 'web-users', label: 'Web Users', icon: Users2 },
    { id: 'returns', label: 'Returns', icon: FileText },
    { id: 'inspections', label: 'Inspections', icon: ClipboardCheck },
    ...(hasReinsurance ? [{ id: 'reinsurance', label: 'Reinsurance', icon: Umbrella }] : []),
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate('/admin/licensees')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">{displayName || licensee.name}</h1>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {license?.license_number ? (
                      <span className="flex items-center gap-1 font-mono">
                        <Hash className="h-3 w-3" />{license.license_number}
                      </span>
                    ) : licensee.license_id && (
                      <span className="flex items-center gap-1 font-mono"><Hash className="h-3 w-3" />{licensee.license_id.slice(0, 8)}</span>
                    )}
                    <LicenseStatusBadge status={license?.status || licensee.status} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="border-b">
            <TabsList className="h-auto bg-transparent p-0 w-full justify-start overflow-x-auto flex-nowrap">
              {tabs.map(tab => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-colors data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground"
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Tab Content */}
          <Suspense fallback={<TabLoader />}>
            <TabsContent value="background" className="mt-6">
              {loadedTabs.has('background') && (
                <BackgroundInfoTab
                  entity={licensee}
                  sectors={sectors}
                  subSectors={subSectors}
                  categories={categories}
                  onUpdate={loadEntity}
                  onDirtyChange={setIsDirty}
                />
              )}
            </TabsContent>

            <TabsContent value="relationships" className="mt-6">
              {loadedTabs.has('relationships') && <RelationshipsTab entityId={id!} />}
            </TabsContent>

            <TabsContent value="ownership" className="mt-6">
              {loadedTabs.has('ownership') && <OwnershipTab entityId={id!} entityName={displayName || licensee.name} />}
            </TabsContent>

            <TabsContent value="licenses" className="mt-6">
              {loadedTabs.has('licenses') && <LicensesTab entityId={id!} licenseId={licensee.license_id} />}
            </TabsContent>

            <TabsContent value="enforcement" className="mt-6">
              {loadedTabs.has('enforcement') && <EnforcementTab entityId={id!} />}
            </TabsContent>

            <TabsContent value="risk" className="mt-6">
              {loadedTabs.has('risk') && <RiskRatingsTab entityId={id!} />}
            </TabsContent>

            <TabsContent value="supervisory" className="mt-6">
              {loadedTabs.has('supervisory') && <SupervisoryPlanTab entityId={id!} />}
            </TabsContent>


            <TabsContent value="web-users" className="mt-6">
              {loadedTabs.has('web-users') && <WebUsersTab entityId={id!} entityName={displayName || licensee.name} />}
            </TabsContent>

            <TabsContent value="returns" className="mt-6">
              {loadedTabs.has('returns') && <ReturnsTab entityId={id!} licenseId={licensee.license_id} />}
            </TabsContent>

            <TabsContent value="inspections" className="mt-6">
              {loadedTabs.has('inspections') && <InspectionsTab entityId={id!} />}
            </TabsContent>

            {hasReinsurance && (
              <TabsContent value="reinsurance" className="mt-6">
                {loadedTabs.has('reinsurance') && <ReinsuranceTab entityId={id!} />}
              </TabsContent>
            )}
          </Suspense>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
