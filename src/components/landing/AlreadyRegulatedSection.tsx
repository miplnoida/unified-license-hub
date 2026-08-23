/**
 * Homepage section for existing regulated entities.
 * Public information only — every task links through sign-in.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BadgeCheck, FileSpreadsheet, MessageSquareReply, UserCheck, Mail, CalendarClock,
} from 'lucide-react';
import { SecureServiceBadge, SignInCta } from '@/components/public/AccessBadges';

const TASKS = [
  { icon: BadgeCheck, label: 'Manage licences', slug: 'licence-renewal' },
  { icon: FileSpreadsheet, label: 'File regulatory returns', slug: 'regulatory-returns' },
  { icon: MessageSquareReply, label: 'Respond to requests', slug: 'regulatory-requests' },
  { icon: UserCheck, label: 'Manage Fit & Proper submissions', slug: 'fit-and-proper' },
  { icon: Mail, label: 'View correspondence', slug: 'correspondence' },
  { icon: CalendarClock, label: 'Track deadlines', slug: 'regulatory-deadlines' },
];

export function AlreadyRegulatedSection() {
  return (
    <section id="licensee-services" className="border-y bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Already regulated?</h2>
          <SecureServiceBadge />
        </div>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Use the regulated-entity portal to manage ongoing regulatory obligations and communicate
          securely with the regulator.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TASKS.map(({ icon: Icon, label, slug }) => (
            <Link key={slug} to={`/licensee-services/${slug}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium">{label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <SignInCta label="Sign In to Entity Portal" target="/dashboard" size="lg" />
          <Button asChild variant="outline" size="lg">
            <Link to="/licensee-services">View Licensee Services</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link to="/register/entity">Need access to an existing entity?</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
