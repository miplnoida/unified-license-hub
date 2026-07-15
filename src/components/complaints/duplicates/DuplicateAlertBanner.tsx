import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { seedPairs, seedClusters } from '@/pages/complaints/duplicates/seed';

export function DuplicateAlertBanner() {
  const pending = seedPairs.filter(p => p.status === 'pending').length;
  const clusters = seedClusters.length;
  if (pending === 0 && clusters === 0) return null;
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-medium">{pending} suspected duplicate{pending === 1 ? '' : 's'}</span>
        <span className="text-muted-foreground"> and {clusters} active cluster{clusters === 1 ? '' : 's'} across institutions, products, intermediaries and issues.</span>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link to="/complaints/duplicates">Review <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
      </Button>
    </div>
  );
}
