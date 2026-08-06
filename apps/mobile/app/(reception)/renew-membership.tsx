import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { MembershipType, PaymentMethod } from "@9thround/reception";
import { BackButton, Button, Card, OptionCard, ScreenContainer, Text, TextField } from "@9thround/ui/native";
import { getReceptionModule } from "../../src/lib/composition-root";
import { translateErrorCode } from "../../src/lib/translate-error";

const PAYMENT_METHODS: { value: PaymentMethod; labelKey: string }[] = [
  { value: "cash", labelKey: "reception.membership.paymentCash" },
  { value: "visa", labelKey: "reception.membership.paymentVisa" },
  { value: "instapay", labelKey: "reception.membership.paymentInstapay" },
  { value: "vodafone_cash", labelKey: "reception.membership.paymentVodafoneCash" },
];

/**
 * One-click Renewal (docs/phase-1/14-reception-membership.md,
 * packages/reception/README.md "What's planned next"). Reached from a
 * member's search result — the member already exists, so this only asks
 * for what a renewal actually needs (type, receipt number, price/discount,
 * payment method), not the full registration form. The new period's start
 * date is computed server-side (renew_membership()), not entered here —
 * it depends on the member's current membership row, which this screen
 * doesn't need to know about to stay correct.
 */
export default function RenewMembershipScreen() {
  const { t } = useTranslation();
  const { memberId, fullName } = useLocalSearchParams<{ memberId: string; fullName?: string }>();

  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(true);

  const [membershipTypeId, setMembershipTypeId] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [priceText, setPriceText] = useState("");
  const [discountText, setDiscountText] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [notes, setNotes] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successResult, setSuccessResult] = useState<{ membershipNumber: string; endDate: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await getReceptionModule().listMembershipTypes.execute();
      setIsLoadingTypes(false);
      if (result.isOk) setMembershipTypes(result.value);
    })();
  }, []);

  function selectType(type: MembershipType) {
    setMembershipTypeId(type.id);
    if (!priceText && type.price > 0) {
      setPriceText(String(type.price));
    }
  }

  const price = Number(priceText) || 0;
  const discount = Number(discountText) || 0;
  const finalPrice = Math.max(price - discount, 0);

  const isFormComplete =
    !!memberId &&
    membershipTypeId !== null &&
    receiptNumber.trim().length > 0 &&
    paymentMethod !== null &&
    price >= 0;

  async function handleRenew() {
    if (!memberId || !membershipTypeId || !paymentMethod) return;

    setErrorMessage(null);
    setIsSaving(true);

    const result = await getReceptionModule().renewMembership.execute({
      memberId,
      membershipTypeId,
      receiptNumber: receiptNumber.trim(),
      price,
      discount,
      paymentMethod,
      notes: notes.trim() || null,
    });

    setIsSaving(false);

    if (result.isErr) {
      setErrorMessage(t(translateErrorCode(result.error.code)));
      return;
    }

    setSuccessResult({ membershipNumber: result.value.membershipNumber, endDate: result.value.endDate });
  }

  if (successResult) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center gap-4">
          <Text variant="display" color="gold" style={{ textAlign: "center" }}>
            {t("reception.membership.renewSuccessTitle")}
          </Text>
          <Text variant="title" style={{ textAlign: "center" }}>
            {successResult.membershipNumber}
          </Text>
          <Text variant="body" color="muted" style={{ textAlign: "center" }}>
            {t("reception.membership.renewSuccessSubtitle", { date: successResult.endDate })}
          </Text>
        </View>
        <Button label={t("common.done")} onPress={() => router.replace("/(reception)")} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View className="gap-6">
        <View className="flex-row items-center gap-3">
          <BackButton onPress={() => router.back()} />
          <Text variant="display">{t("reception.membership.renewTitle")}</Text>
        </View>

        {fullName ? (
          <Card>
            <Text variant="title">{fullName}</Text>
          </Card>
        ) : null}

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

          <TextField
            label={t("reception.membership.receiptNumberLabel")}
            value={receiptNumber}
            onChangeText={setReceiptNumber}
            autoCapitalize="characters"
          />

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
          label={t("reception.membership.renewAction")}
          onPress={() => void handleRenew()}
          isLoading={isSaving}
          disabled={!isFormComplete}
        />
        <Button label={t("common.cancel")} onPress={() => router.back()} variant="secondary" />
      </View>
    </ScreenContainer>
  );
}
