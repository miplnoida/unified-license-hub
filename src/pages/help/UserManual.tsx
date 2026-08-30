/**
 * In-application User Manual & Demo Playbook (/help/user-manual).
 *
 * Rendered ENTIRELY from the canonical documentation registry in
 * `src/content/user-manual/*`. This page contains no regulatory logic, performs
 * no writes and duplicates no content — if something is wrong here, the registry
 * is corrected and the generated markdown is regenerated.
 *
 * Documentation visibility (`internal` / `external` / `any`) is a presentation
 * courtesy so external portal users are not shown internal supervisory,
 * enforcement, AI-governance or demo material. Real access control remains the
 * platform's routes, RBAC and RLS.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BookOpen, Printer, Search, ChevronLeft, ChevronRight, Camera, CameraOff,
  ShieldAlert, Sparkles, Users, Route as RouteIcon, ListChecks, Presentation,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { INTERNAL_ROLES } from '@/types/platform';
import {
  MANUAL_META, CERTIFIED_MODULES,
  PERSONAS, PROCESS_SECTIONS, NARRATIVE_SECTIONS,
  ENTITY_360_SECTIONS, E360_GROUP_DOCS,
  AI_SURFACES, AI_SURFACE_CENSUS, AUTOMATION_CLASSIFICATION, AI_MUST_NOT_CLAIM, AI_DEMO_SCENARIOS,
  JOURNEYS, DEMO_SCRIPTS, SCREENSHOT_BY_ID,
} from '@/content/user-manual';
import type {
  ManualAudience, NarrativeSection, PersonaDoc, ProcessSection, ScreenshotEntry,
} from '@/content/user-manual/types';

type TabKey = 'overview' | 'personas' | 'processes' | 'entity360' | 'ai' | 'journeys' | 'demo';

const TABS: { key: TabKey; label: string; icon: React.ReactNode; internalOnly?: boolean }[] = [
  { key: 'overview', label: 'Overview', icon: <BookOpen className="h-4 w-4" /> },
  { key: 'personas', label: 'Roles & personas', icon: <Users className="h-4 w-4" /> },
  { key: 'processes', label: 'Processes', icon: <ListChecks className="h-4 w-4" /> },
  { key: 'entity360', label: 'Entity 360', icon: <RouteIcon className="h-4 w-4" />, internalOnly: true },
  { key: 'ai', label: 'AI & human control', icon: <Sparkles className="h-4 w-4" />, internalOnly: true },
  { key: 'journeys', label: 'Journeys A–F', icon: <RouteIcon className="h-4 w-4" /> },
  { key: 'demo', label: 'Demo playbook', icon: <Presentation className="h-4 w-4" />, internalOnly: true },
];

function visible(audience: ManualAudience | undefined, isInternal: boolean) {
  if (!audience || audience === 'any') return true;
  return audience === 'internal' ? isInternal : true;
}

function haystack(...parts: unknown[]): string {
  return JSON.stringify(parts).toLowerCase();
}

/* ------------------------------------------------------------------ pieces */

function Shot({ id }: { id: string }) {
  const shot: ScreenshotEntry | undefined = SCREENSHOT_BY_ID[id];
  if (!shot) return null;
  const captured = !!shot.file && shot.status !== 'NEEDS_CAPTURE';
  return (
    <figure className="rounded-lg border bg-muted/30 p-2">
      {captured ? (
        <img
          src={shot.file}
          alt={shot.caption}
          loading="lazy"
          className="w-full rounded border bg-background"
        />
      ) : (
        <div className="flex items-start gap-3 rounded border border-dashed bg-background p-4 text-sm text-muted-foreground">
          <CameraOff className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium text-foreground">Screenshot not captured (NEEDS_CAPTURE)</p>
            <p>{shot.needsCaptureReason ?? 'Capture pending.'}</p>
          </div>
        </div>
      )}
      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Camera className="h-3 w-3" />
        <span>{shot.caption}</span>
        <Badge variant="outline" className="font-mono text-[10px]">{shot.route}</Badge>
        <Badge variant="secondary" className="text-[10px]">{shot.status}</Badge>
      </figcaption>
    </figure>
  );
}

