import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Image, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import QRCode from "react-native-qrcode-svg";
import type { Gender, MembershipType, PaymentMethod } from "@9thround/reception";
import { BackButton, Button, Card, OptionCard, ScreenContainer, Text, TextField } from "@9thround/ui/native";
import { useAuthStore } from "../../src/features/auth/store";
import { getReceptionModule } from "../../src/lib/composition-root";
import { translateErrorCode } from "../../src/lib/translate-error";
import {
  pickMemberPhotoFromCamera,
  pickMemberPhotoFromGallery,
  readFileAsArrayBuffer,
  type PickedMemberPhoto,
} from "../../src/lib/member-photo";

const GENDERS: { value: Gender; labelKey: string }[] = [
  { value: "female", labelKey: "onboarding.bodyMetrics.genderFemale" },
  { value: "male", labelKey: "onboarding.bodyMetrics.genderMale" },
  { value: "unspecified", labelKey: "onboarding.bodyMetrics.genderUnspecified" },
];

const PAYMENT_METHODS: { value: PaymentMethod; labelKey: string }[] = [
  { value: "cash", labelKey: "reception.membership.paymentCash" },
  { value: "visa", labelKey: "reception.membership.paymentVisa" },
  { value: "instapay", labelKey: "reception.membership.paymentInstapay" },
  { value: "vodafone_cash", labelKey: "reception.membership.paymentVodafoneCash" },
];

/** Return to the Dashboard automatically once the success screen has had a moment to register, per the spec's "Return automatically to Reception Dashboard." */
const AUTO_RETURN_DELAY_MS = 2500;

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

/**
 * "+ New Membership" (docs/phase-1/14-reception-membership.md §14.5) — one
 * form creating a member (with an optional profile photo and a permanent
 * QR identity), their first membership, and its payment record together,
 * via the register_membership() RPC (atomic, RLS-enforced). Membership
 * Number/QR Code/End Date/Final Price are never typed by Reception —
 * generated (server-side) or computed (client-side, for live preview) —
 * matching "Automatically calculate" in the spec.
 */
