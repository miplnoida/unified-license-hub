/**
 * Entity 360 section view.
 *
 * Renders one supervisory domain using the enterprise grid with the domain's
 * declared semantic columns. Restricted sections, load failures and genuinely
 * empty domains are each stated explicitly rather than shown as a blank table.
 */
import { useMemo } from 'react';
import { DefinitionList } from '@/components/presentation/DefinitionList';
import { EnterpriseDataGrid } from '@/components/data-grid';
import { formatDate } from '@/lib/presentation/format';
import { useEntity360Section, type E360SectionKey } from '@/hooks/useEntity360';
import { RegisterIdentifierDialog } from './RegisterIdentifierDialog';
import {
  resolveSectionColumns, sectionRowTitle, SECTION_BY_KEY,
  type SectionRow,
} from './sectionCatalogue';

export interface Entity360SectionViewProps {
  entityId: string;
  section: E360SectionKey;
  asOf: string | null;
}

export function Entity360SectionView({ entityId, section, asOf }: Entity360SectionViewProps) {
  const def = SECTION_BY_KEY.get(section);
  const effectiveAsOf = def?.temporal ? asOf : null;
  const { data, isLoading, error, refetch } = useEntity360Section(entityId, section, effectiveAsOf);

  const rows = (data?.rows ?? []) as SectionRow[];
  const columns = useMemo(() => resolveSectionColumns(def, rows), [def, rows]);
  const label = def?.label ?? section;

  const restricted = data?.allowed === false;

  return (
    <section className="space-y-3" aria-label={label}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold leading-tight">{label}</h2>
          <p className="text-sm text-muted-foreground">{def?.purpose}</p>
        </div>
        <div className="flex items-center gap-3">
          {effectiveAsOf && (
            <p className="text-xs text-muted-foreground">Recorded state as at {formatDate(effectiveAsOf)}</p>
          )}
          {section === 'identity' && !restricted && !effectiveAsOf && (
            <RegisterIdentifierDialog entityId={entityId} />
          )}
        </div>
      </div>

      <EnterpriseDataGrid<SectionRow>
        gridId={`e360-${section}`}
        columns={columns}
        rows={rows}
        getRowId={(row) => String(row.id ?? `${label}-${rows.indexOf(row)}`)}
        isLoading={isLoading}
        error={error ? (error as Error).message : null}
        restricted={restricted}
        restrictedMessage={`Your role does not include access to ${label.toLowerCase()} information for this entity.`}
        emptyTitle={`No ${label.toLowerCase()} records`}
        emptyDescription={
          effectiveAsOf
            ? `Nothing was recorded in this domain as at ${formatDate(effectiveAsOf)}.`
            : `This entity has no ${label.toLowerCase()} records on file.`
        }
        onRefresh={() => refetch()}
        syncUrlState={false}
        exportFileName={`entity-${section}`}
        maxBodyHeight="60vh"
        rowDetails={(row) => (
          <div className="space-y-2">
            <p className="text-sm font-semibold">{sectionRowTitle(def, row)}</p>
            <DefinitionList
              columns={3}
              items={columns
                .filter((c) => c.accessor)
                .map((c) => ({
                  label: c.header,
                  value: c.cell ? c.cell(row) : String(c.accessor!(row) ?? '—'),
                  hideWhenEmpty: true,
                }))}
            />
          </div>
        )}
      />
    </section>
  );
}

export default Entity360SectionView;
