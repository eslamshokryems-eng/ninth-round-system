"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { Gender, MembershipType, PaymentMethod } from "@9thround/reception";
import type { StaffCandidate } from "@9thround/identity";
import { useAuthStore } from "../../../../src/features/auth/store";
import { getReceptionModule } from "../../../../src/lib/composition-root";
import { translateErrorCode } from "../../../../src/lib/translate-error";
import { Button } from "../../../../src/components/ui/button";
import { Card } from "../../../../src/components/ui/card";
import { TextField, TextAreaField } from "../../../../src/components/ui/text-field";
import { OptionCard } from "../../../../src/components/ui/option-card";
import { QrCodeImage } from "../../../../src/components/ui/qr-code";
import { StaffPicker } from "../../../../src/components/staff-picker";

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number): string | null {
  const base = new Date(dateIso);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

interface SuccessState {
  membershipNumber: string;
  qrCode: string;
}

/** Add Member (Phase 6) — the first operational Reception workflow: create a member, their first membership, and its payment record together via register_membership(). */
export default function AddMemberPage() {
  const branchId = useAuthStore((state) => state.branchId);

  const [previewNumber, setPreviewNumber] = useState<string | null>(null);
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");

  const [membershipTypeId, setMembershipTypeId] = useState<string | null>(null);
  const [priceText, setPriceText] = useState("");
  const [discountText, setDiscountText] = useState("0");
  const [startDate, setStartDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [notes, setNotes] = useState("");

  const [wantsCoach, setWantsCoach] = useState(false);
  const [coach, setCoach] = useState<StaffCandidate | null>(null);
  const [sessionCountText, setSessionCountText] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await getReceptionModule().listMembershipTypes.execute();
      if (result.isOk) setMembershipTypes(result.value);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const result = await getReceptionModule().getNextMembershipNumber.execute();
      if (result.isOk) setPreviewNumber(result.value);
    })();
  }, []);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    setPhotoFile(event.target.files?.[0] ?? null);
  }

  const selectedType = membershipTypes.find((type) => type.id === membershipTypeId) ?? null;

  function selectType(type: MembershipType) {
    setMembershipTypeId(type.id);
    if (!priceText && type.price > 0) setPriceText(String(type.price));
  }

  const price = Number(priceText) || 0;
  const discount = Number(discountText) || 0;
  const finalPrice = Math.max(price - discount, 0);
  const endDate = useMemo(
    () => (selectedType ? addDaysIso(startDate, selectedType.durationDays) : null),
    [selectedType, startDate],
  );

  const isFormComplete =
    fullName.trim().length > 0 &&
    phone.trim().length > 0 &&
    receiptNumber.trim().length > 0 &&
    membershipTypeId !== null &&
    paymentMethod !== null &&
    price >= 0;

  async function handleSave() {
    if (!branchId || !membershipTypeId || !paymentMethod) return;

    setErrorMessage(null);
    setIsSaving(true);

    let photoUrl: string | null = null;
    if (photoFile) {
      const data = await photoFile.arrayBuffer();
      const extension = photoFile.name.split(".").pop() || "jpg";
      const uploadResult = await getReceptionModule().uploadMemberPhoto.execute({
        branchId,
        data,
        contentType: photoFile.type || "image/jpeg",
        fileExtension: extension,
      });
      if (uploadResult.isErr) {
        setIsSaving(false);
        setErrorMessage(translateErrorCode(uploadResult.error.code));
        return;
      }
      photoUrl = uploadResult.value.signedUrl;
    }

    const result = await getReceptionModule().registerMembership.execute({
      branchId,
      fullName: fullName.trim(),
      phone: phone.trim(),
      gender,
      dateOfBirth: dateOfBirth.trim() || null,
      nationalId: nationalId.trim() || null,
      membershipTypeId,
      receiptNumber: receiptNumber.trim(),
      price,
      discount,
      startDate,
      paymentMethod,
      notes: notes.trim() || null,
      address: address.trim() || null,
      emergencyContactName: emergencyContactName.trim() || null,
      emergencyContactPhone: emergencyContactPhone.trim() || null,
      photoUrl,
      coachId: wantsCoach ? (coach?.profileId ?? null) : null,
      sessionCount: wantsCoach && sessionCountText.trim() ? Number(sessionCountText) : null,
    });

    setIsSaving(false);

    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }

    setSuccess({ membershipNumber: result.value.membershipNumber, qrCode: result.value.memberQrCode });
  }

  if (success) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold text-gold">Membership Created</h1>
        <p className="text-lg text-ink">{success.membershipNumber}</p>
        <p className="text-sm text-muted">{fullName}&apos;s membership is active.</p>
        <QrCodeImage value={success.qrCode} />
        <p className="text-xs text-muted">This code identifies the member for Check-In.</p>
        <div className="flex gap-3">
          <Link href="/dashboard">
            <Button>Back to Dashboard</Button>
          </Link>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Add Another Member
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Add Member</h1>

      <Card className="flex items-center justify-between">
        <span className="text-sm text-muted">Membership Number</span>
        <span className="text-lg font-semibold text-gold">{previewNumber ?? "Loading…"}</span>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Photo</h2>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white/10">
            {photoPreviewUrl ? (
              // Plain <img>, not next/image: a local blob: URL isn't something next/image can optimize.
              <img src={photoPreviewUrl} alt="Selected" className="h-20 w-20 object-cover" />
            ) : (
              <span className="text-xs text-muted">No Photo</span>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="text-sm text-muted file:mr-3 file:rounded-pill file:border file:border-gold file:bg-transparent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gold hover:file:bg-gold/10"
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Member Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Receipt Number" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} />
          <TextField label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <TextField label="Mobile Number" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField label="Date of Birth" placeholder="YYYY-MM-DD" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          <TextField label="National ID" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <TextField label="Emergency Contact Name" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
          <TextField label="Emergency Contact Phone" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Gender</p>
          <div className="grid grid-cols-3 gap-3">
            {GENDERS.map((option) => (
              <OptionCard
                key={option.value}
                label={option.label}
                isSelected={gender === option.value}
                onClick={() => setGender(option.value)}
              />
            ))}
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Membership Information</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {membershipTypes.map((type) => (
            <OptionCard key={type.id} label={type.name} isSelected={membershipTypeId === type.id} onClick={() => selectType(type)} />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Price" type="number" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
          <TextField label="Discount" type="number" value={discountText} onChange={(e) => setDiscountText(e.target.value)} />
          <TextField label="Start Date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <TextField label="End Date" value={endDate ?? "Select a membership type"} disabled />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-black/30 px-4 py-3">
          <span className="text-sm text-muted">Final Price</span>
          <span className="text-lg font-semibold text-gold">{finalPrice.toLocaleString()} EGP</span>
        </div>
      </Card>

      <Card className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={wantsCoach}
            onChange={(e) => {
              setWantsCoach(e.target.checked);
              if (!e.target.checked) {
                setCoach(null);
                setSessionCountText("");
              }
            }}
            className="h-4 w-4 accent-gold"
          />
          Assign a Coach
        </label>
        {wantsCoach ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <StaffPicker selected={coach} onSelect={setCoach} roleFilter="coach" label="Coach" />
            </div>
            <TextField
              label="Number of Sessions"
              type="number"
              min={1}
              value={sessionCountText}
              onChange={(e) => setSessionCountText(e.target.value)}
            />
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Payment</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PAYMENT_METHODS.map((option) => (
            <OptionCard
              key={option.value}
              label={option.label}
              isSelected={paymentMethod === option.value}
              onClick={() => setPaymentMethod(option.value)}
            />
          ))}
        </div>
        <TextAreaField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Card>

      {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}

      <div className="flex gap-3">
        <Button onClick={() => void handleSave()} isLoading={isSaving} disabled={!isFormComplete}>
          Save Membership
        </Button>
        <Link href="/members">
          <Button variant="secondary" type="button">
            Cancel
          </Button>
        </Link>
      </div>
    </div>
  );
}
