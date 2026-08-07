import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import type { EquipmentSale } from "@9thround/reception";
import { BackButton, Button, Card, IconButton, Text } from "@9thround/ui/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../src/features/auth/store";
import { getReceptionModule } from "../../src/lib/composition-root";
import { translateErrorCode } from "../../src/lib/translate-error";
import { ReceptionSideMenu } from "../../src/components/reception-side-menu";

const PAYMENT_METHOD_LABEL_KEY: Record<EquipmentSale["paymentMethod"], string> = {
  cash: "reception.membership.paymentCash",
  visa: "reception.membership.paymentVisa",
  instapay: "reception.membership.paymentInstapay",
  vodafone_cash: "reception.membership.paymentVodafoneCash",
};

/** Other Sales / sports equipment (مبيعات أخرى - أدوات رياضية, sidebar item) — a chronological list plus the entry point to Record Sale. */
export default function EquipmentSalesScreen() {
  const { t } = useTranslation();
  const branchId = useAuthStore((state) => state.branchId);

  const [sales, setSales] = useState<EquipmentSale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    const result = await getReceptionModule().listEquipmentSales.execute(branchId);
    setIsLoading(false);
    if (result.isErr) {
      setErrorMessage(t(translateErrorCode(result.error.code)));
      return;
    }
    setSales(result.value);
  }, [branchId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-6 py-6">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <BackButton onPress={() => router.back()} />
            <Text variant="display">{t("reception.equipmentSales.title")}</Text>
          </View>
          <IconButton
            name="menu"
            accessibilityLabel={t("reception.sideMenu.title")}
            onPress={() => setIsMenuVisible(true)}
          />
        </View>

        <Button
          label={t("reception.equipmentSales.recordAction")}
          onPress={() => router.push("/(reception)/record-equipment-sale")}
        />

        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#C9A227" />
          </View>
        ) : errorMessage ? (
          <Text variant="body" className="text-red-400" style={{ textAlign: "center" }}>
            {errorMessage}
          </Text>
        ) : sales.length === 0 ? (
          <Text variant="body" color="muted" style={{ textAlign: "center" }}>
            {t("reception.equipmentSales.empty")}
          </Text>
        ) : (
          <View className="gap-3">
            {sales.map((sale) => (
              <Card key={sale.id} className="gap-1">
                <View className="flex-row items-center justify-between">
                  <Text variant="title">{sale.itemName}</Text>
                  <Text variant="title" color="gold">
                    {sale.totalPrice.toLocaleString()} EGP
                  </Text>
                </View>
                <Text variant="caption" color="muted">
                  {t("reception.equipmentSales.quantityLabel")} {sale.quantity} · {t(PAYMENT_METHOD_LABEL_KEY[sale.paymentMethod])}
                </Text>
                {sale.buyerName ? (
                  <Text variant="caption" color="muted">
                    {sale.buyerName}
                  </Text>
                ) : null}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <ReceptionSideMenu visible={isMenuVisible} onClose={() => setIsMenuVisible(false)} />
    </SafeAreaView>
  );
}
