import { Megaphone } from 'lucide-react';

const notices = [
  { date: 'Mar 15, 2026', text: 'New online license renewal process now available for all sectors.' },
  { date: 'Mar 10, 2026', text: 'System maintenance scheduled for March 22, 2026 from 2:00 AM to 6:00 AM.' },
  { date: 'Mar 5, 2026', text: 'Updated compliance return filing deadlines for Q1 2026.' },
];

export function TrustSection() {
  return (
    <section className="py-14 lg:py-20 bg-muted/40">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-primary mb-2">
            <Megaphone className="h-5 w-5" />
            <h2 className="text-xl lg:text-2xl font-bold text-foreground">Notices &amp; Announcements</h2>
          </div>
          <p className="text-sm text-muted-foreground">Latest updates from the regulatory authority</p>
        </div>

        <div className="space-y-3">
          {notices.map((n) => (
            <div key={n.date} className="flex items-start gap-4 rounded-lg border bg-card p-4">
              <span className="text-xs font-mono font-medium text-muted-foreground whitespace-nowrap pt-0.5">{n.date}</span>
              <p className="text-sm text-foreground/85">{n.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
