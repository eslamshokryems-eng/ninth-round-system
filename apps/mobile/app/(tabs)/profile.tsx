import { useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button, ScreenContainer, Text } from "@9thround/ui/native";
import { useAuthStore } from "../../src/features/auth/store";
import { getIdentityModule } from "../../src/lib/composition-root";

/**
 * Full profile/settings management is a Phase 1 build item that hasn't
 * landed yet (docs/phase-1/12-implementation-status.md) — but sign-out is
 * simple, real, and important enough not to leave out of even this first
 * slice, so it's implemented here rather than folded into the generic
 * ComingSoon placeholder.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const setSignedOut = useAuthStore((state) => state.setSignedOut);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await getIdentityModule().signOut();
    setIsSigningOut(false);
    setSignedOut();
    router.replace("/");
  }

  return (
    <ScreenContainer scrollable={false}>
      <View className="flex-1 items-center justify-center gap-3 px-4">
        <Text variant="display" style={{ textAlign: "center" }}>
          {t("comingSoon.profile.title")}
        </Text>
        <Text variant="body" color="muted" style={{ textAlign: "center" }}>
          {t("comingSoon.profile.subtitle")}
        </Text>
      </View>
      <Button label={t("common.signOut")} onPress={handleSignOut} isLoading={isSigningOut} variant="secondary" />
    </ScreenContainer>
  );
}
