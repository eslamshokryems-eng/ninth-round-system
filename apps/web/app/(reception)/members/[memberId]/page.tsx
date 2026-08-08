"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { Gender, MemberDetail, MembershipType, PaymentMethod } from "@9thround/reception";
import { getReceptionModule } from "../../../../src/lib/composition-root";
import { translateErrorCode } from "../../../../src/lib/translate-error";
import { Button } from "../../../../src/components/ui/button";
import { Card } from "../../../../src/components/ui/card";
import { TextField, TextAreaField } from "../../../../src/components/ui/text-field";
import { SelectField } from "../../../../src/components/ui/select-field";
import { OptionCard } from "../../../../src/components/ui/option-card";
import { QrCodeImage } from "../../../../src/components/ui/qr-code";

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
  const memberId = params.memberId;

  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    });

    setIsRenewing(false);

    if (result.isErr) {
      setRenewError(translateErrorCode(result.error.code));
      return;
    }

    setRenewSuccess(`Renewed — new membership ${result.value.membershipNumber}, valid until ${result.value.endDate}.`);
    setIsRenewOpen(false);
    void loadDetail();
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
        {checkInFeedback ? (
          <span className={checkInFeedback.isError ? "text-sm text-red-400" : "text-sm text-gold"}>
            {checkInFeedback.text}
          </span>
        ) : null}
      </div>

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
    </div>
  );
}
