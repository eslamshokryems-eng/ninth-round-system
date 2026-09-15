"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { CheckInHistoryEntry, Gender, MemberDetail, MembershipType, PaymentMethod } from "@9thround/reception";
import type { StaffCandidate } from "@9thround/identity";
import { useAuthStore } from "../../../../src/features/auth/store";
import { getReceptionModule } from "../../../../src/lib/composition-root";
import { translateErrorCode } from "../../../../src/lib/translate-error";
import { Button } from "../../../../src/components/ui/button";
import { Card } from "../../../../src/components/ui/card";
import { TextField, TextAreaField } from "../../../../src/components/ui/text-field";
import { SelectField } from "../../../../src/components/ui/select-field";
import { OptionCard } from "../../../../src/components/ui/option-card";
import { QrCodeImage } from "../../../../src/components/ui/qr-code";
import { StaffPicker } from "../../../../src/components/staff-picker";

const CAN_DELETE_MEMBER = new Set(["branch_manager", "super_admin"]);

const GENDERS: { value: Gender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "unspecified", label: "Unspecified" },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "visa", label: "Visa" },
  { value: "instapay", label: "Instapay" },
  { value: "vodafone_cash", label: "Vodafone Cash" },
];

export default function MemberDetailPage() {
  const params = useParams<{ memberId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const memberId = params.memberId;
  const role = useAuthStore((state) => state.role);

  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [isQrVisible, setIsQrVisible] = useState(false);
  const [checkInFeedback, setCheckInFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const [checkInHistory, setCheckInHistory] = useState<CheckInHistoryEntry[]>([]);
  const [isLoadingCheckInHistory, setIsLoadingCheckInHistory] = useState(true);

  const [isRenewOpen, setIsRenewOpen] = useState(searchParams.get("action") === "renew");
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [renewTypeId, setRenewTypeId] = useState<string | null>(null);
  const [renewReceiptNumber, setRenewReceiptNumber] = useState("");
  const [renewPriceText, setRenewPriceText] = useState("");
  const [renewDiscountText, setRenewDiscountText] = useState("0");
  const [renewPaymentMethod, setRenewPaymentMethod] = useState<PaymentMethod | null>(null);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [isRenewing, setIsRenewing] = useState(false);
  const [renewSuccess, setRenewSuccess] = useState<string | null>(null);

  const [renewWantsCoach, setRenewWantsCoach] = useState(false);
  const [renewCoach, setRenewCoach] = useState<StaffCandidate | null>(null);
  const [renewSessionCountText, setRenewSessionCountText] = useState("");

  const [isAddPackageOpen, setIsAddPackageOpen] = useState(false);
  const [addPackageTypeId, setAddPackageTypeId] = useState<string | null>(null);
  const [addPackageReceiptNumber, setAddPackageReceiptNumber] = useState("");
  const [addPackagePriceText, setAddPackagePriceText] = useState("");
  const [addPackageDiscountText, setAddPackageDiscountText] = useState("0");
  const [addPackageStartDate, setAddPackageStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [addPackagePaymentMethod, setAddPackagePaymentMethod] = useState<PaymentMethod | null>(null);
  const [addPackageError, setAddPackageError] = useState<string | null>(null);
  const [isAddingPackage, setIsAddingPackage] = useState(false);
  const [addPackageSuccess, setAddPackageSuccess] = useState<string | null>(null);

  const [addPackageWantsCoach, setAddPackageWantsCoach] = useState(false);
  const [addPackageCoach, setAddPackageCoach] = useState<StaffCandidate | null>(null);
  const [addPackageSessionCountText, setAddPackageSessionCountText] = useState("");

  const [isEditingCoach, setIsEditingCoach] = useState(false);
  const [coachPick, setCoachPick] = useState<StaffCandidate | null>(null);
  const [coachSessionCountText, setCoachSessionCountText] = useState("");
  const [coachError, setCoachError] = useState<string | null>(null);
  const [isSavingCoach, setIsSavingCoach] = useState(false);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const result = await getReceptionModule().getMemberDetail.execute(memberId);
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
    setDateOfBirth(value.dateOfBirth ?? "");
    setNationalId(value.nationalId ?? "");
    setEmergencyContactName(value.emergencyContactName ?? "");
    setEmergencyContactPhone(value.emergencyContactPhone ?? "");
    setAddress(value.address ?? "");
    setNotes(value.notes ?? "");
  }, [memberId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const loadCheckInHistory = useCallback(async () => {
    setIsLoadingCheckInHistory(true);
    const result = await getReceptionModule().listCheckInsForMember.execute(memberId);
    setIsLoadingCheckInHistory(false);
    if (result.isOk) setCheckInHistory(result.value);
  }, [memberId]);

  useEffect(() => {
    void loadCheckInHistory();
  }, [loadCheckInHistory]);

  useEffect(() => {
    void (async () => {
      const result = await getReceptionModule().listMembershipTypes.execute();
      if (result.isOk) setMembershipTypes(result.value);
    })();
  }, []);

  async function handleSave() {
    setErrorMessage(null);
    setSavedAt(null);
    setIsSaving(true);

    const result = await getReceptionModule().updateMember.execute({
      memberId,
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      gender: gender || null,
      dateOfBirth: dateOfBirth.trim() || null,
      nationalId: nationalId.trim() || null,
      emergencyContactName: emergencyContactName.trim() || null,
      emergencyContactPhone: emergencyContactPhone.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    });

    setIsSaving(false);

    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }
    setSavedAt(Date.now());
  }

  async function handleCheckIn() {
    setCheckInFeedback(null);
    setIsCheckingIn(true);
    const result = await getReceptionModule().checkInMember.execute(memberId);
    setIsCheckingIn(false);
    if (result.isErr) {
      setCheckInFeedback({ text: translateErrorCode(result.error.code), isError: true });
      return;
    }
    setCheckInFeedback({ text: "Checked in.", isError: false });
    void loadCheckInHistory();
  }

  async function handleRenew() {
    if (!renewTypeId || !renewPaymentMethod) return;
    setRenewError(null);
    setIsRenewing(true);

    const result = await getReceptionModule().renewMembership.execute({
      memberId,
      membershipTypeId: renewTypeId,
      receiptNumber: renewReceiptNumber.trim(),
      price: Number(renewPriceText) || 0,
      discount: Number(renewDiscountText) || 0,
      paymentMethod: renewPaymentMethod,
      notes: null,
      coachId: renewWantsCoach ? (renewCoach?.profileId ?? null) : null,
      sessionCount: renewWantsCoach && renewSessionCountText.trim() ? Number(renewSessionCountText) : null,
    });

    setIsRenewing(false);

    if (result.isErr) {
      setRenewError(translateErrorCode(result.error.code));
      return;
    }

    setRenewSuccess(`Renewed — new membership ${result.value.membershipNumber}, valid until ${result.value.endDate}.`);
    setIsRenewOpen(false);
    setRenewWantsCoach(false);
    setRenewCoach(null);
    setRenewSessionCountText("");
    void loadDetail();
  }

  /**
   * Sells a new, concurrent membership (e.g. a Personal Training package)
   * alongside whatever the member already has active — unlike Renew, this
   * never touches their existing membership(s). See
   * supabase/migrations/20260915000001.
   */
  async function handleAddPackage() {
    if (!addPackageTypeId || !addPackagePaymentMethod) return;
    setAddPackageError(null);
    setIsAddingPackage(true);

    const result = await getReceptionModule().sellAdditionalMembership.execute({
      memberId,
      membershipTypeId: addPackageTypeId,
      receiptNumber: addPackageReceiptNumber.trim(),
      price: Number(addPackagePriceText) || 0,
      discount: Number(addPackageDiscountText) || 0,
      startDate: addPackageStartDate,
      paymentMethod: addPackagePaymentMethod,
      notes: null,
      coachId: addPackageWantsCoach ? (addPackageCoach?.profileId ?? null) : null,
      sessionCount: addPackageWantsCoach && addPackageSessionCountText.trim() ? Number(addPackageSessionCountText) : null,
    });

    setIsAddingPackage(false);

    if (result.isErr) {
      setAddPackageError(translateErrorCode(result.error.code));
      return;
    }

    setAddPackageSuccess(`Added — new membership ${result.value.membershipNumber}, valid until ${result.value.endDate}.`);
    setIsAddPackageOpen(false);
    setAddPackageTypeId(null);
    setAddPackageReceiptNumber("");
    setAddPackagePriceText("");
    setAddPackageDiscountText("0");
    setAddPackagePaymentMethod(null);
    setAddPackageWantsCoach(false);
    setAddPackageCoach(null);
    setAddPackageSessionCountText("");
    void loadDetail();
  }

  const activeMembership = detail?.membershipHistory.find((m) => m.status === "active") ?? null;

  function startEditCoach() {
    if (!activeMembership) return;
    setCoachPick(
      activeMembership.coachId
        ? { profileId: activeMembership.coachId, fullName: activeMembership.coachFullName, role: "coach", branchId: null, isActive: true }
        : null,
    );
    setCoachSessionCountText(activeMembership.sessionCount ? String(activeMembership.sessionCount) : "");
    setCoachError(null);
    setIsEditingCoach(true);
  }

  async function handleSaveCoach() {
    if (!activeMembership) return;
    setCoachError(null);
    setIsSavingCoach(true);

    const result = await getReceptionModule().assignMembershipCoach.execute({
      membershipId: activeMembership.membershipId,
      coachId: coachPick?.profileId ?? null,
      sessionCount: coachPick && coachSessionCountText.trim() ? Number(coachSessionCountText) : null,
    });

    setIsSavingCoach(false);

    if (result.isErr) {
      setCoachError(translateErrorCode(result.error.code));
      return;
    }
    setIsEditingCoach(false);
    void loadDetail();
  }

  async function handleDelete() {
    setDeleteError(null);
    setIsDeleting(true);

    const result = await getReceptionModule().deleteMember.execute(memberId);

    setIsDeleting(false);

    if (result.isErr) {
      setDeleteError(translateErrorCode(result.error.code));
      return;
    }

    router.replace("/members");
  }

  if (isLoading) {
    return <p className="text-muted">Loading…</p>;
  }

  if (loadError || !detail) {
    return <p className="text-red-400">{loadError ?? "Something went wrong."}</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white/10">
          {detail.photoUrl ? (
            // Plain <img>, not next/image: a signed Supabase Storage URL isn't a domain we can pre-register with next/image.
            <img src={detail.photoUrl} alt={detail.fullName} className="h-16 w-16 object-cover" />
          ) : (
            <span className="text-xs text-muted">{detail.memberCode}</span>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-ink">{detail.fullName}</h1>
          <p className="text-sm text-muted">{detail.memberCode}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => void handleCheckIn()} disabled={isCheckingIn}>
          {isCheckingIn ? "Checking in…" : "Check In"}
        </Button>
        <Button variant="secondary" onClick={() => setIsQrVisible((visible) => !visible)}>
          {isQrVisible ? "Hide QR Code" : "Show QR Code"}
        </Button>
        <Button variant="secondary" onClick={() => setIsRenewOpen((open) => !open)}>
          {isRenewOpen ? "Cancel Renewal" : "Renew Membership"}
        </Button>
        <Button variant="secondary" onClick={() => setIsAddPackageOpen((open) => !open)}>
          {isAddPackageOpen ? "Cancel" : "+ Add Package"}
        </Button>
        {role && CAN_DELETE_MEMBER.has(role) ? (
          <Button variant="danger" onClick={() => setIsDeleteConfirmOpen((open) => !open)}>
            Delete Member
          </Button>
        ) : null}
        {checkInFeedback ? (
          <span className={checkInFeedback.isError ? "text-sm text-red-400" : "text-sm text-gold"}>
            {checkInFeedback.text}
          </span>
        ) : null}
      </div>

      {isDeleteConfirmOpen ? (
        <Card className="space-y-3 border-red-500/40">
          <p className="text-sm font-semibold text-red-400">
            Permanently delete {detail.fullName} ({detail.memberCode})?
          </p>
          <p className="text-sm text-muted">
            This erases the member, all their memberships, payment records, and check-in history. This cannot be
            undone.
          </p>
          {deleteError ? <p className="text-sm text-red-400">{deleteError}</p> : null}
          <div className="flex gap-3">
            <Button variant="danger" onClick={() => void handleDelete()} isLoading={isDeleting}>
              Yes, Delete Permanently
            </Button>
            <Button variant="secondary" type="button" onClick={() => setIsDeleteConfirmOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {isQrVisible ? (
        <Card className="flex flex-col items-center gap-2">
          <QrCodeImage value={detail.qrCode} />
          <p className="text-xs text-muted">This code identifies the member for Check-In.</p>
        </Card>
      ) : null}

      {renewSuccess ? <p className="text-sm text-gold">{renewSuccess}</p> : null}

      {isRenewOpen ? (
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-ink">Renew Membership</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {membershipTypes.map((type) => (
              <OptionCard
                key={type.id}
                label={type.name}
                isSelected={renewTypeId === type.id}
                onClick={() => {
                  setRenewTypeId(type.id);
                  if (!renewPriceText && type.price > 0) setRenewPriceText(String(type.price));
                }}
              />
            ))}
          </div>
          <TextField label="Receipt Number" value={renewReceiptNumber} onChange={(e) => setRenewReceiptNumber(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Price" type="number" value={renewPriceText} onChange={(e) => setRenewPriceText(e.target.value)} />
            <TextField label="Discount" type="number" value={renewDiscountText} onChange={(e) => setRenewDiscountText(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {PAYMENT_METHODS.map((option) => (
              <OptionCard
                key={option.value}
                label={option.label}
                isSelected={renewPaymentMethod === option.value}
                onClick={() => setRenewPaymentMethod(option.value)}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={renewWantsCoach}
              onChange={(e) => {
                setRenewWantsCoach(e.target.checked);
                if (!e.target.checked) {
                  setRenewCoach(null);
                  setRenewSessionCountText("");
                }
              }}
              className="h-4 w-4 accent-gold"
            />
            Assign a Coach
          </label>
          {renewWantsCoach ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <StaffPicker selected={renewCoach} onSelect={setRenewCoach} roleFilter="coach" label="Coach" />
              </div>
              <TextField
                label="Number of Sessions"
                type="number"
                min={1}
                value={renewSessionCountText}
                onChange={(e) => setRenewSessionCountText(e.target.value)}
              />
            </div>
          ) : null}
          {renewError ? <p className="text-sm text-red-400">{renewError}</p> : null}
          <Button
            onClick={() => void handleRenew()}
            isLoading={isRenewing}
            disabled={!renewTypeId || !renewPaymentMethod || !renewReceiptNumber.trim()}
          >
            Confirm Renewal
          </Button>
        </Card>
      ) : null}

      {addPackageSuccess ? <p className="text-sm text-gold">{addPackageSuccess}</p> : null}

      {isAddPackageOpen ? (
        <Card className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Add Package</h2>
            <p className="text-sm text-muted">
              Sells a new membership (e.g. Personal Training) alongside whatever this member already has active — it
              doesn&apos;t replace or expire their existing membership.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {membershipTypes.map((type) => (
              <OptionCard
                key={type.id}
                label={type.name}
                isSelected={addPackageTypeId === type.id}
                onClick={() => {
                  setAddPackageTypeId(type.id);
                  if (!addPackagePriceText && type.price > 0) setAddPackagePriceText(String(type.price));
                }}
              />
            ))}
          </div>
          <TextField
            label="Receipt Number"
            value={addPackageReceiptNumber}
            onChange={(e) => setAddPackageReceiptNumber(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label="Price" type="number" value={addPackagePriceText} onChange={(e) => setAddPackagePriceText(e.target.value)} />
            <TextField
              label="Discount"
              type="number"
              value={addPackageDiscountText}
              onChange={(e) => setAddPackageDiscountText(e.target.value)}
            />
            <TextField
              label="Start Date"
              type="date"
              value={addPackageStartDate}
              onChange={(e) => setAddPackageStartDate(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {PAYMENT_METHODS.map((option) => (
              <OptionCard
                key={option.value}
                label={option.label}
                isSelected={addPackagePaymentMethod === option.value}
                onClick={() => setAddPackagePaymentMethod(option.value)}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={addPackageWantsCoach}
              onChange={(e) => {
                setAddPackageWantsCoach(e.target.checked);
                if (!e.target.checked) {
                  setAddPackageCoach(null);
                  setAddPackageSessionCountText("");
                }
              }}
              className="h-4 w-4 accent-gold"
            />
            Assign a Coach
          </label>
          {addPackageWantsCoach ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <StaffPicker selected={addPackageCoach} onSelect={setAddPackageCoach} roleFilter="coach" label="Coach" />
              </div>
              <TextField
                label="Number of Sessions"
                type="number"
                min={1}
                value={addPackageSessionCountText}
                onChange={(e) => setAddPackageSessionCountText(e.target.value)}
              />
            </div>
          ) : null}
          {addPackageError ? <p className="text-sm text-red-400">{addPackageError}</p> : null}
          <Button
            onClick={() => void handleAddPackage()}
            isLoading={isAddingPackage}
            disabled={!addPackageTypeId || !addPackagePaymentMethod || !addPackageReceiptNumber.trim()}
          >
            Confirm
          </Button>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Member Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <TextField label="Mobile Number" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <SelectField label="Gender" value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="">—</option>
            {GENDERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <TextField label="Date of Birth" placeholder="YYYY-MM-DD" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          <TextField label="National ID" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          <TextField label="Emergency Contact Name" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
          <TextField label="Emergency Contact Phone" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} />
          <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} className="sm:col-span-2" />
          <TextAreaField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="sm:col-span-2" />
        </div>
        {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}
        {savedAt ? <p className="text-sm text-gold">Changes saved.</p> : null}
        <Button onClick={() => void handleSave()} isLoading={isSaving} disabled={!fullName.trim() || !phone.trim()}>
          Save
        </Button>
      </Card>

      {activeMembership ? (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Coach</h2>
          {isEditingCoach ? (
            <div className="space-y-3">
              <StaffPicker selected={coachPick} onSelect={setCoachPick} roleFilter="coach" label="Coach" />
              {coachPick ? (
                <TextField
                  label="Number of Sessions"
                  type="number"
                  min={1}
                  value={coachSessionCountText}
                  onChange={(e) => setCoachSessionCountText(e.target.value)}
                />
              ) : null}
              {coachError ? <p className="text-sm text-red-400">{coachError}</p> : null}
              <div className="flex gap-3">
                <Button onClick={() => void handleSaveCoach()} isLoading={isSavingCoach}>
                  Save
                </Button>
                <Button variant="secondary" onClick={() => setIsEditingCoach(false)} disabled={isSavingCoach}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink">
                {activeMembership.coachFullName
                  ? `${activeMembership.coachFullName}${
                      activeMembership.sessionCount ? ` (${activeMembership.sessionCount} sessions)` : ""
                    }`
                  : <span className="text-muted">No coach assigned to the current membership.</span>}
              </p>
              <Button variant="secondary" onClick={startEditCoach}>
                {activeMembership.coachFullName ? "Change Coach" : "Assign a Coach"}
              </Button>
            </div>
          )}
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-ink">Membership History</h2>
        {detail.membershipHistory.length === 0 ? (
          <p className="text-sm text-muted">No membership history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Number</th>
                  <th className="py-2 pr-4">Period</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">Payment</th>
                  <th className="py-2 pr-4">Coach</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.membershipHistory.map((entry) => (
                  <tr key={entry.membershipId} className="border-t border-white/5">
                    <td className="py-2 pr-4">{entry.membershipTypeName}</td>
                    <td className="py-2 pr-4 text-muted">{entry.membershipNumber}</td>
                    <td className="py-2 pr-4 text-muted">
                      {entry.startDate} → {entry.endDate}
                    </td>
                    <td className="py-2 pr-4 text-gold">{entry.finalPrice.toLocaleString()} EGP</td>
                    <td className="py-2 pr-4 text-muted capitalize">{entry.paymentMethod.replace("_", " ")}</td>
                    <td className="py-2 pr-4 text-muted">
                      {entry.coachFullName
                        ? `${entry.coachFullName}${entry.sessionCount ? ` (${entry.sessionCount} sessions)` : ""}`
                        : "—"}
                    </td>
                    <td
                      className={`py-2 pr-4 font-medium ${
                        entry.status === "active" ? "text-gold" : entry.status === "expired" ? "text-red-400" : "text-muted"
                      }`}
                    >
                      {entry.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Attendance</h2>
          <p className="text-sm text-muted">
            Total visits: <span className="font-semibold text-gold">{checkInHistory.length}</span>
          </p>
        </div>
        {isLoadingCheckInHistory ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : checkInHistory.length === 0 ? (
          <p className="text-sm text-muted">No check-ins yet.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Checked In By</th>
                </tr>
              </thead>
              <tbody>
                {checkInHistory.map((entry) => (
                  <tr key={entry.checkInId} className="border-t border-white/5">
                    <td className="py-2 pr-4 text-ink">{entry.checkedInAt.toLocaleDateString()}</td>
                    <td className="py-2 pr-4 text-muted">{entry.checkedInAt.toLocaleTimeString()}</td>
                    <td className="py-2 pr-4 text-muted">{entry.checkedInByName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
