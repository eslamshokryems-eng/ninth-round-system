"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type {
  LeadDetail,
  LeadFollowup,
  LeadGender,
  LeadLostReason,
  LeadSource,
  LeadTimelineEntry,
} from "@9thround/sales";
import type { MembershipType, PaymentMethod } from "@9thround/reception";
import type { StaffCandidate } from "@9thround/identity";
import { useAuthStore } from "../../../../../src/features/auth/store";
import { getReceptionModule, getSalesModule } from "../../../../../src/lib/composition-root";
import { translateErrorCode } from "../../../../../src/lib/translate-error";
import { Button } from "../../../../../src/components/ui/button";
import { Card } from "../../../../../src/components/ui/card";
import { TextField, TextAreaField } from "../../../../../src/components/ui/text-field";
import { OptionCard } from "../../../../../src/components/ui/option-card";
import { SelectField } from "../../../../../src/components/ui/select-field";
import { QrCodeImage } from "../../../../../src/components/ui/qr-code";
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

const LOST_REASONS: { value: LeadLostReason; label: string }[] = [
  { value: "not_interested", label: "Not interested" },
  { value: "too_expensive", label: "Too expensive" },
  { value: "chose_competitor", label: "Chose a competitor" },
  { value: "unreachable", label: "Unreachable" },
  { value: "other", label: "Other" },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "visa", label: "Visa" },
  { value: "instapay", label: "Instapay" },
  { value: "vodafone_cash", label: "Vodafone Cash" },
];

const ACTION_LABEL: Record<string, string> = {
  create_lead: "Lead created",
  update_lead: "Lead updated",
  convert_lead: "Converted to member",
  create_lead_followup: "Follow-up scheduled",
  update_lead_followup: "Follow-up updated",
};

