import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface SecurityScanningNoticeProps {
  className?: string;
}

/**
 * Applicant-friendly notice explaining how uploaded files are scanned for
 * malware. UI only — no backend wiring. Placed above the documents step of
 * the registration wizard.
 */
export function SecurityScanningNotice({ className }: SecurityScanningNoticeProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card className={cn('border-border bg-card', className)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-3 p-4 text-left">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">Security &amp; file scanning</div>
            <div className="text-xs text-muted-foreground">
              All uploads are scanned for malware before we accept them.
            </div>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border px-4 py-4">
            <ul className="space-y-3 text-sm text-foreground">
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  <span className="font-medium">Scanned on upload</span> — every file is checked
                  with ClamAV, an industry-standard antivirus engine, before it reaches our
                  systems.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  <span className="font-medium">Definitions stay current</span> — virus signatures
                  refresh daily. On-premises and restricted-network deployments use a secure
                  internal signature mirror, so protection stays up to date even without direct
                  internet access.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  <span className="font-medium">What&apos;s allowed</span> — PDF, Word, Excel,
                  images (JPG, PNG, WebP), CSV and plain text, up to{' '}
                  <span className="font-medium">20&nbsp;MB per file</span>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  <span className="font-medium">If something is infected</span> — the file is
                  blocked immediately, moved to a secure quarantine area, and a record is written
                  to the audit log. Our security team is notified and you&apos;ll see a clear
                  message so you can upload a clean copy.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  <span className="font-medium">Your privacy</span> — accepted files are stored
                  privately and only reachable through short-lived signed links (valid for 5
                  minutes).
                </span>
              </li>
            </ul>
            <div className="mt-4 text-xs text-muted-foreground">
              Powered by ClamAV · signatures refreshed daily
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default SecurityScanningNotice;
