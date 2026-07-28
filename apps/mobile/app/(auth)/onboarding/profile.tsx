import { useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button, ProgressDots, ScreenContainer, Text, TextField } from "@9thround/ui/native";
import { useOnboardingStore } from "../../../src/features/onboarding/store";

const TOTAL_STEPS = 4;

/** Step 1 of onboarding — "User Profile Setup" (docs/phase-1/05-screen-list.md #6). */
export default function OnboardingProfileScreen() {
  const { t } = useTranslation();
  const fullName = useOnboardingStore((state) => state.fullName);
  const setFullName = useOnboardingStore((state) => state.setFullName);
  const [localName, setLocalName] = useState(fullName);

  function handleContinue() {
    setFullName(localName.trim());
    router.push("/(auth)/onboarding/goal");
  }

  return (
    <ScreenContainer>
      <View className="gap-8">
        <ProgressDots total={TOTAL_STEPS} current={0} />

        <View className="gap-2">
          <Text variant="display">{t("onboarding.profileSetup.title")}</Text>
          <Text variant="body" color="muted">
            {t("onboarding.profileSetup.subtitle")}
          </Text>
        </View>

        <TextField
          label={t("onboarding.profileSetup.nameLabel")}
          placeholder={t("onboarding.profileSetup.namePlaceholder")}
          value={localName}
          onChangeText={setLocalName}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
        />
      </View>

      <Button label={t("common.continue")} onPress={handleContinue} disabled={localName.trim().length === 0} />
    </ScreenContainer>
  );
}
