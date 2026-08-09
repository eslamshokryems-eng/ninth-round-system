import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuthStore } from "../src/features/auth/store";
import { useLocaleStore } from "../src/lib/locale-store";

const STAFF_ROLES = new Set(["reception", "sales_employee", "branch_manager", "super_admin"]);

/**
 * The routing gate described in docs/phase-1/06-navigation-flow.md §6.1:
 * no session → language (if unset) or welcome; session but not onboarded →
 * onboarding; fully set up → the tab navigator. This is the only place this
 * decision is made — no individual screen re-implements it.
 *
 * Updated for the Reception & Membership pivot
 * (docs/phase-1/14-reception-membership.md): staff roles land on the
 * Reception section instead of the member-facing tabs. `coach` has no
 * dedicated UI yet (Phase 1 scope is Reception only) and falls back to the
 * member tabs for now, same as `member`.
 */
export default function Index() {
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const isOnboarded = useAuthStore((state) => state.isOnboarded);
  const locale = useLocaleStore((state) => state.locale);

  if (status === "hydrating") {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color="#C9A227" />
      </View>
    );
  }

  if (!locale) {
    return <Redirect href="/(auth)/language" />;
  }

  if (status === "signedOut") {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!isOnboarded) {
    return <Redirect href="/(auth)/onboarding/profile" />;
  }

  if (role && STAFF_ROLES.has(role)) {
    return <Redirect href="/(reception)" />;
  }

  return <Redirect href="/(tabs)" />;
}
