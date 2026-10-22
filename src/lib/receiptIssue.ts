// A receipt can only be issued by staff for a settled payment that has none yet.
const SETTLED = ['success', 'completed', 'paid', 'verified'];

export function canIssueReceipt(opts: { isStaff: boolean; status?: string | null; existingReceipt?: string | null }) {
  return opts.isStaff && SETTLED.includes((opts.status ?? '').toLowerCase()) && !opts.existingReceipt;
}
