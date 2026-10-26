import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import {
  Settings, CreditCard, Bell, Shield, Globe,
  Database, Mail, Palette, FileText, RefreshCw, PenLine, ShieldCheck, DollarSign,
} from 'lucide-react';

interface SettingsCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
}

const settingsCards: SettingsCard[] = [
  {
    title: 'Subscription Package',
    description: 'Select Package A, B or C and switch individual modules on or off.',
    icon: <ShieldCheck className="h-6 w-6" />,
    href: '/settings/package',
  },
  {
    title: 'General',
    description: 'Organization details, regional format, and system preferences.',
    icon: <Settings className="h-6 w-6" />,
    href: '/settings/general',
  },
  {
    title: 'Payment & Fees',
    description: 'Payment gateways, fee structures, and billing policies.',
    icon: <CreditCard className="h-6 w-6" />,
    href: '/settings/payments',
  },
  // Schedule card hidden on request. Route /settings/schedule remains available.
  {
    title: 'Notifications',
    description: 'Email templates, SMS settings, and alert preferences.',
    icon: <Bell className="h-6 w-6" />,
    href: '/settings/notifications',
  },
  {
    title: 'Security',
    description: 'Password policies, session management, and access controls.',
    icon: <Shield className="h-6 w-6" />,
    href: '/settings/security',
  },
  {
    title: 'Branding',
    description: 'Logo, colors, and portal appearance customization.',
    icon: <Palette className="h-6 w-6" />,
    href: '/settings/branding',
  },
  {
    title: 'Email & SMS',
    description: 'SMTP configuration, SMS gateway, and delivery settings.',
    icon: <Mail className="h-6 w-6" />,
    href: '/settings/email-sms',
  },
  {
    title: 'Integrations',
    description: 'Third-party API connections and webhook configurations.',
    icon: <Globe className="h-6 w-6" />,
    href: '/settings/integrations',
  },
  {
    title: 'Data Management',
    description: 'Backup schedules, data retention, and export settings.',
    icon: <Database className="h-6 w-6" />,
    href: '/settings/data',
  },
  {
    title: 'Applications & Forms',
    description: 'Re-application policies, form versioning, and version notifications.',
    icon: <FileText className="h-6 w-6" />,
    href: '/settings/applications',
  },
  {
    title: 'License Expiry & Renewal',
    description: 'Validity cycle, expiry reminders, and renewal fee policy.',
    icon: <RefreshCw className="h-6 w-6" />,
    href: '/settings/license-expiry',
  },
  {
    title: 'Certificate Signatory',
    description: 'Authorized signatory name, title, signature image, and seal shown on certificates.',
    icon: <PenLine className="h-6 w-6" />,
    href: '/settings/certificate-signatory',
  },
  {
    title: 'Security Verification (CAPTCHA)',
    description: 'CAPTCHA provider, site/secret keys, environment, and enforcement on public forms.',
    icon: <ShieldCheck className="h-6 w-6" />,
    href: '/settings/captcha',
  },
  {
    title: 'Currency & Exchange Rates',
    description: 'Base and reporting currency, the currency master, and effective-dated exchange rates with maker-checker approval.',
    icon: <DollarSign className="h-6 w-6" />,
    href: '/settings/currency',
  },
];


export default function SettingsHub() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          description="Configure platform settings and system preferences."
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {settingsCards.map((card) => (
            <Card
              key={card.title}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 group animate-slide-up"
              onClick={() => navigate(card.href)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    {card.icon}
                  </div>
                  <CardTitle className="text-base">{card.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{card.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
