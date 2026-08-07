import { useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { ExpenseCategory, PaymentMethod } from "@9thround/reception";
import { BackButton, Button, OptionCard, ScreenContainer, Text, TextField } from "@9thround/ui/native";
import { useAuthStore } from "../../src/features/auth/store";
import { getReceptionModule } from "../../src/lib/composition-root";
import { translateErrorCode } from "../../src/lib/translate-error";

const CATEGORIES: { value: ExpenseCategory; labelKey: string }[] = [
  { value: "rent", labelKey: "reception.expenses.categoryRent" },
  { value: "utilities", labelKey: "reception.expenses.categoryUtilities" },
  { value: "salaries", labelKey: "reception.expenses.categorySalaries" },
  { value: "maintenance", labelKey: "reception.expenses.categoryMaintenance" },
  { value: "supplies", labelKey: "reception.expenses.categorySupplies" },
  { value: "marketing", labelKey: "reception.expenses.categoryMarketing" },
  { value: "other", labelKey: "reception.expenses.categoryOther" },
];

const PAYMENT_METHODS: { value: PaymentMethod; labelKey: string }[] = [
  { value: "cash", labelKey: "reception.membership.paymentCash" },
  { value: "visa", labelKey: "reception.membership.paymentVisa" },
  { value: "instapay", labelKey: "reception.membership.paymentInstapay" },
  { value: "vodafone_cash", labelKey: "reception.membership.paymentVodafoneCash" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RecordExpenseScreen() {
  const { t } = useTranslation();
  const branchId = useAuthStore((state) => state.branchId);

  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [receiptReference, setReceiptReference] = useState("");
  const [notes, setNotes] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const amount = Number(amountText) || 0;
  const isFormComplete = category !== null && paymentMethod !== null && amount > 0;

  async function handleSave() {
    if (!branchId || !category || !paymentMethod) return;

    setErrorMessage(null);
    setIsSaving(true);

    const result = await getReceptionModule().recordExpense.execute({
      branchId,
      category,
      description: description.trim() || null,
      amount,
      expenseDate,
      paymentMethod,
      receiptReference: receiptReference.trim() || null,
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
          <Text variant="display">{t("reception.expenses.recordAction")}</Text>
        </View>

        <View className="gap-3">
          <Text variant="title">{t("reception.expenses.categoryLabel")}</Text>
          <View className="gap-3">
            {CATEGORIES.map((option) => (
              <OptionCard
                key={option.value}
                label={t(option.labelKey)}
                isSelected={category === option.value}
                onPress={() => setCategory(option.value)}
              />
            ))}
          </View>

          <TextField
            label={t("reception.expenses.descriptionLabel")}
            value={description}
            onChangeText={setDescription}
          />
          <TextField
            label={t("reception.expenses.amountLabel")}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
          />
          <TextField
            label={t("reception.expenses.dateLabel")}
            value={expenseDate}
            onChangeText={setExpenseDate}
            placeholder="YYYY-MM-DD"
          />
          <TextField
            label={t("reception.expenses.receiptReferenceLabel")}
            value={receiptReference}
            onChangeText={setReceiptReference}
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
          label={t("reception.expenses.save")}
          onPress={() => void handleSave()}
          isLoading={isSaving}
          disabled={!isFormComplete}
        />
        <Button label={t("common.cancel")} onPress={() => router.back()} variant="secondary" />
      </View>
    </ScreenContainer>
  );
}
