import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { AmlPortfolioReport } from '@/components/supervision/aml/AmlPortfolioReport';

/**
 * AML-10 — AML/CFT portfolio risk and management reporting.
 *
 * A reporting surface only. It creates no supervisory record and takes no
 * supervisory decision: operational work stays on the work queue, the due
 * review list and the entity AML view.
 */
export default function AmlPortfolio() {
  return (
    <DashboardLayout>
      <PageHeader
        title="AML/CFT portfolio risk report"
        description="Server-calculated portfolio risk, provenance, review status, supervisory exposure and risk movement for the entities within your supervisory scope."
      />
      <AmlPortfolioReport />
    </DashboardLayout>
  );
}