function Shots({ ids }: { ids?: string[] }) {
  if (!ids?.length) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {ids.map((id) => <Shot key={id} id={id} />)}
    </div>
  );
}

function Bullets({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {items.map((i, n) => <li key={n}>{i}</li>)}
      </ul>
    </div>
  );
}

function Pairs({ title, rows }: { title: string; rows?: { k: string; v: string }[] }) {
  if (!rows?.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <dl className="mt-1 space-y-1 text-sm">
        {rows.map((r, n) => (
          <div key={n} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <dt className="min-w-[14rem] font-medium">{r.k}</dt>
            <dd className="text-muted-foreground">{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SectionShell({
  id, title, meta, children,
}: { id: string; title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24 break-inside-avoid">
      <CardHeader className="gap-2">
        <CardTitle className="text-xl">{title}</CardTitle>
        {meta}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function ProcessBody({ s }: { s: ProcessSection }) {
  return (
    <>
      <p className="text-sm">{s.purpose}</p>
      <div className="flex flex-wrap gap-2">
        {s.whereToStart.map((l) => (
          <Badge key={l.route} variant="outline" className="font-mono text-[10px]">{l.label} — {l.route}</Badge>
        ))}
      </div>
      <Bullets title="Who is involved" items={s.actors} />
      <Bullets title="Before you start" items={s.preconditions} />
      <Bullets title="How the process runs" items={s.processFlow} />
      <Pairs title="Status meanings" rows={s.statusLifecycle.map((x) => ({ k: x.status, v: x.meaning }))} />
      <Pairs title="What you can do, and what happens" rows={s.userActions.map((x) => ({ k: x.action, v: x.effect }))} />
      <Pairs
        title="Controls"
        rows={[
          { k: 'Maker–checker', v: s.makerChecker },
          { k: 'AI involvement', v: `${s.aiInvolvement}${s.aiNote ? ` — ${s.aiNote}` : ''}` },
        ]}
      />
      <Bullets title="Notifications" items={s.notifications} />
      <Bullets title="SLA and escalation" items={s.slaEscalation} />
      <Bullets title="Evidence retained" items={s.evidence} />
      <Bullets title="Audit trail" items={s.audit} />
      <Bullets title="Exceptions and edge cases" items={s.exceptions} />
      <Bullets title="Demo notes" items={s.demoNotes} />
      <Shots ids={s.screenshots} />
    </>
  );
}

function NarrativeBody({ s }: { s: NarrativeSection }) {
  return (
    <>
      {s.body.map((b, n) => (
        <div key={n} className="space-y-2">
          {b.heading && <h4 className="text-sm font-semibold">{b.heading}</h4>}
          {b.paragraphs?.map((p, i) => <p key={i} className="text-sm text-muted-foreground">{p}</p>)}
          {b.bullets?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {b.bullets.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          ) : null}
        </div>
      ))}
      {s.links?.length ? (
        <div className="flex flex-wrap gap-2">
          {s.links.map((l) => (
            <Badge key={l.route} variant="outline" className="font-mono text-[10px]">{l.label} — {l.route}</Badge>
          ))}
        </div>
      ) : null}
      <Shots ids={s.screenshots} />
    </>
  );
}

function PersonaBody({ p }: { p: PersonaDoc }) {
  return (
    <>
      <p className="text-sm">{p.purpose}</p>
      <Pairs
        title="At a glance"
        rows={[
          { k: 'Platform roles', v: p.roles.join(', ') },
          { k: 'Starting screen', v: `${p.startingDashboard.label} (${p.startingDashboard.route})` },
          { k: 'Main menu', v: p.mainMenu.join(' · ') },
          { k: 'Maker–checker position', v: p.makerChecker },
        ]}
      />
      <Bullets title="Responsibilities" items={p.responsibilities} />
      <Bullets title="Can do" items={p.canDo} />
      <Bullets title="Cannot do" items={p.cannotDo} />
      <Bullets title="Typical day" items={p.dailyWorkflow} />
      <Bullets title="Work queues" items={p.workQueue} />
      <Bullets title="Useful reports" items={p.usefulReports} />
      <Bullets title="Access" items={p.access} />
      <Bullets title="Enforced by (server contracts)" items={p.enforcedBy} />
    </>
  );
}

/* -------------------------------------------------------------------- page */

export default function UserManual() {
  const { user } = useAuth();
  const isInternal = !!user && INTERNAL_ROLES.includes(user.role);
  const location = useLocation();

  const [tab, setTab] = useState<TabKey>('overview');
  const [query, setQuery] = useState('');
  const [persona, setPersona] = useState<string>('all');
  const [module, setModule] = useState<string>('all');
  const [printView, setPrintView] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const tabs = useMemo(() => TABS.filter((t) => !t.internalOnly || isInternal), [isInternal]);

  const personas = useMemo(
    () => PERSONAS.filter((p) => visible(p.audience, isInternal)),
    [isInternal],
  );

  const processes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROCESS_SECTIONS
      .filter((s) => visible(s.audience, isInternal))
      .filter((s) => module === 'all' || s.module === module)
      .filter((s) => persona === 'all' || haystack(s.actors, s.demoNotes, s.processFlow).includes(persona.replace(/_/g, ' ')) || s.audience === 'any')
      .filter((s) => !q || haystack(s).includes(q));
  }, [query, module, persona, isInternal]);

  const narratives = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NARRATIVE_SECTIONS
      .filter((s) => visible(s.audience, isInternal))
      .filter((s) => !q || haystack(s).includes(q));
  }, [query, isInternal]);

  const e360 = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ENTITY_360_SECTIONS
      .filter((s) => visible(s.audience, isInternal))
      .filter((s) => !q || haystack(s).includes(q));
  }, [query, isInternal]);

  const aiSurfaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    return AI_SURFACES.filter((s) => visible(s.audience, isInternal)).filter((s) => !q || haystack(s).includes(q));
  }, [query, isInternal]);

  const journeys = useMemo(() => {
    const q = query.trim().toLowerCase();
    return JOURNEYS
      .filter((j) => visible(j.audience, isInternal))
      .filter((j) => persona === 'all' || j.steps.some((st) => st.actor === persona))
      .filter((j) => !q || haystack(j).includes(q));
  }, [query, persona, isInternal]);

  const modules = useMemo(
    () => Array.from(new Set(PROCESS_SECTIONS.filter((s) => visible(s.audience, isInternal)).map((s) => s.module))).sort(),
    [isInternal],
  );

  /** Table of contents for the active tab (also drives previous/next). */
  const toc = useMemo(() => {
    switch (tab) {
      case 'overview': return narratives.map((s) => ({ id: s.id, label: s.title }));
      case 'personas': return personas.map((p) => ({ id: `persona-${p.key}`, label: p.label }));
      case 'processes': return processes.map((s) => ({ id: s.id, label: s.title }));
      case 'entity360': return e360.map((s) => ({ id: `entity-360-${s.key}`, label: s.label }));
      case 'ai': return aiSurfaces.map((s) => ({ id: `ai-${s.code.toLowerCase()}`, label: s.label }));
      case 'journeys': return journeys.map((j) => ({ id: j.id, label: `${j.code} — ${j.title}` }));
      case 'demo': return DEMO_SCRIPTS.map((d) => ({ id: d.id, label: d.title }));
      default: return [];
    }
  }, [tab, narratives, personas, processes, e360, aiSurfaces, journeys]);

  const [cursor, setCursor] = useState(0);
  useEffect(() => setCursor(0), [tab]);

  function goto(index: number) {
    const target = toc[index];
    if (!target) return;
    setCursor(index);
    document.getElementById(target.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Deep links: /help/user-manual#<anchor> opens the owning tab and scrolls. */
  useEffect(() => {
    const anchor = location.hash.replace('#', '');
    if (!anchor) return;
    let owning: TabKey = 'processes';
    if (anchor.startsWith('entity-360-')) owning = 'entity360';
    else if (anchor === 'entity-360') owning = 'entity360';
    else if (anchor.startsWith('ai-') || anchor === 'ai-governance') owning = anchor === 'ai-governance' ? 'processes' : 'ai';
    else if (anchor.startsWith('journey-')) owning = 'journeys';
    else if (anchor.startsWith('persona-')) owning = 'personas';
    else if (anchor.startsWith('demo-')) owning = 'demo';
    else if (NARRATIVE_SECTIONS.some((s) => s.id === anchor)) owning = 'overview';
    if (!TABS.find((t) => t.key === owning)?.internalOnly || isInternal) setTab(owning);
    const t = window.setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
    return () => window.clearTimeout(t);
  }, [location.hash, isInternal]);

  const capturedCount = Object.values(SCREENSHOT_BY_ID).filter((s) => s.status !== 'NEEDS_CAPTURE').length;
  const pendingCount = Object.values(SCREENSHOT_BY_ID).length - capturedCount;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ---------------------------------------------------------- masthead */}
      <Card className="border-primary/30">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">
                  Unified License Hub — User Manual V1
                </h1>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Role-aware operating manual and demo playbook, generated from a single documentation
                registry. It describes only what the platform actually does today.
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              <Button variant="outline" size="sm" onClick={() => setPrintView((v) => !v)}>
                {printView ? 'Exit print view' : 'Print view'}
              </Button>
              <Button data-rbac="documentation.view" size="sm" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print / PDF
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-amber-600 hover:bg-amber-600">{MANUAL_META.manualStatus}</Badge>
            <Badge variant="outline">Version {MANUAL_META.version}</Badge>
            <Badge variant="outline" className="font-mono text-[10px]">HEAD {MANUAL_META.repositoryHead.slice(0, 12)}</Badge>
            <Badge variant="outline">
              E2E verification: {MANUAL_META.lastE2eVerifiedHead ? `verified at ${MANUAL_META.lastE2eVerifiedHead.slice(0, 12)}` : 'PENDING — not yet E2E verified'}
            </Badge>
            <Badge variant="secondary">Generated {MANUAL_META.generatedDate}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{MANUAL_META.certificationStatus}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {CERTIFIED_MODULES.map((m) => (
              <Badge key={m.module} variant="outline">{m.module}: {m.state}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Camera className="h-3 w-3" /> Screenshots: {capturedCount} captured · {pendingCount} NEEDS_CAPTURE
            <span>· Documentation location: {MANUAL_META.menuLocation}</span>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------- filters */}
      <Card className="print:hidden">
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the manual — processes, screens, statuses, terms…"
              className="pl-9"
              aria-label="Search the user manual"
            />
          </div>
          <Select value={persona} onValueChange={setPersona}>
            <SelectTrigger className="md:w-56"><SelectValue placeholder="Persona" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {personas.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger className="md:w-56"><SelectValue placeholder="Module" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        {/* ------------------------------------------------------------ TOC */}
        <aside className="print:hidden">
          <Card className="lg:sticky lg:top-20">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Contents</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[22rem] lg:h-[28rem]">
                <nav className="space-y-1 p-3">
                  {toc.length === 0 && <p className="text-sm text-muted-foreground">Nothing matches the current filters.</p>}
                  {toc.map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => goto(i)}
                      className={`block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted ${i === cursor ? 'bg-muted font-medium' : 'text-muted-foreground'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </nav>
              </ScrollArea>
              <Separator />
              <div className="flex items-center justify-between p-3">
                <Button variant="ghost" size="sm" disabled={cursor <= 0} onClick={() => goto(cursor - 1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                </Button>
                <Button variant="ghost" size="sm" disabled={cursor >= toc.length - 1} onClick={() => goto(cursor + 1)}>
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* -------------------------------------------------------- content */}
        <div ref={contentRef} className="space-y-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList className="flex h-auto flex-wrap justify-start print:hidden">
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="gap-2">{t.icon}{t.label}</TabsTrigger>
              ))}
            </TabsList>

            {/* -------------------------------------------------- overview */}
            <TabsContent value="overview" className="mt-4 space-y-6">
              {narratives.map((s) => (
                <SectionShell
                  key={s.id}
                  id={s.id}
                  title={s.title}
                  meta={<div className="flex gap-2"><Badge variant="outline">{s.chapter}</Badge><Badge variant="secondary">{s.status}</Badge></div>}
                >
                  <NarrativeBody s={s} />
                </SectionShell>
              ))}
            </TabsContent>

            {/* -------------------------------------------------- personas */}
            <TabsContent value="personas" className="mt-4 space-y-6">
              {personas.map((p) => (
                <SectionShell
                  key={p.key}
                  id={`persona-${p.key}`}
                  title={p.label}
                  meta={<div className="flex gap-2"><Badge variant="outline">{p.audience}</Badge></div>}
                >
                  <PersonaBody p={p} />
                </SectionShell>
              ))}
            </TabsContent>

            {/* ------------------------------------------------- processes */}
            <TabsContent value="processes" className="mt-4 space-y-6">
              {processes.map((s) => (
                <SectionShell
                  key={s.id}
                  id={s.id}
                  title={s.title}
                  meta={
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{s.chapter}</Badge>
                      <Badge variant="outline">{s.module}</Badge>
                      <Badge variant="secondary">{s.status}</Badge>
                      <Badge variant="outline">{s.aiInvolvement}</Badge>
                    </div>
                  }
                >
                  <ProcessBody s={s} />
                </SectionShell>
              ))}
            </TabsContent>

            {/* ------------------------------------------------- entity 360 */}
            <TabsContent value="entity360" className="mt-4 space-y-6">
              <Card id="entity-360" className="scroll-mt-24">
                <CardHeader><CardTitle className="text-xl">Entity 360 — supervisory profile</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Entity 360 organises everything the regulator knows about a supervised firm into
                    seven groups. {ENTITY_360_SECTIONS.length} sections are documented below, matching
                    the live section catalogue.
                  </p>
                  {E360_GROUP_DOCS.map((g) => (
                    <div key={g.key} className="rounded-lg border p-3">
                      <h4 className="text-sm font-semibold">{g.label}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">{g.whyRegulatorsUseIt}</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {g.typicalQuestions.map((q, i) => <li key={i}>{q}</li>)}
                      </ul>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {e360.map((s) => (
                <SectionShell
                  key={s.key}
                  id={`entity-360-${s.key}`}
                  title={s.label}
                  meta={
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{s.group}</Badge>
                      <Badge variant="secondary">{s.status}</Badge>
                      {s.audience === 'internal' && <Badge variant="destructive">Internal only</Badge>}
                    </div>
                  }
                >
                  <p className="text-sm">{s.whatIsIt}</p>
                  <Pairs
                    title="Why it matters"
                    rows={[
                      { k: 'Question it answers', v: s.questionAnswered },
                      { k: 'Regulatory importance', v: s.regulatoryImportance },
                      { k: 'Temporal behaviour', v: s.temporal },
                    ]}
                  />
                  <Bullets title="Where the data comes from" items={s.sourceOfInformation} />
                  <Pairs title="Important fields" rows={s.importantFields.map((f) => ({ k: f.field, v: f.meaning }))} />
                  <Bullets title="How to interpret it" items={s.howToInterpret} />
                  <Bullets title="What to investigate" items={s.whatToInvestigate} />
                  {s.relatedProcesses.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {s.relatedProcesses.map((l) => (
                        <Badge key={l.route} variant="outline" className="font-mono text-[10px]">{l.label} — {l.route}</Badge>
                      ))}
                    </div>
                  )}
                  <Bullets title="Demo talking points" items={s.demoTalkingPoints} />
                  <Shots ids={s.screenshots} />
                </SectionShell>
              ))}
            </TabsContent>

            {/* --------------------------------------------------------- AI */}
            <TabsContent value="ai" className="mt-4 space-y-6">
              <Card id="ai-governance-overview" className="scroll-mt-24 border-amber-500/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <ShieldAlert className="h-5 w-5 text-amber-600" />
                    AI & Human-Controlled Governance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Pairs
                    title="Live governed census"
                    rows={[
                      { k: 'Governed surfaces', v: String(AI_SURFACE_CENSUS.governedSurfaces) },
                      { k: 'Active surfaces', v: String(AI_SURFACE_CENSUS.activeSurfaces) },
                      { k: 'Advisory classification', v: AI_SURFACE_CENSUS.advisoryClassification },
                      { k: 'Authoritative write path', v: AI_SURFACE_CENSUS.authoritativeWritePath },
                      { k: 'Recorded at', v: AI_SURFACE_CENSUS.recordedAt },
                    ]}
                  />
                  {AUTOMATION_CLASSIFICATION.map((c) => (
                    <div key={c.kind} className="rounded-lg border p-3">
                      <h4 className="text-sm font-semibold">{c.kind}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">{c.meaning}</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {c.examples.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  ))}
                  <Bullets title="Never claim (prohibited statements)" items={AI_MUST_NOT_CLAIM} />
                </CardContent>
              </Card>

              {aiSurfaces.map((s) => (
                <SectionShell
                  key={s.code}
                  id={`ai-${s.code.toLowerCase()}`}
                  title={s.label}
                  meta={
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{s.code}</Badge>
                      <Badge variant="outline">{s.owningModule}</Badge>
                      <Badge variant="secondary">{s.status}</Badge>
                      {s.route && <Badge variant="outline" className="font-mono text-[10px]">{s.route}</Badge>}
                    </div>
                  }
                >
                  <p className="text-sm">{s.businessPurpose}</p>
                  <Bullets title="What it reads" items={s.input} />
                  <Bullets title="What it produces" items={s.output} />
                  <Pairs
                    title="Governance"
                    rows={[
                      { k: 'Confidence handling', v: s.confidence },
                      { k: 'Explanation shown', v: s.explanation },
                      { k: 'Decision authority', v: s.decisionAuthority },
                      { k: 'If the model fails', v: s.failureBehaviour },
                    ]}
                  />
                  <Bullets title="Human controls" items={s.humanControl} />
                  <Bullets title="Provenance recorded" items={s.provenance} />
                  <Bullets title="Governance constraints" items={s.governance} />
                  <Shots ids={s.screenshots} />
                </SectionShell>
              ))}

              <Card id="ai-demo-scenarios" className="scroll-mt-24">
                <CardHeader><CardTitle className="text-xl">AI demonstration scenarios</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {AI_DEMO_SCENARIOS.map((sc) => (
                    <div key={sc.id} id={sc.id} className="scroll-mt-24 rounded-lg border p-3">
                      <h4 className="text-sm font-semibold">{sc.title}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {sc.persona} · {sc.startingScreen.label} ({sc.startingScreen.route})
                      </p>
                      <p className="mt-2 text-sm">{sc.scenario}</p>
                      <Bullets title="What to click" items={sc.whatToClick} />
                      <Bullets title="AI output to highlight" items={sc.aiOutputToHighlight} />
                      <Pairs
                        title="Governance narrative"
                        rows={[
                          { k: 'Confidence & rationale', v: sc.confidenceAndRationale },
                          { k: 'Human decision point', v: sc.humanDecisionPoint },
                          { k: 'Override demonstration', v: sc.overrideDemonstration },
                          { k: 'Key talking point', v: sc.keyTalkingPoint },
                        ]}
                      />
                      <Bullets title="Audit evidence" items={sc.auditEvidence} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* --------------------------------------------------- journeys */}
            <TabsContent value="journeys" className="mt-4 space-y-6">
              {journeys.map((j) => (
                <SectionShell
                  key={j.id}
                  id={j.id}
                  title={`Journey ${j.code} — ${j.title}`}
                  meta={
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{j.status}</Badge>
                      {j.modulesTraversed.map((m) => <Badge key={m} variant="outline">{m}</Badge>)}
                    </div>
                  }
                >
                  <p className="text-sm">{j.purpose}</p>
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Steps</h4>
                    <ol className="space-y-2">
                      {j.steps.map((st) => (
                        <li key={st.step} className="rounded border p-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">Step {st.step}</Badge>
                            <Badge variant="secondary">{st.actor}</Badge>
                            {st.route && <Badge variant="outline" className="font-mono text-[10px]">{st.route}</Badge>}
                            <Badge variant="outline">{st.aiInvolvement}</Badge>
                          </div>
                          <p className="mt-1">{st.action}</p>
                          <p className="text-muted-foreground">→ {st.outcome}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <Bullets title="Evidence produced" items={j.evidence} />
                  <Bullets title="Demo notes" items={j.demoNotes} />
                  <Shots ids={j.screenshots} />
                </SectionShell>
              ))}
            </TabsContent>

            {/* ------------------------------------------------------- demo */}
            <TabsContent value="demo" className="mt-4 space-y-6">
              <Card className="border-destructive/40">
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Internal presenter material. Use demo-safe records only, never real personal data,
                  and never describe deterministic automation as AI.
                </CardContent>
              </Card>
              {DEMO_SCRIPTS.map((d) => (
                <SectionShell
                  key={d.id}
                  id={d.id}
                  title={d.title}
                  meta={
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{d.durationMinutes} minutes</Badge>
                      {d.focus.map((f) => <Badge key={f} variant="secondary">{f}</Badge>)}
                    </div>
                  }
                >
                  <p className="text-sm">{d.audienceNote}</p>
                  <Bullets title="Records to prepare" items={d.recordsToUse} />
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Run sheet</h4>
                    {d.steps.map((st) => (
                      <div key={st.step} className="rounded border p-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">Step {st.step}</Badge>
                          <Badge variant="secondary">{st.persona}</Badge>
                          <Badge variant="outline" className="font-mono text-[10px]">{st.screen.route}</Badge>
                        </div>
                        <p className="mt-1">{st.sequence}</p>
                        <p className="text-muted-foreground">Expected: {st.expectedScreen}</p>
                        <p className="text-muted-foreground">Message: {st.keyMessage}</p>
                        {st.aiTalkingPoint && <p className="text-muted-foreground">AI framing: {st.aiTalkingPoint}</p>}
                        <p className="text-muted-foreground">Fallback: {st.fallback}</p>
                      </div>
                    ))}
                  </div>
                </SectionShell>
              ))}
            </TabsContent>
          </Tabs>

          {/* Print view renders every visible section linearly for PDF export. */}
          {printView && (
            <div className="space-y-6">
              <Separator />
              <h2 className="text-lg font-semibold">Complete manual (print view)</h2>
              {narratives.map((s) => (
                <SectionShell key={`p-${s.id}`} id={`print-${s.id}`} title={s.title}><NarrativeBody s={s} /></SectionShell>
              ))}
              {personas.map((p) => (
                <SectionShell key={`p-${p.key}`} id={`print-persona-${p.key}`} title={p.label}><PersonaBody p={p} /></SectionShell>
              ))}
              {processes.map((s) => (
                <SectionShell key={`p-${s.id}`} id={`print-${s.id}`} title={s.title}><ProcessBody s={s} /></SectionShell>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
