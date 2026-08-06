import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import type { DashboardStats } from "@9thround/reception";
import { Button, IconButton, Logo, StatCard, Text } from "@9thround/ui/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../src/features/auth/store";
import { getIdentityModule, getReceptionModule } from "../../src/lib/composition-root";

/**
 * The Reception Dashboard (docs/phase-1/14-reception-membership.md §14.4,
 * step 4) — the seven headline numbers, one query
 * (`GetDashboardStatsUseCase` → the `reception_dashboard_stats` view).
 * Member CRUD (step 5) is the next slice; this screen only reads.
 */
export default function ReceptionDashboardScreen() {
  const { t } = useTranslation();
  const setSignedOut = useAuthStore((state) => state.setSignedOut);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const loadStats = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setIsLoading(true);
    setErrorMessage(null);

    const result = await getReceptionModule().getDashboardStats.execute();

    if (result.isErr) {
      setErrorMessage(t("reception.dashboard.loadError"));
    } else {
      setStats(result.value);
    }
    setIsLoading(false);
  }, [t]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadStats({ silent: true });
    setIsRefreshing(false);
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    await getIdentityModule().signOut();
    setIsSigningOut(false);
    setSignedOut();
    router.replace("/");
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-6 py-6"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <Logo variant="emblem" width={36} />
            <Text variant="display">{t("reception.dashboard.title")}</Text>
          </View>
          <IconButton name="log-out-outline" onPress={() => void handleSignOut()} disabled={isSigningOut} />
        </View>

        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#C9A227" />
          </View>
        ) : errorMessage ? (
          <View className="items-center gap-4 py-12">
            <Text variant="body" color="muted" style={{ textAlign: "center" }}>
              {errorMessage}
            </Text>
            <Button label={t("reception.dashboard.refresh")} onPress={() => void loadStats()} variant="secondary" />
          </View>
        ) : stats ? (
          <View className="gap-3">
            <View className="flex-row gap-3">
              <StatCard label={t("reception.dashboard.activeMembers")} value={stats.activeMembers} />
              <StatCard label={t("reception.dashboard.newMembersToday")} value={stats.newMembersToday} />
            </View>
            <View className="flex-row gap-3">
              <StatCard label={t("reception.dashboard.expiringToday")} value={stats.expiringToday} tone="warning" />
              <StatCard
                label={t("reception.dashboard.expiringThisWeek")}
                value={stats.expiringThisWeek}
                tone="warning"
              />
            </View>
            <View className="flex-row gap-3">
              <StatCard label={t("reception.dashboard.expiredMemberships")} value={stats.expiredMemberships} tone="warning" />
            </View>
            <View className="flex-row gap-3">
              <StatCard label={t("reception.dashboard.dailyRevenue")} value={`${stats.dailyRevenue.toLocaleString()} EGP`} />
              <StatCard label={t("reception.dashboard.monthlyRevenue")} value={`${stats.monthlyRevenue.toLocaleString()} EGP`} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
