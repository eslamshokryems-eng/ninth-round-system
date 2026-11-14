"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type {
  LeadConversion,
  LeadDetail,
  LeadGender,
  LeadLostReason,
  LeadSource,
  LeadTimelineEntry,
  ProgramType,
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
import { LeadWorkspacePanel } from "../../../../../src/components/sales/lead-workspace-panel";
import { toLocalInput } from "../../../../../src/components/sales/interaction-form";
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

const PROGRAMS: { value: ProgramType; label: string }[] = [
  { value: "ninth_round", label: "9th Round" },
  { value: "boxing", label: "Boxing" },
  { value: "kickboxing", label: "Kickboxing" },
  { value: "mma", label: "MMA" },
];

const NEXT_KINDS: { value: "call" | "whatsapp" | "visit" | "other"; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "visit", label: "Gym visit" },
  { value: "other", label: "Other" },
];

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
  const [assignReason, setAssignReason] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);


  const [timeline, setTimeline] = useState<LeadTimelineEntry[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(true);

  const [isLostFormOpen, setIsLostFormOpen] = useState(false);
  const [lostReason, setLostReason] = useState<LeadLostReason | "">("");
  const [lostNote, setLostNote] = useState("");
  const [lostError, setLostError] = useState<string | null>(null);
  const [isMarkingLost, setIsMarkingLost] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isReopenOpen, setIsReopenOpen] = useState(false);
  const [reopenKind, setReopenKind] = useState<"call" | "whatsapp" | "visit" | "other">("call");
  const [reopenAt, setReopenAt] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [reopenNote, setReopenNote] = useState("");
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [conversion, setConversion] = useState<LeadConversion | null>(null);

  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [convertTypeId, setConvertTypeId] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [priceText, setPriceText] = useState("");
  const [discountText, setDiscountText] = useState("0");
  const [startDate, setStartDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [programType, setProgramType] = useState<ProgramType | null>(null);
  const [convertNotes, setConvertNotes] = useState("");
  const [convertError, setConvertError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertSuccess, setConvertSuccess] = useState<{ membershipNumber: string | null; qrCode: string | null; alreadyConverted: boolean } | null>(null);

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
    if (value.status === "converted") {
      const c = await getSalesModule().getLeadConversion.execute(leadId);
      setConversion(c.isOk ? c.value : null);
    }
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
    if (!assignReason.trim()) { setAssignError("Enter a reason for the assignment."); return; }
    setIsAssigning(true);

    // Release B: the assignment goes through assign_leads() — role, branch, active-employee and reason are enforced in the database,
    // and the change is written to the append-only ownership history.
    const result = await getSalesModule().assignLeads.execute({ leadIds: [leadId], newOwnerId: assignee.profileId, reason: assignReason });

    setIsAssigning(false);

    if (result.isErr) {
      setAssignError(result.error.message);
      return;
    }
    setAssignee(null);
    setAssignReason("");
    void loadDetail();
  }


  async function handleMarkLost() {
    if (!lostReason) return;
    setLostError(null);
    setIsMarkingLost(true);

    const result = await getSalesModule().markLeadLost.execute({ leadId, reason: lostReason, note: lostNote.trim() || null });

    setIsMarkingLost(false);

    if (result.isErr) {
      setLostError(result.error.message || translateErrorCode(result.error.code));
      return;
    }
    setIsLostFormOpen(false);
    void loadDetail();
    void loadTimeline();
  }

  async function handleRestore() {
    setReopenError(null);
    setIsRestoring(true);
    const result = await getSalesModule().restoreLead.execute({ leadId, nextKind: reopenKind, nextAt: new Date(reopenAt), note: reopenNote.trim() || null });
    setIsRestoring(false);
    if (result.isErr) {
      setReopenError(result.error.message || translateErrorCode(result.error.code));
      return;
    }
    setIsReopenOpen(false);
    setReopenNote("");
    void loadDetail();
    void loadTimeline();
  }

  async function handleConvert() {
    if (!convertTypeId || !paymentMethod || isConverting) return;
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
      notes: convertNotes.trim() || null,
      nationalId: nationalId.trim() || null,
      dateOfBirth: dateOfBirth.trim() || null,
      address: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      photoUrl: null,
      coachId: null,
      sessionCount: null,
      programType,
    });

    setIsConverting(false);

    if (result.isErr) {
      // the database explains what to fix (receipt already used, phone already a member, lead not assigned, …)
      setConvertError(result.error.message || translateErrorCode(result.error.code));
      return;
    }

    setConvertSuccess({ membershipNumber: result.value.membershipNumber, qrCode: result.value.memberQrCode, alreadyConverted: result.value.alreadyConverted });
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
        <Card className="border-green-500/40" data-testid="conversion-details">
          <p className="text-sm font-semibold text-green-400">This lead has been converted to a member.</p>
          {conversion ? (
            <dl className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
              <div>Membership: <span className="text-ink">{conversion.membershipNumber ?? "—"}</span></div>
              <div>Converted: <span className="text-ink">{conversion.convertedAt.toLocaleString()}</span></div>
              <div>Sold by (credited): <span className="text-ink" data-testid="sold-by">{conversion.leadOwnerName ?? "—"}</span></div>
              <div>Registered by: <span className="text-ink">{conversion.convertedByName ?? "—"}</span></div>
            </dl>
          ) : null}
          {detail.convertedMemberId ? (
            <Link href={`/members/${detail.convertedMemberId}`} className="mt-1 inline-block text-xs text-gold hover:text-gold-soft">
              View member profile →
            </Link>
          ) : null}
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {isLost ? null : (
            <Button onClick={() => setIsConvertOpen((open) => !open)}>{isConvertOpen ? "Cancel Conversion" : "Convert to Member"}</Button>
          )}
          {isLost ? (
            <Button variant="secondary" onClick={() => setIsReopenOpen((open) => !open)}>
              {isReopenOpen ? "Cancel" : "Reopen lead"}
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setIsLostFormOpen((open) => !open)}>
              {isLostFormOpen ? "Cancel" : "Mark as Lost"}
            </Button>
          )}
        </div>
      )}

      {convertSuccess ? (
        <Card className="flex flex-col items-center gap-2 border-gold/40 text-center" data-testid="convert-success">
          <p className="text-sm font-semibold text-gold">
            {convertSuccess.alreadyConverted
              ? `This lead was already converted${convertSuccess.membershipNumber ? ` (membership ${convertSuccess.membershipNumber})` : ""}. Nothing new was created.`
              : `Converted — membership ${convertSuccess.membershipNumber ?? ""} created.`}
          </p>
          {convertSuccess.qrCode ? <QrCodeImage value={convertSuccess.qrCode} /> : null}
        </Card>
      ) : null}

      {isLost && isReopenOpen ? (
        <Card className="space-y-3" data-testid="reopen-form">
          <h2 className="text-sm font-semibold text-ink">Reopen lead</h2>
          <p className="text-xs text-muted">A reopened lead needs its next action — choose what and when.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Next action" value={reopenKind} onChange={(e) => setReopenKind(e.target.value as typeof reopenKind)}>
              {NEXT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </SelectField>
            <TextField label="When" type="datetime-local" value={reopenAt} onChange={(e) => setReopenAt(e.target.value)} />
          </div>
          <TextAreaField label="Note (optional)" value={reopenNote} onChange={(e) => setReopenNote(e.target.value)} />
          {reopenError ? <p className="text-sm text-red-400" role="alert">{reopenError}</p> : null}
          <Button onClick={() => void handleRestore()} isLoading={isRestoring} disabled={!reopenAt}>Reopen and schedule</Button>
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
          {detail.assignedToId ? (
            <p className="text-xs text-muted" data-testid="convert-credit">
              Sold by (credited): <span className="text-ink">{detail.assignedToName ?? "the lead owner"}</span> — the lead owner. You are recorded as the
              employee who registered the membership and received the payment.
            </p>
          ) : (
            <p className="text-sm text-amber-300" role="alert">
              This lead has no owner. A manager must assign it to the sales employee who will be credited before it can be converted.
            </p>
          )}
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
            <TextField label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <TextField label="Price" type="number" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
            <TextField label="Discount" type="number" value={discountText} onChange={(e) => setDiscountText(e.target.value)} />
            <TextField label="Date of Birth" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            <TextField label="National ID" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Program (optional)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PROGRAMS.map((option) => (
                <OptionCard key={option.value} label={option.label} isSelected={programType === option.value} onClick={() => setProgramType(programType === option.value ? null : option.value)} />
              ))}
            </div>
          </div>
          <TextAreaField label="Notes (optional)" value={convertNotes} onChange={(e) => setConvertNotes(e.target.value)} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PAYMENT_METHODS.map((option) => (
              <OptionCard key={option.value} label={option.label} isSelected={paymentMethod === option.value} onClick={() => setPaymentMethod(option.value)} />
            ))}
          </div>
          {convertError ? <p className="text-sm text-red-400" role="alert">{convertError}</p> : null}
          <Button
            onClick={() => void handleConvert()}
            isLoading={isConverting}
            disabled={isConverting || !detail.assignedToId || !convertTypeId || !paymentMethod || !receiptNumber.trim() || !startDate}
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

      <LeadWorkspacePanel leadId={leadId} leadName={detail.fullName} isClosed={isConverted || isLost} onChanged={() => void loadDetail()} />

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
        {CAN_ASSIGN_OTHERS.has(role) ? (
          <TextAreaField label="Reason for assigning / reassigning" value={assignReason} onChange={(e) => setAssignReason(e.target.value)} />
        ) : null}
        {assignError ? <p className="text-sm text-red-400">{assignError}</p> : null}
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
