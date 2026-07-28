import { useTranslation } from "react-i18next";
import { ComingSoon } from "../../src/components/coming-soon";

export default function TrainScreen() {
  const { t } = useTranslation();
  return <ComingSoon title={t("comingSoon.train.title")} subtitle={t("comingSoon.train.subtitle")} />;
}
