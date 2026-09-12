import React from 'react';
import {
  Activity, Award, BadgeCheck, Banknote, Bell, BellRing, BookOpenCheck, Boxes, BrainCircuit,
  Briefcase, Building2, Cable, CalendarCheck, CalendarCog, CalendarDays, ChartColumn,
  ChartNoAxesCombined, ClipboardCheck, ClipboardList, ClipboardPen, Clock, Cog,
  CreditCard, Database, Download, FileChartColumn, FileCheck2, FilePlus2, FileSearch, FileSpreadsheet,
  FileStack, Files, FolderArchive, Gavel, GitBranch, GitCompareArrows, GraduationCap, History, Home,
  Inbox, KeyRound, Landmark, LayoutDashboard, LayoutGrid, ListChecks, ListOrdered, ListTodo,
  ListTree, Mail, MailOpen, MailPlus, MapPin, MessageSquare, MessageSquareText, MessageSquareWarning,
  MessagesSquare, Microscope, Network, Plug, PlugZap, Radar, RefreshCcw, Route, ScanSearch, Scale,
  ScrollText, Search, SearchCheck, Send, Settings, Settings2, Shield, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Sparkles, Table2, Target, Timer, TrendingUp, TriangleAlert, Upload, UserCheck,
  UserCog, UserRoundCog, Users, UsersRound, Workflow, Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * THE approved navigation icon catalogue.
 *
 * Every icon that may appear in the sidebar, in a hub card, in the Navigation
 * Builder picker or in a database seed must be a key of this map. It is the
 * single source of truth — no component keeps its own icon map, and no icon is
 * derived from a label, route, module or index. `sec_navigation_items.icon_key`
 * stores one of these keys, so renaming a menu item never changes its icon.
 *
 * Semantic families are kept deliberately consistent:
 *   money -> CreditCard / Banknote      people -> Users*
 *   security -> Shield*                 workflow -> GitBranch / Workflow
 *   notifications -> Bell*              messages -> Mail* / MessagesSquare
 *   returns -> FileSpreadsheet / Calendar*   licensing -> Award / BadgeCheck
 *   audit -> ScrollText                 configuration -> SlidersHorizontal
 *   analytics -> Chart*                 AI -> BrainCircuit
 *   integration -> Plug*
 */
export const NAV_ICON_MAP: Record<string, LucideIcon> = {
  Activity, Award, BadgeCheck, Banknote, Bell, BellRing, BookOpenCheck, Boxes, BrainCircuit,
  Briefcase, Building2, Cable, CalendarCheck, CalendarCog, CalendarDays, ChartColumn,
  ChartNoAxesCombined, ClipboardCheck, ClipboardList, ClipboardPen, Clock, Cog,
  CreditCard, Database, Download, FileChartColumn, FileCheck2, FilePlus2, FileSearch, FileSpreadsheet,
  FileStack, Files, FolderArchive, Gavel, GitBranch, GitCompareArrows, GraduationCap, History, Home,
  Inbox, KeyRound, Landmark, LayoutDashboard, LayoutGrid, ListChecks, ListOrdered, ListTodo,
  ListTree, Mail, MailOpen, MailPlus, MapPin, MessageSquare, MessageSquareText, MessageSquareWarning,
  MessagesSquare, Microscope, Network, Plug, PlugZap, Radar, RefreshCcw, Route, ScanSearch, Scale,
  ScrollText, Search, SearchCheck, Send, Settings, Settings2, Shield, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Sparkles, Table2, Target, Timer, TrendingUp, TriangleAlert, Upload, UserCheck,
  UserCog, UserRoundCog, Users, UsersRound, Workflow, Zap,
};

/** Emergency fallback. Never `Circle`/dot — a dot reads as a data defect. */
export const NAV_ICON_FALLBACK = 'LayoutGrid';

/** Options for the Navigation Builder icon picker (sorted, validated). */
export const NAV_ICON_OPTIONS: Array<{ value: string; Icon: LucideIcon }> = Object.keys(NAV_ICON_MAP)
  .sort((a, b) => a.localeCompare(b))
  .map((value) => ({ value, Icon: NAV_ICON_MAP[value] }));

export function isValidNavIconKey(iconKey: string | null | undefined): boolean {
  return !!iconKey && Object.prototype.hasOwnProperty.call(NAV_ICON_MAP, iconKey);
}

const warned = new Set<string>();

/** Resolve an icon key to its component, warning loudly in development. */
export function getNavIcon(iconKey: string | null | undefined): LucideIcon {
  const key = (iconKey || '').trim();
  if (isValidNavIconKey(key)) return NAV_ICON_MAP[key];
  if (import.meta.env?.DEV && !warned.has(key)) {
    warned.add(key);
     
    console.warn(
      `[navIcons] Navigation icon_key ${key ? `"${key}"` : '(missing)'} is not in NAV_ICON_MAP. ` +
        'Seeded active navigation must use an approved key — treat this as a data defect.',
    );
  }
  return NAV_ICON_MAP[NAV_ICON_FALLBACK];
}

/** Render an icon element for a database-stored icon key. */
export function renderNavIcon(iconKey: string | null | undefined, className = 'h-4 w-4 shrink-0'): React.ReactNode {
  const Icon = getNavIcon(iconKey);
  return <Icon className={className} />;
}
