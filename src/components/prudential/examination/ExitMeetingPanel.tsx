import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useExitMeeting, useSaveExitMeeting } from '@/hooks/useExaminations';
import { StageActions } from './ExaminationStageActions';

export function ExitMeetingPanel({ examinationId, readOnly }: { examinationId: string; readOnly?: boolean }) {
  const { data, isLoading } = useExitMeeting(examinationId);
  const save = useSaveExitMeeting(examinationId);
  const [form, setForm] = useState({
    meeting_date: '',
    location: '',
    regulator_attendees: '',
    entity_attendees: '',
    matters_discussed: '',
    entity_initial_response: '',
    agreed_timelines: '',
  });

  useEffect(() => {
    if (data) {
      setForm({
        meeting_date: data.meeting_date ? String(data.meeting_date).slice(0, 16) : '',
        location: data.location ?? '',
        regulator_attendees: (data.regulator_attendees ?? []).join(', '),
        entity_attendees: (data.entity_attendees ?? []).join(', '),
        matters_discussed: data.matters_discussed ?? '',
        entity_initial_response: data.entity_initial_response ?? '',
        agreed_timelines: data.agreed_timelines ?? '',
      });
    }
  }, [data]);

  const persist = async () => {
    const { data: auth } = await supabase.auth.getUser();
    await save.mutateAsync({
      meeting_date: form.meeting_date ? new Date(form.meeting_date).toISOString() : null,
      location: form.location || null,
      regulator_attendees: form.regulator_attendees ? form.regulator_attendees.split(',').map(s => s.trim()).filter(Boolean) : [],
      entity_attendees: form.entity_attendees ? form.entity_attendees.split(',').map(s => s.trim()).filter(Boolean) : [],
      matters_discussed: form.matters_discussed || null,
      entity_initial_response: form.entity_initial_response || null,
      agreed_timelines: form.agreed_timelines || null,
      recorded_by: data?.recorded_by ?? auth?.user?.id ?? null,
    });
  };

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Exit meeting record</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Meeting date &amp; time</Label>
            <Input type="datetime-local" disabled={readOnly} value={form.meeting_date}
              onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} />
          </div>
          <div>
            <Label>Location</Label>
            <Input disabled={readOnly} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Regulator attendees (comma separated)</Label>
            <Input disabled={readOnly} value={form.regulator_attendees}
              onChange={e => setForm(f => ({ ...f, regulator_attendees: e.target.value }))} />
          </div>
          <div>
            <Label>Entity attendees (comma separated)</Label>
            <Input disabled={readOnly} value={form.entity_attendees}
              onChange={e => setForm(f => ({ ...f, entity_attendees: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label>Matters discussed</Label>
          <Textarea rows={3} disabled={readOnly} value={form.matters_discussed}
            onChange={e => setForm(f => ({ ...f, matters_discussed: e.target.value }))} />
        </div>
        <div>
          <Label>Entity initial response</Label>
          <Textarea rows={3} disabled={readOnly} value={form.entity_initial_response}
            onChange={e => setForm(f => ({ ...f, entity_initial_response: e.target.value }))} />
        </div>
        <div>
          <Label>Agreed timelines</Label>
          <Textarea rows={2} disabled={readOnly} value={form.agreed_timelines}
            onChange={e => setForm(f => ({ ...f, agreed_timelines: e.target.value }))} />
        </div>
        {!readOnly && <StageActions beforeAdvance={persist} />}
      </CardContent>
    </Card>
  );
}
