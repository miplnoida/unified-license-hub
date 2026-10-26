/**
 * RDM-ENTITY-001 Wave D — Enterprise Entity 360 (`/entities/:entityId`).
 *
 * A single supervisory view of one regulated entity across every domain. The
 * profile is organised as a persistent entity header plus a small set of
 * meaningful navigation groups (identity & authorisation, ownership & control,
 * reporting, prudential & risk, conduct & financial crime, supervisory action,
 * records & provenance) rather than a long undifferentiated tab strip.
 *
 * Reads are served exclusively by the governed `entity360_*` RPCs, which apply
 * internal-only access and per-section permission gating; sections the current
 * user may not see are not rendered. An "as at" date replays the temporal
 * sections at a historic point in time.
 */
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CalendarClock, Coins, Loader2, LayoutDashboard, History, MapPin, UserSearch } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Entity360Header } from '@/components/entity-detail/Entity360Header';
import { Entity360OverviewPanel } from '@/components/entity-detail/Entity360Overview';
import { EntitySupervisoryStatePanel } from '@/components/entity-detail/EntitySupervisoryStatePanel';
import { EntityPrudentialStatePanel } from '@/components/prudential/EntityPrudentialStatePanel';
import { EntityFitAndProperPanel } from '@/components/fit-and-proper/EntityFitAndProperPanel';
import { OnboardingActivityPanel } from '@/components/entity/OnboardingActivityPanel';
import { ScreenHelpLink } from '@/components/help/ScreenHelpLink';
import { Entity360SectionView } from '@/components/entity-detail/Entity360SectionView';
import { Entity360TimelinePanel } from '@/components/entity-detail/Entity360TimelinePanel';
import { EntityAmlPanel } from '@/components/entity-detail/EntityAmlPanel';
import { E360_GROUPS, E360_SECTIONS } from '@/components/entity-detail/sectionCatalogue';
import { useSubscriptionPackage } from '@/hooks/useSubscriptionPackage';

/** Entity 360 sections that belong to an optional package module. */
const E360_SECTION_PACKAGE_MODULE: Partial<Record<string, string>> = {
  fit_and_proper: 'fit_and_proper',
  returns: 'returns_management',
  prudential: 'prudential_supervision',
  risk: 'prudential_supervision',
  supervision: 'prudential_supervision',
  examinations: 'inspection_management',
  market_conduct: 'market_conduct',
  aml: 'aml_supervision',
  aml_confidential: 'aml_supervision',
  enforcement: 'enforcement_management',
};
import { EntityReportingCurrencyPanel } from '@/components/entity-detail/EntityReportingCurrencyPanel';
import { OwnershipTreePanel } from '@/components/entity-detail/OwnershipTreePanel';
import { SupervisoryTimelinePanel } from '@/components/entity-detail/SupervisoryTimelinePanel';
import { EntitySupervisory360Panel } from '@/components/entity-detail/EntitySupervisory360Panel';
import { SubjectAddressPanel } from '@/components/addresses/SubjectAddressPanel';
import { useEntity360Overview, type E360SectionKey } from '@/hooks/useEntity360';


type ViewKey = 'overview' | 'timeline' | 'onboarding' | 'reporting_currency' | 'addresses' | E360SectionKey;

