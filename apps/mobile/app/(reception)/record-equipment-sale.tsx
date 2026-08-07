import { useMemo, useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { PaymentMethod } from "@9thround/reception";
import { BackButton, Button, Card, OptionCard, ScreenContainer, Text, TextField } from "@9thround/ui/native";
import { useAuthStore } from "../../src/features/auth/store";
import { getReceptionModule } from "../../src/lib/composition-root";
import { translateErrorCode } from "../../src/lib/translate-error";

const PAYMENT_METHODS: { value: PaymentMethod; labelKey: string }[] = [
  { value: "cash", labelKey: "reception.membership.paymentCash" },
  { value: "visa", labelKey: "reception.membership.paymentVisa" },
  { value: "instapay", labelKey: "reception.membership.paymentInstapay" },
  { value: "vodafone_cash", labelKey: "reception.membership.paymentVodafoneCash" },
];

export default function RecordEquipmentSaleScreen() {
  const { t } = useTranslation();
  const branchId = useAuthStore((state) => state.branchId);

  const [itemName, setItemName] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [unitPriceText, setUnitPriceText] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const quantity = Number(quantityText) || 0;
  const unitPrice = Number(unitPriceText) || 0;
  const totalPrice = useMemo(() => Math.max(quantity * unitPrice, 0), [quantity, unitPrice]);

  const isFormComplete = itemName.trim().length > 0 && quantity > 0 && unitPrice >= 0 && paymentMethod !== null;

  async function handleSave() {
    if (!branchId || !paymentMethod) return;

    setErrorMessage(null);
    setIsSaving(true);

    const result = await getReceptionModule().recordEquipmentSale.execute({
      branchId,
      itemName: itemName.trim(),
      quantity,
      unitPrice,
      paymentMethod,
      buyerName: buyerName.trim() || null,
      buyerPhone: buyerPhone.trim() || null,
      notes: notes.trim() || null,
    });

    setIsSaving(false);

    if (result.isErr) {
      setErrorMessage(t(translateErrorCode(result.error.code)));
      return;
    }

    router.back();
  }

  return (
    <ScreenContainer>
      <View className="gap-6">
        <View className="flex-row items-center gap-3">
          <BackButton onPress={() => router.back()} />
          <Text variant="display">{t("reception.equipmentSales.recordAction")}</Text>
        </View>

        <View className="gap-3">
          <TextField label={t("reception.equipmentSales.itemNameLabel")} value={itemName} onChangeText={setItemName} />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <TextField
                label={t("reception.equipmentSales.quantityLabel")}
                value={quantityText}
                onChangeText={setQuantityText}
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <TextField
                label={t("reception.equipmentSales.unitPriceLabel")}
                value={unitPriceText}
                onChangeText={setUnitPriceText}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <Card className="flex-row items-center justify-between">
            <Text variant="body" color="muted">
              {t("reception.equipmentSales.totalPriceLabel")}
            </Text>
            <Text variant="title" color="gold">
              {totalPrice.toLocaleString()} EGP
            </Text>
          </Card>

          <TextField label={t("reception.equipmentSales.buyerNameLabel")} value={buyerName} onChangeText={setBuyerName} />
          <TextField
            label={t("reception.equipmentSales.buyerPhoneLabel")}
            value={buyerPhone}
            onChangeText={setBuyerPhone}
            keyboardType="phone-pad"
          />
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
          label={t("reception.equipmentSales.save")}
          onPress={() => void handleSave()}
          isLoading={isSaving}
          disabled={!isFormComplete}
        />
        <Button label={t("common.cancel")} onPress={() => router.back()} variant="secondary" />
      </View>
    </ScreenContainer>
  );
}
