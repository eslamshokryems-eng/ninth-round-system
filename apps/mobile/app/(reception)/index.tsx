import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
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
 * Stats reload via `useFocusEffect` (not a plain mount-only effect) so
 * returning here after "+ New Membership" (or Renew/Check-in) shows
 * current counts automatically, not just after a manual pull-to-refresh.
 */
export default function ReceptionDashboardScreen() {
  const { t } = useTranslation();
  const setSignedOut = useAuthStore((state) => state.setSignedOut);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // A ref, not state: read inside the useFocusEffect callback below to decide
  // spinner-vs-silent without making that callback (and thus the effect) depend on `stats`
  // itself, which would defeat "only re-run on focus, not on every stats change."
  const hasLoadedOnceRef = useRef(false);

  const loadStats = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setIsLoading(true);
    setErrorMessage(null);

    const result = await getReceptionModule().getDashboardStats.execute();

    if (result.isErr) {
      setErrorMessage(t("reception.dashboard.loadError"));
    } else {
      setStats(result.value);
      hasLoadedOnceRef.current = true;
    }
    setIsLoading(false);
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void loadStats({ silent: hasLoadedOnceRef.current });
    }, [loadStats]),
  );

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
          <View className="flex-row items-center gap-2">
            <IconButton
              name="add"
              accessibilityLabel={t("reception.membership.newMembership")}
              onPress={() => router.push("/(reception)/new-membership")}
            />
            <IconButton name="people-outline" onPress={() => router.push("/(reception)/membership")} />
            <IconButton name="log-out-outline" onPress={() => void handleSignOut()} disabled={isSigningOut} />
          </View>
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
