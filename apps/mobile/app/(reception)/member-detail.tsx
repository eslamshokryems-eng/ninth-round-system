import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import type { Gender, MemberDetail, MembershipHistoryEntry } from "@9thround/reception";
import { BackButton, Button, Card, OptionCard, ScreenContainer, Text, TextField } from "@9thround/ui/native";
import { getReceptionModule } from "../../src/lib/composition-root";
import { translateErrorCode } from "../../src/lib/translate-error";

const GENDERS: { value: Gender; labelKey: string }[] = [
  { value: "female", labelKey: "onboarding.bodyMetrics.genderFemale" },
  { value: "male", labelKey: "onboarding.bodyMetrics.genderMale" },
  { value: "unspecified", labelKey: "onboarding.bodyMetrics.genderUnspecified" },
];

/**
 * Member detail/edit (packages/reception/README.md "What's planned next")
 * — a member's full profile plus their complete membership history (not
 * just the one active row search shows), and an edit form backed by
 * UpdateMemberUseCase. Reached by tapping a member's search result card.
 */
export default function MemberDetailScreen() {
  const { t } = useTranslation();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();

  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [checkInFeedback, setCheckInFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!memberId) return;
    setIsLoading(true);
    setLoadError(null);
    const result = await getReceptionModule().getMemberDetail.execute(memberId);
    setIsLoading(false);
    if (result.isErr) {
      setLoadError(t(translateErrorCode(result.error.code)));
      return;
    }
    const value = result.value;
    setDetail(value);
    setFullName(value.fullName);
    setPhone(value.phone);
    setEmail(value.email ?? "");
    setGender(value.gender);
    setDateOfBirth(value.dateOfBirth ?? "");
    setNationalId(value.nationalId ?? "");
    setEmergencyContactName(value.emergencyContactName ?? "");
    setEmergencyContactPhone(value.emergencyContactPhone ?? "");
    setAddress(value.address ?? "");
    setNotes(value.notes ?? "");
  }, [memberId, t]);

  // useFocusEffect (not a plain useEffect) so returning from the Renew
  // flow re-fetches and shows the just-completed renewal without a manual
  // pull-to-refresh — it also covers the initial mount, since a screen is
  // focused the moment it's navigated to.
  useFocusEffect(
    useCallback(() => {
      void loadDetail();
    }, [loadDetail]),
  );

  const isFormComplete = fullName.trim().length > 0 && phone.trim().length > 0;

  async function handleSave() {
    if (!memberId) return;

    setErrorMessage(null);
    setSavedAt(null);
    setIsSaving(true);

    const result = await getReceptionModule().updateMember.execute({
      memberId,
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      gender,
      dateOfBirth: dateOfBirth.trim() || null,
      nationalId: nationalId.trim() || null,
      emergencyContactName: emergencyContactName.trim() || null,
      emergencyContactPhone: emergencyContactPhone.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    });

    setIsSaving(false);

    if (result.isErr) {
      setErrorMessage(t(translateErrorCode(result.error.code)));
      return;
    }

    setSavedAt(Date.now());
  }

  async function handleCheckIn() {
    if (!memberId) return;

    setCheckInFeedback(null);
    setIsCheckingIn(true);

    const result = await getReceptionModule().checkInMember.execute(memberId);

    setIsCheckingIn(false);

    if (result.isErr) {
      setCheckInFeedback({ text: t(translateErrorCode(result.error.code)), isError: true });
      return;
    }

    setCheckInFeedback({ text: t("reception.membership.checkInSuccess"), isError: false });
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C9A227" />
        </View>
      </ScreenContainer>
    );
  }

  if (loadError || !detail) {
    return (
      <ScreenContainer>
        <View className="flex-row items-center gap-3">
          <BackButton onPress={() => router.back()} />
          <Text variant="display">{t("reception.membership.memberDetailTitle")}</Text>
        </View>
        <Text variant="body" className="text-red-400">
          {loadError ?? t("common.error.generic")}
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View className="gap-6">
        <View className="flex-row items-center gap-3">
          <BackButton onPress={() => router.back()} />
          <View>
            <Text variant="display">{detail.fullName}</Text>
            <Text variant="caption" color="muted">
              {detail.memberCode}
            </Text>
          </View>
        </View>

        <View className="gap-2">
          <Button
            label={t("reception.membership.checkInAction")}
            variant="secondary"
            onPress={() => void handleCheckIn()}
            isLoading={isCheckingIn}
          />
          {checkInFeedback ? (
            <Text
              variant="caption"
              className={checkInFeedback.isError ? "text-red-400" : "text-gold"}
              style={{ textAlign: "center" }}
            >
              {checkInFeedback.text}
            </Text>
          ) : null}
        </View>

        <View className="gap-3">
          <Text variant="title">{t("reception.membership.section.member")}</Text>
          <TextField label={t("reception.membership.fullNameLabel")} value={fullName} onChangeText={setFullName} />
          <TextField
            label={t("reception.membership.phoneLabel")}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <TextField
            label={t("reception.membership.emailLabel")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
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
          <TextField label={t("reception.membership.addressLabel")} value={address} onChangeText={setAddress} />
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
        {savedAt ? (
          <Text variant="caption" color="gold">
            {t("reception.membership.memberDetailSaved")}
          </Text>
        ) : null}

        <Button
          label={t("common.save")}
          onPress={() => void handleSave()}
          isLoading={isSaving}
          disabled={!isFormComplete}
        />

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text variant="title">{t("reception.membership.membershipHistoryTitle")}</Text>
            <Button
              label={t("reception.membership.renewAction")}
              variant="secondary"
              size="md"
              onPress={() =>
                router.push({
                  pathname: "/(reception)/renew-membership",
                  params: { memberId: detail.memberId, fullName: detail.fullName },
                })
              }
            />
          </View>
          {detail.membershipHistory.length === 0 ? (
            <Text variant="body" color="muted">
              {t("reception.membership.membershipHistoryEmpty")}
            </Text>
          ) : (
            detail.membershipHistory.map((entry) => <MembershipHistoryCard key={entry.membershipId} entry={entry} />)
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}

function MembershipHistoryCard({ entry }: { entry: MembershipHistoryEntry }) {
  const { t } = useTranslation();
  const statusClassName =
    entry.status === "active" ? "text-gold" : entry.status === "expired" ? "text-red-400" : "text-muted";
  const statusText =
    entry.status === "active"
      ? t("reception.membership.statusActive")
      : entry.status === "expired"
        ? t("reception.membership.statusExpired")
        : t("reception.membership.statusCancelled");

  return (
    <Card className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text variant="body">{entry.membershipTypeName}</Text>
        <Text variant="caption" className={statusClassName}>
          {statusText}
        </Text>
      </View>
      <Text variant="caption" color="muted">
        {entry.membershipNumber} · {entry.startDate} → {entry.endDate}
      </Text>
      <Text variant="caption" color="muted">
        {entry.finalPrice.toLocaleString()} EGP · {t(paymentMethodLabelKey(entry.paymentMethod))}
      </Text>
    </Card>
  );
}

function paymentMethodLabelKey(method: MembershipHistoryEntry["paymentMethod"]): string {
  switch (method) {
    case "cash":
      return "reception.membership.paymentCash";
    case "visa":
      return "reception.membership.paymentVisa";
    case "instapay":
      return "reception.membership.paymentInstapay";
    case "vodafone_cash":
      return "reception.membership.paymentVodafoneCash";
  }
}
