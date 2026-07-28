import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Card, ScreenContainer, Text } from "@9thround/ui/native";
import { useAuthStore } from "../../src/features/auth/store";

/**
 * Dashboard Home (docs/phase-1/05-screen-list.md #10). The "today's
 * workout" card intentionally shows a coming-soon state rather than fake
 * data — the Training context and the 9-Round Timer don't exist yet (see
 * docs/phase-1/12-implementation-status.md); this screen is honest about
 * that rather than fabricating a workout to look finished.
 */
export default function DashboardHomeScreen() {
  const { t } = useTranslation();
  const fullName = useAuthStore((state) => state.fullName);
  const firstName = fullName?.split(" ")[0] ?? "";

  return (
    <ScreenContainer>
      <View className="gap-8">
        <Text variant="display">{t("dashboard.greeting", { name: firstName })}</Text>

        <Card className="gap-4">
          <View className="h-32 items-center justify-center rounded-card bg-white/[0.04]">
            <Text style={{ fontSize: 36 }}>🥊</Text>
          </View>
          <View className="gap-1">
            <Text variant="title">{t("dashboard.todayWorkout.comingSoonTitle")}</Text>
            <Text variant="caption" color="muted">
              {t("dashboard.todayWorkout.comingSoonSubtitle")}
            </Text>
          </View>
        </Card>
      </View>
    </ScreenContainer>
  );
}
