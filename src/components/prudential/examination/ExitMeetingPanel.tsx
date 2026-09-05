import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useExitMeeting, useSaveExitMeeting } from '@/hooks/useExaminations';
import { StageActions, type StageActionsMode } from './ExaminationStageActions';
import { ChipsInput } from './ChipsInput';
import { engagementPhrasing } from '@/lib/supervisoryEngagement';
import { useExaminationEngagement } from '@/hooks/useExaminationEngagement';

export function ExitMeetingPanel({ examinationId, readOnly, mode = 'supporting' }: { examinationId: string; readOnly?: boolean; mode?: StageActionsMode }) {
  const { data, isLoading } = useExitMeeting(examinationId);
  const engagement = useExaminationEngagement(examinationId);
  const save = useSaveExitMeeting(examinationId);
  const [form, setForm] = useState({
    meeting_date: '',
    location: '',
    matters_discussed: '',
    entity_initial_response: '',
    agreed_timelines: '',
  });
  const [regulatorAttendees, setRegulatorAttendees] = useState<string[]>([]);
  const [entityAttendees, setEntityAttendees] = useState<string[]>([]);

  useEffect(() => {
    if (data) {
      setForm({
        meeting_date: data.meeting_date ? String(data.meeting_date).slice(0, 16) : '',
        location: data.location ?? '',
        matters_discussed: data.matters_discussed ?? '',
        entity_initial_response: data.entity_initial_response ?? '',
        agreed_timelines: data.agreed_timelines ?? '',
      });
      setRegulatorAttendees((data.regulator_attendees ?? []) as string[]);
      setEntityAttendees((data.entity_attendees ?? []) as string[]);
    }
  }, [data]);

  const persist = async () => {
    const { data: auth } = await supabase.auth.getUser();
    await save.mutateAsync({
      meeting_date: form.meeting_date ? new Date(form.meeting_date).toISOString() : null,
      location: form.location || null,
      // Same array persistence as before — only the input UX changed.
      regulator_attendees: regulatorAttendees,
      entity_attendees: entityAttendees,
      matters_discussed: form.matters_discussed || null,
      entity_initial_response: form.entity_initial_response || null,
      agreed_timelines: form.agreed_timelines || null,
      recorded_by: data?.recorded_by ?? auth?.user?.id ?? null,
    });
  };

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Exit meeting</CardTitle>
        <p className="text-xs text-muted-foreground">
          {engagementPhrasing('Record what was discussed with the entity at the close of fieldwork.', engagement)}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="meeting_date">Meeting date &amp; time</Label>
            <Input id="meeting_date" type="datetime-local" disabled={readOnly} value={form.meeting_date}
              onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input id="location" disabled={readOnly} value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="reg_attendees">Regulator attendees</Label>
            <ChipsInput id="reg_attendees" value={regulatorAttendees} onChange={setRegulatorAttendees}
              disabled={readOnly} placeholder="Add a name and press Enter" />
          </div>
          <div>
            <Label htmlFor="ent_attendees">Entity attendees</Label>
            <ChipsInput id="ent_attendees" value={entityAttendees} onChange={setEntityAttendees}
              disabled={readOnly} placeholder="Add a name and press Enter" />
          </div>
        </div>
        <div>
          <Label htmlFor="matters">Matters discussed</Label>
          <Textarea id="matters" rows={3} disabled={readOnly} value={form.matters_discussed}
            onChange={e => setForm(f => ({ ...f, matters_discussed: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="initial_response">Entity's initial response</Label>
          <Textarea id="initial_response" rows={3} disabled={readOnly} value={form.entity_initial_response}
            onChange={e => setForm(f => ({ ...f, entity_initial_response: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="timelines">Agreed timelines</Label>
          <Textarea id="timelines" rows={2} disabled={readOnly} value={form.agreed_timelines}
            onChange={e => setForm(f => ({ ...f, agreed_timelines: e.target.value }))} />
        </div>
        {!readOnly && <StageActions mode={mode} beforeAdvance={persist} />}
      </CardContent>
    </Card>
  );
}
