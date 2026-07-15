import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MOCK_CASES } from '@/pages/complaints/escalations/mockData';

export function EscalationBanner() {
  const pending = MOCK_CASES.filter((c) => c.status === 'pending').length;
  if (pending === 0) return null;
  return (
    <Card className="border-amber-200 bg-amber-50/60 mb-4">
      <CardContent className="py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-amber-100"><AlertTriangle className="h-4 w-4 text-amber-800" /></div>
          <div className="text-sm">
            <div className="font-medium text-amber-900">{pending} complaint{pending === 1 ? '' : 's'} pending auto-escalation</div>
            <div className="text-xs text-amber-800">Triggered by consumer harm, age, risk rating, volume, or recurrence rules.</div>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="bg-white">
          <Link to="/complaints/escalations">Review <ArrowRight className="h-3 w-3 ml-1" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}
