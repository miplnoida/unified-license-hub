export interface SectorOption {
  id: string;
  name: string;
}

export interface SubSectorOption {
  id: string;
  sectorId: string;
  name: string;
}

export interface CategoryOption {
  id: string;
  subSectorId: string;
  name: string;
}

export const sectors: SectorOption[] = [
  { id: 'insurance', name: 'Insurance' },
  { id: 'banking', name: 'Banking' },
  { id: 'capital', name: 'Capital Markets' },
  { id: 'pension', name: 'Pension & Retirement' },
];

export const subSectors: SubSectorOption[] = [
  { id: 'life', sectorId: 'insurance', name: 'Life Insurance' },
  { id: 'general', sectorId: 'insurance', name: 'General Insurance' },
  { id: 'health', sectorId: 'insurance', name: 'Health Insurance' },
  { id: 'commercial', sectorId: 'banking', name: 'Commercial Banking' },
  { id: 'development', sectorId: 'banking', name: 'Development Banking' },
  { id: 'securities', sectorId: 'capital', name: 'Securities' },
  { id: 'investment', sectorId: 'capital', name: 'Investment Services' },
  { id: 'pension-fund', sectorId: 'pension', name: 'Pension Funds' },
];

export const categories: CategoryOption[] = [
  { id: 'life-insurer', subSectorId: 'life', name: 'Life Insurer License' },
  { id: 'life-broker', subSectorId: 'life', name: 'Life Insurance Broker' },
  { id: 'life-agent', subSectorId: 'life', name: 'Life Insurance Agent' },
  { id: 'general-insurer', subSectorId: 'general', name: 'General Insurer License' },
  { id: 'general-broker', subSectorId: 'general', name: 'General Insurance Broker' },
  { id: 'health-insurer', subSectorId: 'health', name: 'Health Insurer License' },
  { id: 'comm-bank', subSectorId: 'commercial', name: 'Commercial Bank License' },
  { id: 'microfinance', subSectorId: 'commercial', name: 'Microfinance Institution' },
  { id: 'dev-bank', subSectorId: 'development', name: 'Development Bank License' },
  { id: 'broker-dealer', subSectorId: 'securities', name: 'Broker-Dealer License' },
  { id: 'investment-advisor', subSectorId: 'investment', name: 'Investment Advisor' },
  { id: 'pension-admin', subSectorId: 'pension-fund', name: 'Pension Fund Administrator' },
  { id: 'pension-custodian', subSectorId: 'pension-fund', name: 'Pension Fund Custodian' },
];

export const countries = [
  'Afghanistan', 'Albania', 'Algeria', 'Antigua and Barbuda', 'Argentina', 'Australia',
  'Austria', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belgium', 'Belize',
  'Bermuda', 'Brazil', 'Canada', 'Cayman Islands', 'China', 'Colombia', 'Costa Rica',
  'Cuba', 'Denmark', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 'Finland',
  'France', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guyana', 'Haiti',
  'Honduras', 'Hong Kong', 'India', 'Indonesia', 'Ireland', 'Israel', 'Italy', 'Jamaica',
  'Japan', 'Kenya', 'Malaysia', 'Mexico', 'Netherlands', 'New Zealand', 'Nigeria',
  'Norway', 'Pakistan', 'Panama', 'Peru', 'Philippines', 'Poland', 'Portugal',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines',
  'Singapore', 'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Suriname',
  'Sweden', 'Switzerland', 'Thailand', 'Trinidad and Tobago', 'Turkey',
  'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Venezuela',
];

export function getSubSectorsBySector(sectorId: string): SubSectorOption[] {
  return subSectors.filter(s => s.sectorId === sectorId);
}

export function getCategoriesBySubSector(subSectorId: string): CategoryOption[] {
  return categories.filter(c => c.subSectorId === subSectorId);
}
