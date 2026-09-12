/**
 * Decision Letter & License Certificate Preview
 *
 * Lets an approver see the exact decision letter wording and a draft (watermarked)
 * licence certificate BEFORE the decision is committed. Read-only:
 *  - letter wording comes from `correspondence_templates` (category `decision_letter`)
 *    with `{{token}}` substitution — no dispatch, no record written
 *  - the certificate PDF is rendered by the `preview-decision-documents` edge
 *    function and never stored; the real certificate is still produced only after
 *    the licence is issued.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { renderRationaleTemplate } from '@/hooks/useDecisionOptions';
import { renderLicenseCertificateHtml } from '@/lib/licensing/decisionDocuments';
import { resolveDecisionRationale, type DecisionActionRationale } from '@/lib/licensing/decisionRationale';
import { useSiteSettings } from '@/contexts/SiteSettingsContext';
import { useRegulator } from '@/contexts/RegulatorContext';
import { useLicenseExpiryConfig } from '@/hooks/useLicenseExpiryConfig';

import { toast } from 'sonner';
import { Copy, Download, FileText, Info, Loader2, Printer, Stamp } from 'lucide-react';

interface LetterTemplate {
  id: string;
  code: string;
  name: string;
  subject: string | null;
  body: string;
}

interface ArtifactRow {
  id: string;
  artifact_type: string;
  version: number;
  decision: string | null;
  issued_at: string;
  effective_date: string | null;
  expiry_date: string | null;
}


interface Props {
  applicationId: string;
  applicationNumber: string;
  applicantName: string;
  licenseType: string;
  submittedAt: string | null;
  defaultRationale?: string | null;
  /** Application status — certificate surfaces are gated on this. */
  applicationStatus?: string | null;
  sectorId?: string | null;
  subSectorId?: string | null;
  categoryId?: string | null;
}


const OUTCOMES: Array<{ value: string; label: string; templateCode: string; certificate: boolean }> = [
  { value: 'approve', label: 'Approval', templateCode: 'DEC_LETTER_APPROVAL', certificate: true },
  { value: 'conditional_approve', label: 'Approval with conditions', templateCode: 'DEC_LETTER_CONDITIONAL', certificate: true },
  { value: 'reject', label: 'Rejection', templateCode: 'DEC_LETTER_REJECTION', certificate: false },
  { value: 'return', label: 'Request resubmission', templateCode: 'DEC_LETTER_RESUBMISSION', certificate: false },
  { value: 'defer', label: 'Deferral', templateCode: 'DEC_LETTER_DEFERRAL', certificate: false },
];

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

