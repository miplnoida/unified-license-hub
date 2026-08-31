import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROLE_LABEL, TREATMENT_LABEL } from '@/lib/groupConsolidation';
import { useGroupOwnershipReference } from '@/hooks/useFinancialGroups';
import { ShieldCheck, Info } from 'lucide-react';

export const VARIANCE_REASONS: Record<string, string> = {
  supervisory_perimeter_basis: 'Supervisory perimeter basis differs from legal holding',
  indirect_effective_interest: 'Effective (look-through) interest, not the direct legal stake',
  temporary_structure: 'Temporary / transitional structure',
  regulatory_treatment: 'Regulatory treatment prescribed by the authority',
  awaiting_verification: 'Awaiting verification of the legal ownership record',
  other: 'Other (explain in the note)',
};

export interface MemberFormValue {
  id?: string;
  licensee_id?: string | null;
  parent_member_id?: string | null;
  parent_index?: number | null;
  member_role?: string;
  consolidation_treatment?: string;
  ownership_percentage?: number | null;
  effective_date?: string | null;
  end_date?: string | null;
  exclusion_rationale?: string | null;
  ownership_variance_reason?: string | null;
  ownership_variance_note?: string | null;
  notes?: string | null;
}

export interface ParentOption { value: string; label: string; licensee_id: string | null }

interface Props {
  groupId?: string | null;
  value: MemberFormValue;
  onChange: (v: MemberFormValue) => void;
  entities: Array<{ id: string; name: string }>;
  parentOptions: ParentOption[];
  /** parent key used by this form: member id (live) or staged index (wizard) */
  parentField: 'parent_member_id' | 'parent_index';
  lockEntity?: boolean;
  /** Reports the current blocking issue (null when the member can be saved). */
  onIssueChange?: (issue: string | null) => void;
}

const VARIANCE_TOLERANCE = 0.01;

/**
 * Shared group-member capture. Ownership entered here is the SUPERVISORY group
 * reference; the canonical legal ownership ledger is shown read-only alongside
 * it and a documented reason is required whenever the two differ.
 */
