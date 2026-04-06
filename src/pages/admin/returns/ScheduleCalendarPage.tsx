import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useReturnDueDates } from '@/hooks/useReturnsManagement';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isSameMonth } from 'date-fns';

export default function ScheduleCalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const year = currentMonth.getFullYear();
  const { data: dueDates = [], isLoading } = useReturnDueDates({ year });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const dateMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    dueDates.forEach(d => {
      const key = d.due_date;
      if (!map[key]) map[key] = [];
      map[key].push(d);
    });
    return map;
  }, [dueDates]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Return Schedule Calendar" description="Visual calendar of all return due dates" />
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-5 w-5" /></Button>
              <h3 className="text-lg font-semibold">{format(currentMonth, 'MMMM yyyy')}</h3>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-5 w-5" /></Button>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
                  {days.map(day => {
                    const key = format(day, 'yyyy-MM-dd');
                    const items = dateMap[key] || [];
                    const isToday = isSameDay(day, new Date());
                    return (
                      <div key={key} className={`min-h-[80px] border rounded-md p-1 cursor-pointer hover:bg-muted/50 ${isToday ? 'border-primary bg-primary/5' : ''} ${selectedDate === key ? 'ring-2 ring-primary' : ''}`}
                        onClick={() => setSelectedDate(key)}>
                        <span className={`text-xs font-medium ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</span>
                        {items.length > 0 && (
                          <div className="mt-1">
                            <Badge variant="default" className="text-[10px] px-1 py-0">{items.length} due</Badge>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {selectedDate && dateMap[selectedDate] && (
                  <div className="mt-4 p-3 border rounded-lg bg-muted/30 space-y-2">
                    <p className="text-sm font-semibold">Due on {selectedDate}</p>
                    {dateMap[selectedDate].map((d, i) => (
                      <div key={i} className="text-sm flex justify-between">
                        <span>{d.licensees?.name || 'Entity'} — {d.return_configs?.name || 'Return'}</span>
                        <span className="text-muted-foreground">{d.return_period}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
