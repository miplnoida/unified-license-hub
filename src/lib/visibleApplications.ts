import { supabase } from '@/integrations/supabase/client';

const RPC_PAGE_SIZE = 200;

export interface VisibleApplicationRow {
  id: string;
  application_number: string;
  applicant_id: string;
  applicant_name?: string | null;
  applicant_email?: string | null;
  license_type: string;
  status: string;
  data: Record<string, any>;
  submitted_at: string | null;
  created_at: string;
  form_version_id?: string | null;
  sector_id?: string | null;
  resolved_sector_id?: string | null;
  sub_sector_id?: string | null;
  category_id?: string | null;
  service_id?: string | null;
  sector_name?: string | null;
  sub_sector_name?: string | null;
  category_name?: string | null;
  service_name?: string | null;
  payment_id?: string | null;
  payment_amount?: number | null;
  payment_status?: string | null;
  payment_currency?: string | null;
  payment_method?: string | null;
  payment_paid_at?: string | null;
  action_count?: number | null;
  total_count?: number | null;
}

interface LoadVisibleApplicationsOptions {
  licenseeId?: string | null;
  sectorId?: string | null;
  status?: string | null;
  sla?: string | null;
}

export async function loadVisibleApplications(options: LoadVisibleApplicationsOptions = {}) {
  const rows: VisibleApplicationRow[] = [];
  let page = 0;
  let total = Number.POSITIVE_INFINITY;

  while (rows.length < total) {
    const { data, error } = await supabase.rpc('get_application_list_page' as any, {
      _page: page,
      _page_size: RPC_PAGE_SIZE,
      _search: null,
      _search_mode: 'contains',
      _status: options.status ?? null,
      _version_id: null,
      _sort_by: 'created_at',
      _sort_dir: 'desc',
      _licensee_id: options.licenseeId ?? null,
      _sector_id: options.sectorId ?? null,
      _sla: options.sla ?? null,
    });

    if (error) throw error;

    const batch = ((data || []) as any[]).map((row): VisibleApplicationRow => ({
      ...row,
      data: row.data || {},
      payment_amount: row.payment_amount == null ? null : Number(row.payment_amount),
      total_count: row.total_count == null ? null : Number(row.total_count),
    }));

    if (batch.length === 0) break;

    rows.push(...batch);
    total = batch[0]?.total_count ?? batch.length;

    if (batch.length < RPC_PAGE_SIZE) break;
    page += 1;
  }

  return rows;
}