export function GroupMemberFields({
  groupId, value, onChange, entities, parentOptions, parentField, lockEntity, onIssueChange,
}: Props) {
  const set = (patch: Partial<MemberFormValue>) => onChange({ ...value, ...patch });

  const parentKey = parentField === 'parent_member_id'
    ? (value.parent_member_id ?? null)
    : (value.parent_index == null ? null : String(value.parent_index));
  const parentLicensee = parentOptions.find((p) => p.value === parentKey)?.licensee_id ?? null;

  const { data: reference, isLoading: refLoading } = useGroupOwnershipReference(
    groupId, parentLicensee, value.licensee_id ?? null, value.effective_date ?? null,
  );

  const canonical = reference?.available ? Number(reference.economic_interest_percentage ?? NaN) : NaN;
  const entered = value.ownership_percentage == null ? NaN : Number(value.ownership_percentage);
  const variance = Number.isFinite(canonical) && Number.isFinite(entered)
    ? Math.abs(canonical - entered) > VARIANCE_TOLERANCE
    : false;
  const excluded = (value.consolidation_treatment ?? 'full') === 'excluded';

  const issue = memberBlockingIssue(value, Number.isFinite(canonical) ? canonical : null);
  useEffect(() => { onIssueChange?.(issue); }, [issue, onIssueChange]);

  return (
    <div className="space-y-3">
      <div>
        <Label>Entity</Label>
        <Select
          value={value.licensee_id ?? ''}
          onValueChange={(v) => set({ licensee_id: v })}
          disabled={lockEntity}
        >
          <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
          <SelectContent>
            {entities.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Parent within group</Label>
        <Select
          value={parentKey ?? 'none'}
          onValueChange={(v) => set(parentField === 'parent_member_id'
            ? { parent_member_id: v === 'none' ? null : v }
            : { parent_index: v === 'none' ? null : Number(v) })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No parent (top of group)</SelectItem>
            {parentOptions.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          A member cannot be its own parent and circular hierarchies are rejected by the server.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Role in group</Label>
          <Select value={value.member_role ?? 'subsidiary'} onValueChange={(v) => set({ member_role: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Consolidation treatment</Label>
          <Select
            value={value.consolidation_treatment ?? 'full'}
            onValueChange={(v) => set({ consolidation_treatment: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TREATMENT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Group ownership %</Label>
          <Input
            type="number" step="0.01" min={0} max={100}
            value={value.ownership_percentage ?? ''}
            onChange={(e) => set({ ownership_percentage: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Effective date</Label>
          <Input
            type="date" value={value.effective_date ?? ''}
            onChange={(e) => set({ effective_date: e.target.value || null })}
          />
        </div>
        <div>
          <Label>End date</Label>
          <Input
            type="date" value={value.end_date ?? ''}
            onChange={(e) => set({ end_date: e.target.value || null })}
          />
        </div>
      </div>

      {/* Canonical ownership evidence — read only */}
      <div className="rounded-md border border-border/70 bg-muted/30 p-3">
        <p className="flex items-center gap-2 text-xs font-medium">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Canonical legal ownership (ownership ledger)
        </p>
        {!parentLicensee || !value.licensee_id ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Select the parent and the member entity to compare against the ownership ledger.
          </p>
        ) : refLoading ? (
          <p className="mt-1 text-xs text-muted-foreground">Checking the ownership ledger…</p>
        ) : reference?.available ? (
          <div className="mt-1 space-y-1">
            <p className="font-mono text-xs">
              Economic {reference.economic_interest_percentage ?? '—'}% · Voting {reference.voting_rights_percentage ?? '—'}%
              {reference.is_controller ? ' · Controller' : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              {reference.approval_status} · effective {reference.effective_from ?? '—'}
              {reference.verified ? ' · verified' : ' · not verified'}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            No approved direct ownership record found ({reference?.reason ?? 'UNAVAILABLE'}). The group
            ownership reference is recorded as a supervisory figure only.
          </p>
        )}
      </div>

      {variance && (
        <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-3">
          <p className="flex items-center gap-2 text-xs font-medium">
            <Info className="h-3.5 w-3.5" />
            Entered ownership differs from the canonical record
            <Badge variant="outline" className="text-[11px] font-mono">
              {entered.toFixed(2)}% vs {canonical.toFixed(2)}%
            </Badge>
          </p>
          <div>
            <Label className="text-xs">Reason for the difference</Label>
            <Select
              value={value.ownership_variance_reason ?? ''}
              onValueChange={(v) => set({ ownership_variance_reason: v })}
            >
              <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
              <SelectContent>
                {Object.entries(VARIANCE_REASONS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Supervisory note</Label>
            <Textarea
              rows={2} value={value.ownership_variance_note ?? ''}
              onChange={(e) => set({ ownership_variance_note: e.target.value || null })}
              placeholder="Explain why the group reference differs from the ownership ledger."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The ownership ledger is not changed by this form.
          </p>
        </div>
      )}

      {excluded && (
        <div className="space-y-2 rounded-md border border-border/70 p-3">
          <Label className="text-xs">Exclusion rationale (required)</Label>
          <Textarea
            rows={2} value={value.exclusion_rationale ?? ''}
            onChange={(e) => set({ exclusion_rationale: e.target.value || null })}
            placeholder="Why is this member excluded from prudential consolidation?"
          />
        </div>
      )}

      <div>
        <Label>Notes</Label>
        <Textarea
          rows={2} value={value.notes ?? ''}
          onChange={(e) => set({ notes: e.target.value || null })}
        />
      </div>
    </div>
  );
}

/** Client-side completeness check mirroring the server-side invariants. */
export function memberBlockingIssue(v: MemberFormValue, canonicalPct?: number | null): string | null {
  if (!v.licensee_id) return 'Select the member entity.';
  if ((v.consolidation_treatment ?? 'full') === 'excluded'
      && !(v.exclusion_rationale ?? '').trim()) {
    return 'An excluded member requires an exclusion rationale.';
  }
  if (v.effective_date && v.end_date && v.end_date < v.effective_date) {
    return 'The end date cannot precede the effective date.';
  }
  const entered = v.ownership_percentage == null ? NaN : Number(v.ownership_percentage);
  const canon = canonicalPct == null ? NaN : Number(canonicalPct);
  if (Number.isFinite(entered) && Number.isFinite(canon) && Math.abs(entered - canon) > VARIANCE_TOLERANCE) {
    if (!v.ownership_variance_reason) return 'Record a reason for the ownership difference.';
  }
  return null;
}
