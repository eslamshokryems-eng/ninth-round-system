"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LeadGender, LeadSource, LeadSummary } from "@9thround/sales";
import type { MembershipType } from "@9thround/reception";
import type { StaffCandidate } from "@9thround/identity";
import { useAuthStore } from "../../../../../src/features/auth/store";
import { getReceptionModule, getSalesModule } from "../../../../../src/lib/composition-root";
import { translateErrorCode } from "../../../../../src/lib/translate-error";
import { Button } from "../../../../../src/components/ui/button";
import { Card } from "../../../../../src/components/ui/card";
import { TextField, TextAreaField } from "../../../../../src/components/ui/text-field";
import { OptionCard } from "../../../../../src/components/ui/option-card";
import { SelectField } from "../../../../../src/components/ui/select-field";
import { StaffPicker } from "../../../../../src/components/staff-picker";
import { SALES_ROLES } from "../../../../../src/lib/staff-roles";

const GENDERS: { value: LeadGender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "unspecified", label: "Unspecified" },
];

const SOURCES: { value: LeadSource; label: string }[] = [
  { value: "walk_in", label: "Walk-in" },
  { value: "phone", label: "Phone" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
];

const CAN_ASSIGN_OTHERS = new Set(["branch_manager", "super_admin"]);

/** + New Lead (Phase 6) — mirrors Add Member's form shape. */
export default function NewLeadPage() {
  const router = useRouter();
  const branchId = useAuthStore((state) => state.branchId);
  const profileId = useAuthStore((state) => state.profileId);
  const fullNameSelf = useAuthStore((state) => state.fullName);
  const role = useAuthStore((state) => state.role);

  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<LeadGender | null>(null);
  const [source, setSource] = useState<LeadSource>("walk_in");
  const [interestedTypeId, setInterestedTypeId] = useState<string | null>(null);
  const [interestNotes, setInterestNotes] = useState("");
  const [assignee, setAssignee] = useState<StaffCandidate | null>(null);

  const [duplicates, setDuplicates] = useState<LeadSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await getReceptionModule().listMembershipTypes.execute();
      if (result.isOk) setMembershipTypes(result.value);
    })();
  }, []);

  useEffect(() => {
    if (!branchId || phone.trim().length < 6) {
      setDuplicates([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const result = await getSalesModule().checkDuplicateLeads.execute({ branchId, phone });
      if (result.isOk) setDuplicates(result.value);
    }, 300);
    return () => clearTimeout(timeout);
  }, [branchId, phone]);

  const isFormComplete = fullName.trim().length > 0 && phone.trim().length > 0;

  async function handleSave() {
    if (!branchId) return;
    setErrorMessage(null);
    setIsSaving(true);

    const assignedToId = CAN_ASSIGN_OTHERS.has(role ?? "") ? (assignee?.profileId ?? null) : profileId;

    const result = await getSalesModule().createLead.execute({
      branchId,
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      gender,
      source,
      interestedMembershipTypeId: interestedTypeId,
      interestNotes: interestNotes.trim() || null,
      assignedToId,
    });

    setIsSaving(false);

    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }

    router.replace(`/sales/leads/${result.value.leadId}`);
  }

  if (!role || !SALES_ROLES.has(role)) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">Sales is only available to Sales, Branch Manager, and Super Admin accounts.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">New Lead</h1>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Lead Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <SelectField label="Source" value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
            {SOURCES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>

        {duplicates.length > 0 ? (
          <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
            <p className="text-xs font-semibold text-gold">Possible duplicate — this phone number is already a lead:</p>
            <ul className="mt-1 space-y-1">
              {duplicates.map((dup) => (
                <li key={dup.leadId}>
                  <Link href={`/sales/leads/${dup.leadId}`} className="text-xs text-ink hover:text-gold">
                    {dup.fullName} — {dup.status}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-medium text-muted">Gender</p>
          <div className="grid grid-cols-3 gap-3">
            {GENDERS.map((option) => (
              <OptionCard key={option.value} label={option.label} isSelected={gender === option.value} onClick={() => setGender(option.value)} />
            ))}
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Interest</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {membershipTypes.map((type) => (
            <OptionCard
              key={type.id}
              label={type.name}
              isSelected={interestedTypeId === type.id}
              onClick={() => setInterestedTypeId(type.id === interestedTypeId ? null : type.id)}
            />
          ))}
        </div>
        <TextAreaField label="Notes" value={interestNotes} onChange={(e) => setInterestNotes(e.target.value)} />
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Assignment</h2>
        {CAN_ASSIGN_OTHERS.has(role) ? (
          <StaffPicker selected={assignee} onSelect={setAssignee} roleFilter="sales_employee" label="Assign To" />
        ) : (
          <p className="text-sm text-muted">Assigned to you ({fullNameSelf ?? "—"}).</p>
        )}
      </Card>

      {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}

      <div className="flex gap-3">
        <Button onClick={() => void handleSave()} isLoading={isSaving} disabled={!isFormComplete}>
          Save Lead
        </Button>
        <Link href="/sales/leads">
          <Button variant="secondary" type="button">
            Cancel
          </Button>
        </Link>
      </div>
    </div>
  );
}
