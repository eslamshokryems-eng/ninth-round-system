import { useTranslation } from "react-i18next";
import { ComingSoon } from "../../src/components/coming-soon";

export default function NutritionScreen() {
  const { t } = useTranslation();
  return (
    <ComingSoon title={t("comingSoon.nutrition.title")} subtitle={t("comingSoon.nutrition.subtitle")} />
  );
}
