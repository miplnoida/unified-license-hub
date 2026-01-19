import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Building2,
  Landmark,
  TrendingUp,
  Shield,
  ArrowRight,
  FileText,
  ChevronRight,
  Info,
} from 'lucide-react';

interface Sector {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  subSectors: SubSector[];
}

interface SubSector {
  id: string;
  name: string;
  categories: Category[];
}

interface Category {
  id: string;
  name: string;
  description: string;
  formId: string;
}

const sectors: Sector[] = [
  {
    id: 'insurance',
    name: 'Insurance',
    description: 'Life, General, and Health Insurance',
    icon: <Shield className="h-6 w-6" />,
    subSectors: [
      {
        id: 'life',
        name: 'Life Insurance',
        categories: [
          { id: 'life-insurer', name: 'Life Insurer License', description: 'Full license for life insurance operations', formId: 'form-1' },
          { id: 'life-broker', name: 'Life Insurance Broker', description: 'Broker license for life insurance products', formId: 'form-2' },
          { id: 'life-agent', name: 'Life Insurance Agent', description: 'Agent license for life insurance sales', formId: 'form-3' },
        ],
      },
      {
        id: 'general',
        name: 'General Insurance',
        categories: [
          { id: 'general-insurer', name: 'General Insurer License', description: 'Full license for general insurance operations', formId: 'form-4' },
          { id: 'general-broker', name: 'General Insurance Broker', description: 'Broker license for general insurance products', formId: 'form-5' },
        ],
      },
    ],
  },
  {
    id: 'banking',
    name: 'Banking',
    description: 'Commercial and Development Banking',
    icon: <Landmark className="h-6 w-6" />,
    subSectors: [
      {
        id: 'commercial',
        name: 'Commercial Banking',
        categories: [
          { id: 'comm-bank', name: 'Commercial Bank License', description: 'Full banking license', formId: 'form-6' },
          { id: 'microfinance', name: 'Microfinance Institution', description: 'Microfinance license', formId: 'form-7' },
        ],
      },
    ],
  },
  {
    id: 'capital',
    name: 'Capital Markets',
    description: 'Securities and Investment Services',
    icon: <TrendingUp className="h-6 w-6" />,
    subSectors: [
      {
        id: 'securities',
        name: 'Securities',
        categories: [
          { id: 'broker-dealer', name: 'Broker-Dealer License', description: 'Securities broker-dealer license', formId: 'form-8' },
          { id: 'investment-advisor', name: 'Investment Advisor', description: 'Investment advisory license', formId: 'form-9' },
        ],
      },
    ],
  },
  {
    id: 'pension',
    name: 'Pension & Retirement',
    description: 'Pension Funds and Retirement Services',
    icon: <Building2 className="h-6 w-6" />,
    subSectors: [
      {
        id: 'pension-fund',
        name: 'Pension Funds',
        categories: [
          { id: 'pension-admin', name: 'Pension Fund Administrator', description: 'Pension administration license', formId: 'form-10' },
          { id: 'pension-custodian', name: 'Pension Fund Custodian', description: 'Custodian license', formId: 'form-11' },
        ],
      },
    ],
  },
];

export default function PreLicense() {
  const [selectedSector, setSelectedSector] = useState<Sector | null>(null);
  const [selectedSubSector, setSelectedSubSector] = useState<SubSector | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const handleSectorSelect = (sector: Sector) => {
    setSelectedSector(sector);
    setSelectedSubSector(null);
    setSelectedCategory(null);
  };

  const handleSubSectorSelect = (subSectorId: string) => {
    const subSector = selectedSector?.subSectors.find(s => s.id === subSectorId);
    setSelectedSubSector(subSector || null);
    setSelectedCategory(null);
  };

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="animate-slide-up">
          <h1 className="text-2xl font-bold text-foreground">Pre-License Applications</h1>
          <p className="mt-1 text-muted-foreground">
            Select your sector, sub-sector, and category to start a new license application.
          </p>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm animate-slide-up delay-100">
          <span className="text-muted-foreground">Step 1: Select Sector</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className={selectedSector ? 'text-foreground' : 'text-muted-foreground'}>
            Step 2: Select Sub-Sector
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className={selectedSubSector ? 'text-foreground' : 'text-muted-foreground'}>
            Step 3: Select Category
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className={selectedCategory ? 'text-foreground' : 'text-muted-foreground'}>
            Step 4: Complete Application
          </span>
        </div>

        {/* Sector Selection */}
        <div className="animate-slide-up delay-200">
          <h2 className="text-lg font-semibold mb-4">Select Sector</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {sectors.map((sector) => (
              <button
                key={sector.id}
                onClick={() => handleSectorSelect(sector)}
                className={`card-elevated p-5 text-left transition-all ${
                  selectedSector?.id === sector.id
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'hover:border-primary/50'
                }`}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  selectedSector?.id === sector.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-primary/10 text-primary'
                }`}>
                  {sector.icon}
                </div>
                <h3 className="mt-4 font-semibold text-foreground">{sector.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{sector.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Sub-Sector Selection */}
        {selectedSector && (
          <div className="animate-slide-up">
            <h2 className="text-lg font-semibold mb-4">Select Sub-Sector</h2>
            <div className="max-w-md">
              <Select onValueChange={handleSubSectorSelect} value={selectedSubSector?.id}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a sub-sector..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedSector.subSectors.map((subSector) => (
                    <SelectItem key={subSector.id} value={subSector.id}>
                      {subSector.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Category Selection */}
        {selectedSubSector && (
          <div className="animate-slide-up">
            <h2 className="text-lg font-semibold mb-4">Select License Category</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedSubSector.categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategorySelect(category)}
                  className={`card-elevated p-5 text-left transition-all ${
                    selectedCategory?.id === category.id
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10">
                      <FileText className="h-5 w-5 text-secondary" />
                    </div>
                    {selectedCategory?.id === category.id && (
                      <Badge variant="approved">Selected</Badge>
                    )}
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{category.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Application Form Preview */}
        {selectedCategory && (
          <Card className="animate-slide-up">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Application Form</CardTitle>
                  <CardDescription>
                    {selectedCategory.name} - {selectedSector?.name} / {selectedSubSector?.name}
                  </CardDescription>
                </div>
                <Badge variant="draft">New Application</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Sample Dynamic Form Fields */}
              <div className="bg-info/10 border border-info/20 rounded-lg p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-info">Dynamic Form</p>
                  <p className="text-muted-foreground">
                    This form is dynamically generated based on your selection. All fields, validations, 
                    and conditions are configurable by administrators.
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company Name *</Label>
                  <Input id="company-name" placeholder="Enter company name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-number">Registration Number *</Label>
                  <Input id="registration-number" placeholder="Enter registration number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-email">Contact Email *</Label>
                  <Input id="contact-email" type="email" placeholder="Enter email address" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-phone">Contact Phone *</Label>
                  <Input id="contact-phone" placeholder="Enter phone number" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Registered Address *</Label>
                <Input id="address" placeholder="Enter full address" />
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="outline">Save as Draft</Button>
                <Button>
                  Continue to Next Section
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