export default function Entity360Detail() {
  const { entityId } = useParams<{ entityId: string }>();
  const [searchParams] = useSearchParams();
  const [asOfInput, setAsOfInput] = useState('');
  const [view, setView] = useState<ViewKey>(() => (searchParams.get('section') as ViewKey) || 'overview');
  const { data: overview, isLoading, error } = useEntity360Overview(entityId);

  const asOf = asOfInput ? new Date(`${asOfInput}T23:59:59Z`).toISOString() : null;
  const allowed = overview?.sections ?? {};

  /** Navigation groups, containing only sections this user may read. */
  const { isModuleEnabled } = useSubscriptionPackage();
  const groups = useMemo(() => E360_GROUPS.map((group) => ({
    ...group,
    sections: E360_SECTIONS.filter((s) => s.group === group.key && allowed[s.key] !== false
      && isModuleEnabled(E360_SECTION_PACKAGE_MODULE[s.key])),
  })).filter((g) => g.sections.length > 0), [allowed, isModuleEnabled]);

  if (isLoading) {
    return (
      <div className="py-24 text-center text-muted-foreground">
        <Loader2 className="inline h-6 w-6 animate-spin" aria-label="Loading entity profile" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Entity profile" description="Enterprise supervisory view of a regulated entity." />
        <Card><CardContent className="py-10 text-center text-sm text-destructive">
          {(error as Error).message === 'forbidden'
            ? 'You do not have access to the entity profile.'
            : (error as Error).message}
        </CardContent></Card>
      </div>
    );
  }

  if (!overview?.found || !overview.entity) {
    return (
      <div className="space-y-4">
        <PageHeader title="Entity profile" description="Enterprise supervisory view of a regulated entity." />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          We could not find this entity. It may have been merged into another record.
        </CardContent></Card>
      </div>
    );
  }

  const entity = overview.entity;
  const activeSection = E360_SECTIONS.find((s) => s.key === view);

  return (
    <div className="space-y-4">
      <Entity360Header overview={overview} asOf={asOf} onClearAsOf={() => setAsOfInput('')} />

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Grouped section navigation */}
        <nav aria-label="Entity profile sections" className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border bg-card p-2">
            <NavButton
              label="Overview"
              icon={LayoutDashboard}
              active={view === 'overview'}
              onClick={() => setView('overview')}
            />
            {allowed.timeline !== false && (
              <NavButton
                label="Regulatory history"
                icon={History}
                active={view === 'timeline'}
                onClick={() => setView('timeline')}
              />
            )}
            <NavButton
              label="Onboarding & identity activity"
              icon={UserSearch}
              active={view === 'onboarding'}
              onClick={() => setView('onboarding')}
            />
            <NavButton
              label="Reporting & currency"
              icon={Coins}
              active={view === 'reporting_currency'}
              onClick={() => setView('reporting_currency')}
            />
            {/* F8A-B4 — canonical address usage and co-location intelligence. */}
            <NavButton
              label="Addresses & co-location"
              icon={MapPin}
              active={view === 'addresses'}
              onClick={() => setView('addresses')}
            />



            {groups.map((group) => (
              <div key={group.key} className="mt-3">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                {group.sections.map((s) => (
                  <NavButton
                    key={s.key}
                    label={s.label}
                    icon={s.icon}
                    active={view === s.key}
                    onClick={() => setView(s.key)}
                  />
                ))}
              </div>
            ))}

            <Separator className="my-3" />

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                  <CalendarClock className="h-4 w-4" />
                  {asOfInput ? 'Change historic date' : 'View as at a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="e360-as-of" className="text-xs">Point-in-time view (as at)</Label>
                  <Input
                    id="e360-as-of"
                    type="date"
                    value={asOfInput}
                    onChange={(ev) => setAsOfInput(ev.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Identity, licences, ownership, governance, group relationships, business profile
                  and documents replay their recorded state at the selected date.
                </p>
                {asOfInput && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setAsOfInput('')}>
                    Return to current state
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </nav>

        {/* Active view */}
        <div className="min-w-0">
          {view === 'overview' && (
            <div className="space-y-4">
              {/* EPIC 4 / W3: the canonical enterprise supervisory state leads the
                  overview; the legacy domain panels are retained beneath it. */}
              <EntitySupervisory360Panel entityId={entity.id} />
              <EntitySupervisoryStatePanel entityId={entity.id} />
              <EntityPrudentialStatePanel entityId={entity.id} />
              <Entity360OverviewPanel
                overview={overview}
                allowed={allowed}
                onOpenSection={(section) => setView(section)}
              />
            </div>
          )}

          {/* EPIC 4 / W2: canonical enterprise supervisory timeline first, with the
              historical activity feed retained beneath it. */}
          {view === 'timeline' && (
            <div className="space-y-4">
              <SupervisoryTimelinePanel entityId={entity.id} />
              <Entity360TimelinePanel entityId={entity.id} />
            </div>
          )}

          {view === 'onboarding' && <OnboardingActivityPanel entityId={entity.id} />}

          {view === 'reporting_currency' && (
            <EntityReportingCurrencyPanel entityId={entity.id} asOf={asOf} />
          )}

          {view === 'addresses' && (
            <SubjectAddressPanel subjectKind="ENTITY" subjectId={entity.id} />
          )}



          {activeSection && (
            <div className="space-y-4">
              {/* Documentation only: deep link to this section's manual entry. */}
              <div className="flex justify-end">
                <ScreenHelpLink
                  surface="entity-360"
                  anchor={`entity-360-${activeSection.key}`}
                  label={`Help: ${activeSection.label ?? 'this section'}`}
                  variant="inline"
                />
              </div>
              {/* EPR-04: the entity's F&P position is a read-only summary that
                  links out to the canonical assessment case workspace. */}
              {activeSection.key === 'fit_and_proper' && (
                <EntityFitAndProperPanel entityId={entity.id} />
              )}
              {/* Ownership reads as a structure tree first, records second. */}
              {activeSection.key === 'ownership' && (
                <OwnershipTreePanel
                  entityId={entity.id}
                  entityName={entity.name ?? null}
                  asOf={asOf}
                />
              )}
              {/* EPIC 3 / Gate 10 + EPIC 4 / W3: the canonical AML panel is the only
                  AML truth on this page. The legacy AML block has been retired, so no
                  second AML view is rendered beneath it. */}
              {activeSection.key === 'aml' ? (
                <EntityAmlPanel entityId={entity.id} />
              ) : (
                <Entity360SectionView
                  entityId={entity.id}
                  section={activeSection.key}
                  asOf={asOf}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NavButton({
  label, icon: Icon, active, onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}