const CAN_ASSIGN_OTHERS = new Set(["branch_manager", "super_admin"]);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Lead Detail (Phase 6) — Profile/Interest/Assignment, Follow-ups, Timeline (via get_lead_timeline()), Convert-to-Member, Mark Lost/Restore. */
export default function LeadDetailPage() {
  const params = useParams<{ leadId: string }>();
  const leadId = params.leadId;
  const role = useAuthStore((state) => state.role);

  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<LeadGender | "">("");
  const [source, setSource] = useState<LeadSource>("walk_in");
  const [interestedTypeId, setInterestedTypeId] = useState<string | null>(null);
  const [interestNotes, setInterestNotes] = useState("");
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [assignee, setAssignee] = useState<StaffCandidate | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  const [followups, setFollowups] = useState<LeadFollowup[]>([]);
  const [isLoadingFollowups, setIsLoadingFollowups] = useState(true);
  const [newDueAt, setNewDueAt] = useState("");
  const [newNote, setNewNote] = useState("");
  const [followupError, setFollowupError] = useState<string | null>(null);
  const [isCreatingFollowup, setIsCreatingFollowup] = useState(false);

  const [timeline, setTimeline] = useState<LeadTimelineEntry[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(true);

  const [isLostFormOpen, setIsLostFormOpen] = useState(false);
  const [lostReason, setLostReason] = useState<LeadLostReason | "">("");
  const [lostNote, setLostNote] = useState("");
  const [lostError, setLostError] = useState<string | null>(null);
  const [isMarkingLost, setIsMarkingLost] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [convertTypeId, setConvertTypeId] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [priceText, setPriceText] = useState("");
  const [discountText, setDiscountText] = useState("0");
  const [startDate, setStartDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [convertError, setConvertError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertSuccess, setConvertSuccess] = useState<{ membershipNumber: string; qrCode: string } | null>(null);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const result = await getSalesModule().getLeadDetail.execute(leadId);
    setIsLoading(false);
    if (result.isErr) {
      setLoadError(translateErrorCode(result.error.code));
      return;
    }
    const value = result.value;
    setDetail(value);
    setFullName(value.fullName);
    setPhone(value.phone);
    setEmail(value.email ?? "");
    setGender(value.gender ?? "");
    setSource(value.source);
    setInterestedTypeId(value.interestedMembershipTypeId);
    setInterestNotes(value.interestNotes ?? "");
  }, [leadId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const loadTimeline = useCallback(async () => {
    setIsLoadingTimeline(true);
    const result = await getSalesModule().getLeadTimeline.execute(leadId);
    setIsLoadingTimeline(false);
    if (result.isOk) setTimeline(result.value);
  }, [leadId]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  useEffect(() => {
    void (async () => {
      const result = await getReceptionModule().listMembershipTypes.execute();
      if (result.isOk) setMembershipTypes(result.value);
    })();
  }, []);

  async function handleSaveProfile() {
    setSaveError(null);
    setSavedAt(null);
    setIsSaving(true);

    const result = await getSalesModule().updateLead.execute({
      leadId,
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      gender: gender || null,
      source,
      interestedMembershipTypeId: interestedTypeId,
      interestNotes: interestNotes.trim() || null,
    });

    setIsSaving(false);

    if (result.isErr) {
      setSaveError(translateErrorCode(result.error.code));
      return;
    }
    setSavedAt(Date.now());
  }

  async function handleAssign() {
    if (!assignee) return;
    setAssignError(null);
    setIsAssigning(true);

    const result = await getSalesModule().assignLead.execute({ leadId, assignedToId: assignee.profileId });

    setIsAssigning(false);

    if (result.isErr) {
      setAssignError(translateErrorCode(result.error.code));
      return;
    }
    setAssignee(null);
    void loadDetail();
  }

  async function handleCreateFollowup() {
    if (!newDueAt || !detail) return;
    setFollowupError(null);
    setIsCreatingFollowup(true);

    const result = await getSalesModule().createFollowup.execute({
      leadId,
      branchId: detail.branchId,
      dueAt: new Date(newDueAt).toISOString(),
      note: newNote.trim() || null,
    });

    setIsCreatingFollowup(false);

    if (result.isErr) {
      setFollowupError(translateErrorCode(result.error.code));
      return;
    }
    setNewDueAt("");
    setNewNote("");
    void reloadFollowupsList();
  }

  const reloadFollowupsList = useCallback(async () => {
    // Reuses the same pglite-verified RLS scoping every other list already
    // relies on — filtered to this one lead client-side rather than adding
    // a dedicated per-lead follow-up RPC for what's a handful of rows.
    setIsLoadingFollowups(true);
    const [today, overdue] = await Promise.all([
      getSalesModule().listTodaysFollowups.execute(),
      getSalesModule().listOverdueFollowups.execute(),
    ]);
    setIsLoadingFollowups(false);
    const merged = [...(today.isOk ? today.value : []), ...(overdue.isOk ? overdue.value : [])].filter(
      (f) => f.leadId === leadId,
    );
    setFollowups(merged);
  }, [leadId]);

  useEffect(() => {
    void reloadFollowupsList();
  }, [reloadFollowupsList]);

  async function handleCompleteFollowup(followupId: string) {
    await getSalesModule().completeFollowup.execute({ followupId, note: null });
    void reloadFollowupsList();
    void loadTimeline();
  }

  async function handleCancelFollowup(followupId: string) {
    await getSalesModule().cancelFollowup.execute(followupId);
    void reloadFollowupsList();
  }

  async function handleMarkLost() {
    if (!lostReason) return;
    setLostError(null);
    setIsMarkingLost(true);

    const result = await getSalesModule().markLeadLost.execute({ leadId, reason: lostReason, note: lostNote.trim() || null });

    setIsMarkingLost(false);

    if (result.isErr) {
      setLostError(translateErrorCode(result.error.code));
      return;
    }
    setIsLostFormOpen(false);
    void loadDetail();
    void loadTimeline();
  }

  async function handleRestore() {
    setIsRestoring(true);
    await getSalesModule().restoreLead.execute(leadId);
    setIsRestoring(false);
    void loadDetail();
    void loadTimeline();
  }

  async function handleConvert() {
    if (!convertTypeId || !paymentMethod) return;
    setConvertError(null);
    setIsConverting(true);

    const result = await getSalesModule().convertLead.execute({
      leadId,
      membershipTypeId: convertTypeId,
      receiptNumber: receiptNumber.trim(),
      price: Number(priceText) || 0,
      discount: Number(discountText) || 0,
      startDate,
      paymentMethod,
      notes: null,
      nationalId: nationalId.trim() || null,
      dateOfBirth: dateOfBirth.trim() || null,
      address: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      photoUrl: null,
      coachId: null,
      sessionCount: null,
    });

    setIsConverting(false);

    if (result.isErr) {
      setConvertError(translateErrorCode(result.error.code));
      return;
    }

    setConvertSuccess({ membershipNumber: result.value.membershipNumber, qrCode: result.value.memberQrCode });
    setIsConvertOpen(false);
    void loadDetail();
    void loadTimeline();
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

  if (isLoading) {
    return <p className="text-muted">Loading…</p>;
  }

  if (loadError || !detail) {
    return <p className="text-red-400">{loadError ?? "Something went wrong."}</p>;
  }

  const isConverted = detail.status === "converted";
  const isLost = detail.status === "lost";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{detail.fullName}</h1>
        <p className="text-sm text-muted">
          {detail.phone} · <span className="capitalize">{detail.status.replace("_", " ")}</span>
        </p>
      </div>

      {isConverted ? (
        <Card className="border-green-500/40">
          <p className="text-sm font-semibold text-green-400">This lead has been converted to a member.</p>
          {detail.convertedMemberId ? (
            <Link href={`/members/${detail.convertedMemberId}`} className="mt-1 inline-block text-xs text-gold hover:text-gold-soft">
              View member profile →
            </Link>
          ) : null}
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setIsConvertOpen((open) => !open)}>{isConvertOpen ? "Cancel Conversion" : "Convert to Member"}</Button>
          {isLost ? (
            <Button variant="secondary" onClick={() => void handleRestore()} isLoading={isRestoring}>
              Restore to Follow-up
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setIsLostFormOpen((open) => !open)}>
              {isLostFormOpen ? "Cancel" : "Mark as Lost"}
            </Button>
          )}
        </div>
      )}

      {convertSuccess ? (
        <Card className="flex flex-col items-center gap-2 border-gold/40 text-center">
          <p className="text-sm font-semibold text-gold">Converted — membership {convertSuccess.membershipNumber} created.</p>
          <QrCodeImage value={convertSuccess.qrCode} />
        </Card>
      ) : null}

      {isLostFormOpen ? (
        <Card className="space-y-3 border-red-500/40">
          <SelectField label="Reason" value={lostReason} onChange={(e) => setLostReason(e.target.value as LeadLostReason)}>
            <option value="">Select a reason</option>
            {LOST_REASONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <TextAreaField label="Note (optional)" value={lostNote} onChange={(e) => setLostNote(e.target.value)} />
          {lostError ? <p className="text-sm text-red-400">{lostError}</p> : null}
          <Button variant="danger" onClick={() => void handleMarkLost()} isLoading={isMarkingLost} disabled={!lostReason}>
            Confirm Mark as Lost
          </Button>
        </Card>
      ) : null}

      {isConvertOpen ? (
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-ink">Convert to Member</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {membershipTypes.map((type) => (
              <OptionCard
                key={type.id}
                label={type.name}
                isSelected={convertTypeId === type.id}
                onClick={() => {
                  setConvertTypeId(type.id);
                  if (!priceText && type.price > 0) setPriceText(String(type.price));
                }}
              />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Receipt Number" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} />
            <TextField label="Start Date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <TextField label="Price" type="number" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
            <TextField label="Discount" type="number" value={discountText} onChange={(e) => setDiscountText(e.target.value)} />
            <TextField label="Date of Birth" placeholder="YYYY-MM-DD" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            <TextField label="National ID" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PAYMENT_METHODS.map((option) => (
              <OptionCard key={option.value} label={option.label} isSelected={paymentMethod === option.value} onClick={() => setPaymentMethod(option.value)} />
            ))}
          </div>
          {convertError ? <p className="text-sm text-red-400">{convertError}</p> : null}
          <Button
            onClick={() => void handleConvert()}
            isLoading={isConverting}
            disabled={!convertTypeId || !paymentMethod || !receiptNumber.trim()}
          >
            Confirm Conversion
          </Button>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <SelectField label="Gender" value={gender} onChange={(e) => setGender(e.target.value as LeadGender)}>
            <option value="">—</option>
            {GENDERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <SelectField label="Source" value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
            {SOURCES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted">Interested In</p>
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
        </div>
        <TextAreaField label="Interest Notes" value={interestNotes} onChange={(e) => setInterestNotes(e.target.value)} />

        {saveError ? <p className="text-sm text-red-400">{saveError}</p> : null}
        {savedAt ? <p className="text-sm text-gold">Changes saved.</p> : null}
        <Button onClick={() => void handleSaveProfile()} isLoading={isSaving} disabled={!fullName.trim() || !phone.trim()}>
          Save
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Assignment</h2>
        <p className="text-sm text-muted">Currently assigned to: {detail.assignedToName ?? "Unassigned"}</p>
        {CAN_ASSIGN_OTHERS.has(role) ? (
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <StaffPicker selected={assignee} onSelect={setAssignee} roleFilter="sales_employee" label="Reassign To" />
            </div>
            <Button variant="secondary" onClick={() => void handleAssign()} isLoading={isAssigning} disabled={!assignee}>
              Assign
            </Button>
          </div>
        ) : null}
        {assignError ? <p className="text-sm text-red-400">{assignError}</p> : null}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Follow-ups</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <TextField label="Due" type="datetime-local" value={newDueAt} onChange={(e) => setNewDueAt(e.target.value)} />
          <TextField label="Note (optional)" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
          <Button className="self-end" onClick={() => void handleCreateFollowup()} isLoading={isCreatingFollowup} disabled={!newDueAt}>
            Schedule
          </Button>
        </div>
        {followupError ? <p className="text-sm text-red-400">{followupError}</p> : null}

        {isLoadingFollowups ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : followups.length === 0 ? (
          <p className="text-sm text-muted">No pending follow-ups for today or overdue.</p>
        ) : (
          <ul className="space-y-2">
            {followups.map((followup) => (
              <li key={followup.followupId} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div>
                  <p className="text-sm text-ink">{followup.dueAt.toLocaleString()}</p>
                  {followup.note ? <p className="text-xs text-muted">{followup.note}</p> : null}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => void handleCompleteFollowup(followup.followupId)} className="text-xs font-medium text-gold hover:text-gold-soft">
                    Complete
                  </button>
                  <button type="button" onClick={() => void handleCancelFollowup(followup.followupId)} className="text-xs font-medium text-red-400 hover:text-red-300">
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-ink">Timeline</h2>
        {isLoadingTimeline ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : timeline.length === 0 ? (
          <p className="text-sm text-muted">No activity yet.</p>
        ) : (
          <ul className="space-y-3">
            {timeline.map((entry) => (
              <li key={entry.id} className="border-l-2 border-gold/30 pl-3">
                <p className="text-sm text-ink">{ACTION_LABEL[entry.action] ?? entry.action}</p>
                <p className="text-xs text-muted">
                  {entry.actorFullName ?? "System"} {entry.actorRole ? `(${entry.actorRole.replace("_", " ")})` : ""} ·{" "}
                  {entry.occurredAt.toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