export default function NewMembershipScreen() {
  const { t } = useTranslation();
  const branchId = useAuthStore((state) => state.branchId);

  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(true);
  const [previewMembershipNumber, setPreviewMembershipNumber] = useState<string | null>(null);

  const [photo, setPhoto] = useState<PickedMemberPhoto | null>(null);
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

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await getReceptionModule().listMembershipTypes.execute();
      setIsLoadingTypes(false);
      if (result.isOk) setMembershipTypes(result.value);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const result = await getReceptionModule().getNextMembershipNumber.execute();
      if (result.isOk) setPreviewMembershipNumber(result.value);
    })();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => router.replace("/(reception)"), AUTO_RETURN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [success]);

  const selectedType = membershipTypes.find((type) => type.id === membershipTypeId) ?? null;

  function selectType(type: MembershipType) {
    setMembershipTypeId(type.id);
    if (!priceText && type.price > 0) {
      setPriceText(String(type.price));
    }
  }

  async function handleTakePhoto() {
    const picked = await pickMemberPhotoFromCamera();
    if (picked) setPhoto(picked);
  }

  async function handleChoosePhoto() {
    const picked = await pickMemberPhotoFromGallery();
    if (picked) setPhoto(picked);
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
    if (photo) {
      const data = await readFileAsArrayBuffer(photo.uri);
      const uploadResult = await getReceptionModule().uploadMemberPhoto.execute({
        branchId,
        data,
        contentType: "image/jpeg",
        fileExtension: "jpg",
      });
      if (uploadResult.isErr) {
        setIsSaving(false);
        setErrorMessage(t(translateErrorCode(uploadResult.error.code)));
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
    });

    setIsSaving(false);

    if (result.isErr) {
      setErrorMessage(t(translateErrorCode(result.error.code)));
      return;
    }

    setSuccess({ membershipNumber: result.value.membershipNumber, qrCode: result.value.memberQrCode });
  }

  if (success) {
    return <RegistrationSuccess membershipNumber={success.membershipNumber} qrCode={success.qrCode} fullName={fullName} />;
  }

  return (
    <ScreenContainer>
      <View className="gap-6">
        <View className="flex-row items-center gap-3">
          <BackButton onPress={() => router.back()} />
          <Text variant="display">{t("reception.membership.newMembership")}</Text>
        </View>

        <Card className="flex-row items-center justify-between">
          <Text variant="body" color="muted">
            {t("reception.membership.membershipNumberPreviewLabel")}
          </Text>
          <Text variant="title" color="gold">
            {previewMembershipNumber ?? t("common.loading")}
          </Text>
        </Card>

        <View className="items-center gap-3">
          <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white/[0.06]">
            {photo ? (
              <Image source={{ uri: photo.uri }} style={{ width: 96, height: 96 }} />
            ) : (
              <Text variant="caption" color="muted">
                {t("reception.membership.photoNone")}
              </Text>
            )}
          </View>
          <View className="flex-row gap-3">
            <Button label={t("reception.membership.takePhoto")} variant="secondary" size="md" onPress={() => void handleTakePhoto()} />
            <Button
              label={t("reception.membership.chooseFromGallery")}
              variant="secondary"
              size="md"
              onPress={() => void handleChoosePhoto()}
            />
          </View>
        </View>

        <View className="gap-3">
          <Text variant="title">{t("reception.membership.section.member")}</Text>
          <TextField
            label={t("reception.membership.receiptNumberLabel")}
            value={receiptNumber}
            onChangeText={setReceiptNumber}
            autoCapitalize="characters"
          />
          <TextField label={t("reception.membership.fullNameLabel")} value={fullName} onChangeText={setFullName} />
          <TextField
            label={t("reception.membership.phoneLabel")}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <View className="gap-2">
            <Text variant="caption" color="muted">
              {t("onboarding.bodyMetrics.genderLabel")}
            </Text>
            <View className="flex-row gap-3">
              {GENDERS.map((option) => (
                <View key={option.value} className="flex-1">
                  <OptionCard
                    label={t(option.labelKey)}
                    isSelected={gender === option.value}
                    onPress={() => setGender(option.value)}
                  />
                </View>
              ))}
            </View>
          </View>
          <TextField
            label={t("reception.membership.dateOfBirthLabel")}
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            placeholder="YYYY-MM-DD"
          />
          <TextField
            label={t("reception.membership.nationalIdLabel")}
            value={nationalId}
            onChangeText={setNationalId}
            keyboardType="number-pad"
          />
          <TextField label={t("reception.membership.addressLabel")} value={address} onChangeText={setAddress} />
          <TextField
            label={t("reception.membership.emergencyContactNameLabel")}
            value={emergencyContactName}
            onChangeText={setEmergencyContactName}
          />
          <TextField
            label={t("reception.membership.emergencyContactPhoneLabel")}
            value={emergencyContactPhone}
            onChangeText={setEmergencyContactPhone}
            keyboardType="phone-pad"
          />
        </View>

        <View className="gap-3">
          <Text variant="title">{t("reception.membership.section.membershipInfo")}</Text>
          <Text variant="caption" color="muted">
            {t("reception.membership.membershipTypeLabel")}
          </Text>
          {isLoadingTypes ? (
            <Text variant="body" color="muted">
              {t("common.loading")}
            </Text>
          ) : (
            <View className="gap-3">
              {membershipTypes.map((type) => (
                <OptionCard
                  key={type.id}
                  label={type.name}
                  isSelected={membershipTypeId === type.id}
                  onPress={() => selectType(type)}
                />
              ))}
            </View>
          )}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <TextField
                label={t("reception.membership.priceLabel")}
                value={priceText}
                onChangeText={setPriceText}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1">
              <TextField
                label={t("reception.membership.discountLabel")}
                value={discountText}
                onChangeText={setDiscountText}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <Card className="flex-row items-center justify-between">
            <Text variant="body" color="muted">
              {t("reception.membership.finalPriceLabel")}
            </Text>
            <Text variant="title" color="gold">
              {finalPrice.toLocaleString()} EGP
            </Text>
          </Card>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <TextField
                label={t("reception.membership.startDateLabel")}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View className="flex-1">
              <TextField
                label={t("reception.membership.endDateLabel")}
                value={endDate ?? t("reception.membership.endDatePending")}
                editable={false}
              />
            </View>
          </View>
        </View>

        <View className="gap-3">
          <Text variant="title">{t("reception.membership.section.payment")}</Text>
          <View className="flex-row flex-wrap gap-3">
            {PAYMENT_METHODS.map((option) => (
              <View key={option.value} style={{ minWidth: "45%" }} className="flex-1">
                <OptionCard
                  label={t(option.labelKey)}
                  isSelected={paymentMethod === option.value}
                  onPress={() => setPaymentMethod(option.value)}
                />
              </View>
            ))}
          </View>
          <TextField
            label={t("reception.membership.notesLabel")}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            style={{ minHeight: 80, textAlignVertical: "top" }}
          />
        </View>

        {errorMessage ? (
          <Text variant="caption" className="text-red-400">
            {errorMessage}
          </Text>
        ) : null}
      </View>

      <View className="gap-3">
        <Button
          label={t("reception.membership.save")}
          onPress={() => void handleSave()}
          isLoading={isSaving}
          disabled={!isFormComplete}
        />
        <Button label={t("common.cancel")} onPress={() => router.back()} variant="secondary" />
      </View>
    </ScreenContainer>
  );
}

function RegistrationSuccess({
  membershipNumber,
  qrCode,
  fullName,
}: {
  membershipNumber: string;
  qrCode: string;
  fullName: string;
}) {
  const { t } = useTranslation();

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(1, { duration: 420 }),
    transform: [{ scale: withTiming(1, { duration: 420 }) }],
  }));

  return (
    <ScreenContainer>
      <View className="flex-1 items-center justify-center gap-4">
        <Animated.View
          style={[{ opacity: 0, transform: [{ scale: 0.8 }] }, animatedStyle]}
          className="items-center gap-4"
        >
          <Text variant="display" color="gold" style={{ textAlign: "center" }}>
            {t("reception.membership.successTitle")}
          </Text>
          <Text variant="title" style={{ textAlign: "center" }}>
            {membershipNumber}
          </Text>
          <Text variant="body" color="muted" style={{ textAlign: "center" }}>
            {t("reception.membership.successSubtitle", { name: fullName })}
          </Text>
          <View className="rounded-card bg-white p-4">
            <QRCode value={qrCode} size={180} backgroundColor="#FFFFFF" color="#0B0B0C" />
          </View>
          <Text variant="caption" color="muted" style={{ textAlign: "center" }}>
            {t("reception.membership.qrCodeHint")}
          </Text>
        </Animated.View>
      </View>
      <Button label={t("common.done")} onPress={() => router.replace("/(reception)")} />
    </ScreenContainer>
  );
}