export function DecisionDocumentPreview({
  applicationId,
  applicationNumber,
  applicantName,
  licenseType,
  submittedAt,
  defaultRationale,
  applicationStatus,
  sectorId,
  subSectorId,
  categoryId,
}: Props) {
  const { general, branding } = useSiteSettings();
  const { activeRegulator } = useRegulator();
  const { data: expiryConfig } = useLicenseExpiryConfig();


  const [templates, setTemplates] = useState<LetterTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [outcome, setOutcome] = useState<string>('approve');
  const [templateId, setTemplateId] = useState<string>('');
  const [rationale, setRationale] = useState<string>(defaultRationale ?? '');
  const [conditions, setConditions] = useState<string>('');
  const [signatory, setSignatory] = useState<{ name: string; title: string } | null>(null);
  const [effectiveDate, setEffectiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  /** Expiry stored on the issued licence (authoritative), when one exists. */
  const [licenseValidUntil, setLicenseValidUntil] = useState<string | null>(null);

  const normalizedStatus = (applicationStatus ?? '').toLowerCase();
  const isApproved = normalizedStatus === 'approved';
  const isRejected = ['rejected', 'withdrawn', 'cancelled', 'declined'].includes(normalizedStatus);

  /**
   * Expiry is never entered by staff — the backend derives valid_until from the
   * licence validity configuration when the licence is created. We mirror the
   * same rule here so the preview matches what will be issued.
   */
  const validityDays = expiryConfig
    ? expiryConfig.resolveFor({
        sector_id: sectorId ?? null,
        sub_sector_id: subSectorId ?? null,
        category_id: categoryId ?? null,
      }).period_days
    : null;

  const computedExpiry = (() => {
    if (licenseValidUntil) return licenseValidUntil.slice(0, 10);
    if (!effectiveDate || !validityDays) return '';
    const d = new Date(`${effectiveDate}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + validityDays);
    return d.toISOString().slice(0, 10);
  })();
  const expiryDate = computedExpiry;


  const [certBusy, setCertBusy] = useState(false);
  const [certUrl, setCertUrl] = useState<string | null>(null);
  const [certFilename, setCertFilename] = useState<string>('draft-certificate.pdf');
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);


  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: tpls }, { data: sig }] = await Promise.all([
        supabase
          .from('correspondence_templates' as any)
          .select('id, code, name, subject, body')
          .eq('category', 'decision_letter')
          .eq('is_active', true)
          .order('code'),
        supabase.from('site_settings' as any).select('value').eq('key', 'license_certificate_signatory').maybeSingle(),
      ]);
      if (!alive) return;
      setTemplates(((tpls as any[]) ?? []) as LetterTemplate[]);
      const sv = (sig as any)?.value ?? null;
      if (sv?.is_active && sv?.name && sv?.title) setSignatory({ name: String(sv.name), title: String(sv.title) });
      setLoadingTemplates(false);
    })();
    return () => { alive = false; };
  }, []);

  // Older workflow versions stored the final determination remarks only on
  // approval_actions. Restore that recorded rationale when the canonical
  // application field is empty so historical letters remain issuable.
  useEffect(() => {
    let cancelled = false;
    const canonical = resolveDecisionRationale(defaultRationale, []);
    setRationale(canonical);
    setMissing([]);
    if (canonical) return () => { cancelled = true; };

    (async () => {
      const { data, error } = await supabase
        .from('approval_actions' as any)
        .select('action, action_type, comments, created_at')
        .eq('application_id', applicationId)
        .not('comments', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);
      if (cancelled) return;
      if (error) {
        console.warn('Unable to restore historical decision rationale', error.message);
        return;
      }
      setRationale(resolveDecisionRationale(null, ((data as any[]) ?? []) as DecisionActionRationale[]));
    })();

    return () => { cancelled = true; };
  }, [applicationId, defaultRationale]);

  // Auto-select the template that matches the chosen outcome.
  useEffect(() => {
    if (templates.length === 0) return;
    const wanted = OUTCOMES.find((o) => o.value === outcome)?.templateCode;
    const match = templates.find((t) => t.code === wanted) ?? templates[0];
    setTemplateId(match.id);
  }, [outcome, templates]);

  useEffect(() => { setCertUrl(null); }, [outcome, applicationId]);
  useEffect(() => () => { if (certUrl) URL.revokeObjectURL(certUrl); }, [certUrl]);

  const template = templates.find((t) => t.id === templateId) ?? null;
  const outcomeMeta = OUTCOMES.find((o) => o.value === outcome)!;

  const vars = useMemo(() => ({
    application_number: applicationNumber || '—',
    applicant_name: applicantName || '—',
    license_type: licenseType || '—',
    submitted_date: fmtDate(submittedAt),
    decision_date: fmtDate(new Date().toISOString()),
    rationale: rationale.trim() || '[Decision rationale to be recorded]',
    conditions: conditions.trim()
      ? conditions.split('\n').filter((l) => l.trim()).map((l, i) => `${i + 1}. ${l.trim()}`).join('\n')
      : '[Conditions to be specified]',
    signatory_name: signatory?.name || '[Authorised signatory not configured]',
    signatory_title: signatory?.title || '',
    regulator_name: activeRegulator?.name || general?.org_name || branding?.site_name || 'Regulatory Authority',
  }), [applicationNumber, applicantName, licenseType, submittedAt, rationale, conditions, signatory, activeRegulator, general, branding]);

  const letterSubject = template?.subject ? renderRationaleTemplate(template.subject, vars) : '';
  const letterBody = template?.body ? renderRationaleTemplate(template.body, vars) : '';

  const letterHtml = useMemo(() => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(letterSubject || 'Decision letter')}</title>
<style>
 body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:48px auto;padding:0 32px;color:#111;line-height:1.6}
 .hdr{border-bottom:3px solid #1E3A8A;padding-bottom:12px;margin-bottom:28px}
 .hdr h1{font-size:18px;margin:0;color:#1E3A8A;letter-spacing:.5px}
 .hdr p{margin:4px 0 0;font-size:12px;color:#555}
 .subject{font-weight:bold;margin-bottom:20px}
 pre{font-family:inherit;white-space:pre-wrap;margin:0}
 .draft{margin-top:36px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:10px}
</style></head><body>
 <div class="hdr"><h1>${esc(vars.regulator_name.toUpperCase())}</h1><p>${esc(general?.address || '')}</p></div>
 <p>${esc(fmtDate(new Date().toISOString()))}</p>
 ${letterSubject ? `<p class="subject">${esc(letterSubject)}</p>` : ''}
 <pre>${esc(letterBody)}</pre>
 <div class="draft">DRAFT PREVIEW — generated for internal review of application ${esc(applicationNumber)}. Not a served determination.</div>
</body></html>`;
  }, [letterSubject, letterBody, vars, general, applicationNumber]);

  /**
   * Certificate-specific rendered content (LIC-DEC-002). This is what gets
   * persisted when a licence certificate is issued — never the letter markup.
   */
  const certificateHtml = useMemo(
    () =>
      renderLicenseCertificateHtml({
        regulatorName: vars.regulator_name,
        regulatorAddress: general?.address ?? null,
        entityName: applicantName || '—',
        applicationNumber: applicationNumber || '—',
        licenseReference: applicationNumber || null,
        licenseType: licenseType || '—',
        decisionLabel: outcomeMeta.label,
        effectiveDate: effectiveDate,
        expiryDate: expiryDate || null,
        conditions: conditions.split('\n').map((l) => l.trim()).filter(Boolean),
        signatoryName: signatory?.name ?? null,
        signatoryTitle: signatory?.title ?? null,
      }),
    [vars.regulator_name, general?.address, applicantName, applicationNumber, licenseType, outcomeMeta.label, effectiveDate, expiryDate, conditions, signatory]
  );

  function printLetter() {
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { toast.error('Allow pop-ups to print the letter preview'); return; }
    w.document.write(letterHtml);
    w.document.close();
    w.focus();
  }

  function downloadLetter() {
    const blob = new Blob([letterHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decision-letter-${applicationNumber || applicationId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printCertificate() {
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { toast.error('Allow pop-ups to print the certificate preview'); return; }
    w.document.write(renderLicenseCertificateHtml({
      regulatorName: vars.regulator_name,
      regulatorAddress: general?.address ?? null,
      entityName: applicantName || '—',
      applicationNumber: applicationNumber || '—',
      licenseReference: applicationNumber || null,
      licenseType: licenseType || '—',
      decisionLabel: outcomeMeta.label,
      effectiveDate,
      expiryDate: expiryDate || null,
      conditions: conditions.split('\n').map((l) => l.trim()).filter(Boolean),
      signatoryName: signatory?.name ?? null,
      signatoryTitle: signatory?.title ?? null,
      draft: true,
    }));
    w.document.close();
    w.focus();
  }

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(`${letterSubject}\n\n${letterBody}`);
      toast.success('Letter copied to clipboard');
    } catch {
      toast.error('Clipboard unavailable');
    }
  }


  async function buildCertificate() {
    setCertBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('preview-decision-documents', {
        body: {
          application_id: applicationId,
          outcome,
          conditions: conditions.split('\n').map((l) => l.trim()).filter(Boolean),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const b64 = (data as any).pdf_base64 as string;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      if (certUrl) URL.revokeObjectURL(certUrl);
      setCertUrl(URL.createObjectURL(blob));
      setCertFilename((data as any).filename || 'draft-certificate.pdf');
    } catch (e: any) {
      toast.error(`Certificate preview failed: ${e.message ?? e}`);
    } finally {
      setCertBusy(false);
    }
  }

  // ---- LIC-DEC-002 — immutable issuance ---------------------------------
  async function loadArtifacts() {
    const { data } = await supabase
      .from('decision_artifacts' as any)
      .select('id, artifact_type, version, decision, issued_at, effective_date, expiry_date')
      .eq('application_id', applicationId)
      .order('issued_at', { ascending: false });
    setArtifacts(((data as any[]) ?? []) as ArtifactRow[]);
  }

  useEffect(() => { void loadArtifacts();   }, [applicationId]);

  // Mirror the licence's own expiry once it exists — staff never set it by hand.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('licenses' as any)
        .select('valid_until')
        .eq('application_id', applicationId)
        .order('issued_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setLicenseValidUntil((data as any)?.valid_until ?? null);
    })();
    return () => { cancelled = true; };
  }, [applicationId]);


  async function issue(artifactType: 'decision_letter' | 'license_certificate') {
    const issuanceRationale = rationale.trim();
    if (artifactType === 'decision_letter' && !issuanceRationale) {
      setMissing(['rationale']);
      toast.error('Add the grounds for this determination before recording the letter');
      return;
    }
    setIssuing(artifactType);
    setMissing([]);
    try {
      const { data, error } = await supabase.rpc('issue_decision_artifact' as any, {
        _application_id: applicationId,
        _artifact_type: artifactType,
        _rendered_html: artifactType === 'decision_letter' ? letterHtml : certificateHtml,
        _merge_data: {
          application_number: applicationNumber,
          applicant_name: applicantName,
          license_type: licenseType,
          submitted_at: submittedAt,
          template_code: template?.code ?? null,
          signatory: signatory ?? null,
          regulator_name: vars.regulator_name,
          ...(artifactType === 'license_certificate'
            ? { effective_date: effectiveDate, expiry_date: expiryDate || null, license_reference: applicationNumber }
            : {}),
        } as any,
        _decision: outcome,
        _template_id: artifactType === 'decision_letter' ? (templateId || null) : null,
        _template_version: null,
        _rationale: issuanceRationale || null,
        _conditions: conditions.split('\n').map((l) => l.trim()).filter(Boolean) as any,
        _issuing_regulator_id: activeRegulator?.id ?? null,
        _effective_date: artifactType === 'license_certificate' ? (effectiveDate || null) : null,
        _expiry_date: artifactType === 'license_certificate' ? (expiryDate || null) : null,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.success === false) {
        setMissing((res.missing ?? []) as string[]);
        toast.error('Issuance blocked — required fields are missing');
        return;
      }
      toast.success(`Recorded ${artifactType.replace('_', ' ')} v${res.version} (immutable)`);
      await loadArtifacts();
    } catch (e: any) {
      toast.error(`Issuance failed: ${e.message ?? e}`);
    } finally {
      setIssuing(null);
    }
  }


  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Decision Letter &amp; Certificate Preview
        </CardTitle>
        <CardDescription>
          Preview the determination letter and the draft licence certificate before recording the decision.
          Nothing here is served, dispatched or stored.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Intended outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Letter template</Label>
            <Select value={templateId} onValueChange={setTemplateId} disabled={loadingTemplates || templates.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={loadingTemplates ? 'Loading…' : 'No decision letter templates'} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Grounds / rationale</Label>
            <Textarea rows={4} value={rationale} onChange={(e) => setRationale(e.target.value)}
              placeholder="Grounds for the determination as they will appear in the letter…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Conditions <span className="text-muted-foreground">(one per line)</span></Label>
            <Textarea rows={4} value={conditions} onChange={(e) => setConditions(e.target.value)}
              placeholder={'Submit audited accounts within 90 days\nMaintain minimum capital of …'} />
          </div>
        </div>

        {!loadingTemplates && templates.length === 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              No decision letter templates are configured. Add templates under Admin → Correspondence Templates
              with category <span className="font-mono">decision_letter</span>.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="letter">
          <TabsList>
            <TabsTrigger value="letter">Decision letter</TabsTrigger>
            <TabsTrigger value="certificate">Licence certificate</TabsTrigger>
          </TabsList>

          <TabsContent value="letter" className="mt-3 space-y-3">
            {template ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button data-rbac="application_management.view" size="sm" variant="outline" onClick={printLetter}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
                  <Button data-rbac="application_management.view" size="sm" variant="outline" onClick={downloadLetter}><Download className="h-4 w-4 mr-1.5" />Download</Button>

                  <Button size="sm" variant="ghost" onClick={copyLetter}><Copy className="h-4 w-4 mr-1.5" />Copy text</Button>
                </div>
                <div className="rounded-md border border-border/60 bg-card">
                  {letterSubject && (
                    <div className="border-b border-border/60 px-4 py-2 text-sm font-medium">{letterSubject}</div>
                  )}
                  <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap px-4 py-3 font-serif text-sm leading-relaxed">
                    {letterBody}
                  </pre>
                </div>
                <p className="text-xs text-muted-foreground">
                  Draft preview only — the letter is served through the correspondence workflow once the decision is recorded.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a letter template to preview the wording.</p>
            )}
          </TabsContent>

          <TabsContent value="certificate" className="mt-3 space-y-3">
            {isRejected ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  No licence certificate is issued for a rejected application.
                </AlertDescription>
              </Alert>
            ) : !isApproved ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  The licence certificate becomes available once this application is approved and the licence is
                  issued.
                </AlertDescription>
              </Alert>
            ) : !outcomeMeta.certificate ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  A licence certificate is only issued for approval outcomes. Switch the intended outcome to
                  “Approval” or “Approval with conditions” to preview the certificate.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Effective date</Label>
                    <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Expiry date</Label>
                    <Input type="date" value={expiryDate} disabled readOnly />
                    <p className="text-xs text-muted-foreground">
                      {licenseValidUntil
                        ? 'Taken from the issued licence.'
                        : validityDays
                          ? `Set automatically on approval from the licence validity configuration (${validityDays} days).`
                          : 'Set automatically on approval from the licence validity configuration.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={buildCertificate} disabled={certBusy}>
                    {certBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Stamp className="h-4 w-4 mr-1.5" />}
                    {certUrl ? 'Regenerate draft PDF' : 'Generate draft PDF'}
                  </Button>
                  <Button data-rbac="application_management.view" size="sm" variant="outline" onClick={printCertificate}>
                    <Printer className="h-4 w-4 mr-1.5" />Print certificate
                  </Button>
                  {certUrl && (
                    <Button data-rbac="application_management.view" size="sm" variant="outline" asChild>
                      <a href={certUrl} download={certFilename}><Download className="h-4 w-4 mr-1.5" />Download PDF</a>
                    </Button>
                  )}

                  <Badge variant="outline">Watermarked · not stored</Badge>
                  {!signatory && <Badge variant="outline">Signatory not configured</Badge>}
                </div>
                <iframe
                  title="Licence certificate content preview"
                  srcDoc={certificateHtml}
                  className="h-[420px] w-full rounded-md border border-border/60 bg-card"
                />

                {certUrl && (
                  <iframe
                    title="Draft licence certificate PDF preview"
                    src={certUrl}
                    className="h-[520px] w-full rounded-md border border-border/60 bg-muted/20"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  The content above is exactly what is stored when the certificate is issued. The PDF draft is
                  watermarked and never stored.
                </p>

              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Immutable issuance record (LIC-DEC-002) */}
        <div className="space-y-3 rounded-md border border-border/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Issued artefacts</p>
              <p className="text-xs text-muted-foreground">
                Recording an artefact stores an immutable version with the rendered document, merge data,
                rationale and conditions. Later template edits create new versions only.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button data-rbac="application_management.approve" size="sm" variant="outline" disabled={issuing !== null}
                onClick={() => issue('decision_letter')}>
                {issuing === 'decision_letter' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
                Record decision letter
              </Button>
              {isApproved && outcomeMeta.certificate && (
                <Button data-rbac="application_management.approve" size="sm" variant="outline" disabled={issuing !== null}
                  onClick={() => issue('license_certificate')}>

                  {issuing === 'license_certificate' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Stamp className="h-4 w-4 mr-1.5" />}
                  Record certificate
                </Button>
              )}
            </div>
          </div>

          {missing.length > 0 && (
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Issuance blocked — missing required merge fields: {missing.join(', ')}.
              </AlertDescription>
            </Alert>
          )}

          {artifacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No artefacts issued for this application yet.</p>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {artifacts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="font-medium">
                    {a.artifact_type === 'decision_letter' ? 'Decision letter' : 'Licence certificate'} · v{a.version}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.decision ? `${a.decision} · ` : ''}issued {fmtDate(a.issued_at)}
                    {a.effective_date ? ` · effective ${fmtDate(a.effective_date)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

      </CardContent>
    </Card>
  );
}

export default DecisionDocumentPreview;
