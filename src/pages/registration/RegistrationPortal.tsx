import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  FileText, CheckCircle2, Clock, Layers, LogOut, Save,
} from 'lucide-react';

interface Registration {
  id: string;
  sector_id: string;
  sub_sector_id: string;
  category_id: string;
  applicant_name: string;
  status: string;
}

interface MatchedForm {
  id: string;
  name: string;
  description: string | null;
  sector: string;
  category: string;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
}

interface FormSubmission {
  id: string;
  form_id: string;
  status: string;
  updated_at: string;
}

export default function RegistrationPortal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Email/resubmission links may carry exact identifiers. We honour them when
  // present and ALWAYS verify the row belongs to the logged-in user before
  // loading any data (defence against tampered links).
  const registrationParam = searchParams.get('registration');
  const submissionParam = searchParams.get('submission');
  const { user, logout, session, loading: authLoading } = useAuth();
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [forms, setForms] = useState<MatchedForm[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      navigate('/');
      return;
    }
    loadData();
  }, [session, authLoading, registrationParam, submissionParam]);

  async function loadData() {
    setLoading(true);
    try {
      const userId = session!.user.id;
      let regData: Registration | null = null;

      // 1. Honour explicit registration id from the email/resubmission link,
      //    but verify ownership before trusting it.
      if (registrationParam) {
        const { data } = await supabase
          .from('registrations')
          .select('*')
          .eq('id', registrationParam)
          .maybeSingle();
        if (data && (data as any).user_id === userId) {
          regData = data as Registration;
        }
      }

      // 2. Fallback to the user's most recent registration.
      if (!regData) {
        const { data } = await supabase
          .from('registrations')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) regData = data as Registration;
      }

      if (!regData) {
        toast.error('No registration found. Please register first.');
        navigate('/register');
        return;
      }

      setRegistration(regData as Registration);


      // Fetch published pre-license form_templates matching the registration
      const { data: templatesData } = await supabase
        .from('form_templates')
        .select('id, name, description, sector, category, sector_id, sub_sector_id, category_id')
        .eq('form_type', 'pre_license')
        .eq('status', 'published');

      const allTemplates = (templatesData || []) as MatchedForm[];
      const reg = regData as Registration;

      // Filter by category_id > sub_sector_id > sector_id > all
      let matched = allTemplates.filter(t => t.category_id === reg.category_id);
      if (matched.length === 0) {
        matched = allTemplates.filter(t => t.sub_sector_id === reg.sub_sector_id && !t.category_id);
      }
      if (matched.length === 0) {
        matched = allTemplates.filter(t => t.sector_id === reg.sector_id && !t.sub_sector_id && !t.category_id);
      }
      if (matched.length === 0) {
        // Fallback: show all published pre-license forms with no sector filter
        matched = allTemplates.filter(t => !t.sector_id && !t.sub_sector_id && !t.category_id);
      }

      setForms(matched);

      // Fetch existing submissions (newest first so we always continue the latest row)
      const { data: subsData } = await supabase
        .from('registration_form_submissions')
        .select('*')
        .eq('registration_id', regData.id)
        .order('updated_at', { ascending: false });

      setSubmissions((subsData || []) as FormSubmission[]);
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Pick the latest submission for a form, preferring statuses that indicate
  // an active edit cycle (resubmission requested, draft, etc.) over completed ones.
  const STATUS_PRIORITY: Record<string, number> = {
    resubmission_requested: 0,
    needs_changes: 0,
    rejected: 1,
    draft: 2,
    submitted: 3,
    under_review: 3,
    completed: 4,
  };
  function getSubmissionForForm(formId: string) {
    const matches = submissions.filter(s => s.form_id === formId);
    if (matches.length === 0) return undefined;
    return [...matches].sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 5;
      const pb = STATUS_PRIORITY[b.status] ?? 5;
      if (pa !== pb) return pa - pb;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })[0];
  }


  async function handleOpenForm(formId: string) {
    if (!registration) return;

    // Honour an explicit ?submission=<id> from the email link first — but only
    // if it belongs to this form & this user (verified via the loaded list).
    const linkSubmission = submissionParam
      ? submissions.find(s => s.id === submissionParam && s.form_id === formId)
      : undefined;
    const existing = linkSubmission ?? getSubmissionForForm(formId);
    const baseQuery = `registration=${registration.id}`;

    if (existing) {
      navigate(`/registration/portal/form/${formId}?${baseQuery}&submission=${existing.id}`);
      return;
    }

    const { data, error } = await supabase
      .from('registration_form_submissions')
      .insert({
        registration_id: registration.id,
        user_id: session!.user.id,
        form_id: formId,
        form_data: {},
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to start form. Please try again.');
      return;
    }

    navigate(`/registration/portal/form/${formId}?${baseQuery}&submission=${data.id}`);
  }

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="hero-gradient text-primary-foreground py-6 px-4">
          <div className="max-w-5xl mx-auto">
            <Skeleton className="h-8 w-64 bg-primary-foreground/20" />
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Draft</Badge>;
      case 'completed':
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="hero-gradient text-primary-foreground py-6 px-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
              <Layers className="h-5 w-5 text-secondary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Registration Portal</h1>
              <p className="text-sm text-primary-foreground/70">
                {registration?.applicant_name || user?.fullName}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Registration Status: Pending</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Please complete all required forms below. You can save your progress and return anytime by logging in with your email and password.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Forms List */}
      <div className="max-w-5xl mx-auto px-4 pb-12 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Required Forms</h2>

        {forms.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                No forms are currently published for your registration category. Please check back later.
              </p>
            </CardContent>
          </Card>
        ) : (
          forms.map(form => {
            const submission = getSubmissionForForm(form.id);
            return (
              <Card key={form.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{form.name}</CardTitle>
                    {submission ? statusBadge(submission.status) : (
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" /> Not Started
                      </Badge>
                    )}
                  </div>
                  {form.description && (
                    <CardDescription>{form.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {submission
                        ? `Last saved: ${new Date(submission.updated_at).toLocaleDateString()}`
                        : 'Click to start filling this form'}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => handleOpenForm(form.id)}
                    >
                      {submission ? (
                        <>
                          <Save className="h-4 w-4 mr-1" />
                          Continue
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-1" />
                          Start
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
