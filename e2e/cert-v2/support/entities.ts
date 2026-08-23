/** Wave 2 (CERT-SUPTECH-V2 / WAVE2-UNIVERSE-1.0) fixture references. */
export const ENT = {
  E01_HEALTHY: { id: '69d93314-569b-490d-acdf-3e313cd428ba', name: 'Meridian Commercial Bank Limited' },
  E02_LIQUIDITY: { id: '5855bf85-9fde-4cf8-a082-7ea904d46184', name: 'Coral Harbour Bank Limited' },
  E03_CAPITAL: { id: '52112b8b-0f01-4682-a5c7-fc316797dfd8', name: 'Windward Trust Bank Limited' },
  E04_LATE: { id: 'dbb9bf0d-71ff-4f0f-accc-4bfa8ca38027', name: 'Basseterre Building Society' },
  E05_APPLICANT: { id: '6f8c8c96-2e4b-430d-a0a9-3f6ff5a72539', name: 'Frigate Bay Capital Partners Limited' },
  E06_LIFECYCLE: { id: 'bec47e13-f3d4-42ff-aafc-eef2462a24dc', name: 'Sandy Point Merchant Bank Limited' },
  E07_CONDUCT: { id: 'ed4c9fe4-4d36-4340-aab0-d967aa3c7aa6', name: 'Palmetto Consumer Finance Limited' },
  E08_EXAM: { id: 'f617704d-f6f8-422b-a9c6-92a127631df4', name: 'Nevis Peak Insurance Company Limited' },
  E09_FP: { id: 'a5a32b5c-134b-4229-a5bf-e8d9613319c3', name: 'Charlestown Life Assurance Limited' },
  E10_PPOC: { id: '2adb1fba-1ee4-4a28-a970-35ae8c92de4d', name: 'Brimstone Payments Limited' },
  E13_BOUNDARY_PASS: { id: '8b2584a3-9f77-4350-a50f-ed14f78aa68c', name: 'Cayon Commercial Bank Limited' },
  E19_GROUP_SUB: { id: '0a89f439-5ada-4b75-ab08-2570173ab427', name: 'Verchilds Securities Limited' },
} as const;

/** Filings left SUBMITTED by the Wave 2 seed (awaiting regulator review). */
export const SUBMITTED_FILINGS = [
  { id: 'efc5bc25-ba44-45a9-a3ed-94c06a72b1a8', ref: 'CV2-E02-2025-Q4', entity: ENT.E02_LIQUIDITY },
  { id: '59ba6d7a-d101-4bd5-a38a-fffbfa127350', ref: 'CV2-E03-2025-Q4', entity: ENT.E03_CAPITAL },
  { id: '96077392-fbf0-49d8-aba9-e926a439f6b6', ref: 'CV2-E13-2025-Q4', entity: ENT.E13_BOUNDARY_PASS },
] as const;
