import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { SideMenu } from "@9thround/ui/native";

/**
 * The "tasks" side bar shared across every top-level Reception screen
 * (Dashboard, Receipts, Expenses, Other Sales) — one items list, so
 * adding a fifth section later means editing one file, not four.
 */
export function ReceptionSideMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <SideMenu
      visible={visible}
      onClose={onClose}
      title={t("reception.sideMenu.title")}
      items={[
        {
          key: "memberships",
          label: t("reception.sideMenu.memberships"),
          onPress: () => {
            onClose();
            router.push("/(reception)/membership");
          },
        },
        {
          key: "receipts",
          label: t("reception.sideMenu.receipts"),
          onPress: () => {
            onClose();
            router.push("/(reception)/receipts");
          },
        },
        {
          key: "expenses",
          label: t("reception.sideMenu.expenses"),
          onPress: () => {
            onClose();
            router.push("/(reception)/expenses");
          },
        },
        {
          key: "equipmentSales",
          label: t("reception.sideMenu.equipmentSales"),
          onPress: () => {
            onClose();
            router.push("/(reception)/equipment-sales");
          },
        },
      ]}
    />
  );
}
