import { useTranslation } from "react-i18next";
import { ComingSoon } from "../../src/components/coming-soon";

export default function ProgressScreen() {
  const { t } = useTranslation();
  return (
    <ComingSoon title={t("comingSoon.progress.title")} subtitle={t("comingSoon.progress.subtitle")} />
  );
}
