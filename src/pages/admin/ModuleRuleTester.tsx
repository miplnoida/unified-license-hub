import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ModuleTesterPanel } from '@/components/admin/rule-engine/ModuleTesterPanel';
import { MODULE_TESTER_SPECS, isModuleFamily } from '@/lib/moduleRuleTester';

/**
 * Router for the specialised module testers (ADM-RE-003). The Rule Library
 * launches this per family so a module-owned rule is tested in its own context
 * rather than through the shared-engine evaluator.
 */
export default function ModuleRuleTester() {
  const { family, id } = useParams<{ family: string; id: string }>();
  const navigate = useNavigate();

  if (!isModuleFamily(family) || !id) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6 space-y-3">
          <p className="text-sm">
            No specialised tester exists for “{family}”. Shared-engine rules are tested from the rule editor’s
            Test tab.
          </p>
          <Button variant="outline" onClick={() => navigate('/admin/rule-engine')}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back to Rule Library
          </Button>
        </CardContent></Card>
      </div>
    );
  }

  const spec = MODULE_TESTER_SPECS[family];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{spec.label}</h1>
          <p className="text-sm text-muted-foreground">Rule {id}</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/admin/rule-engine')}>
          <ArrowLeft className="mr-2 h-4 w-4" />Rule Library
        </Button>
      </div>
      <ModuleTesterPanel family={family} ruleId={id} />
    </div>
  );
}
