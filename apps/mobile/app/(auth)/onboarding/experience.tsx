import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button, OptionCard, ProgressDots, ScreenContainer, Text } from "@9thround/ui/native";
import type { ExperienceLevel } from "@9thround/identity";
import { useOnboardingStore } from "../../../src/features/onboarding/store";

const TOTAL_STEPS = 4;

const LEVELS: { value: ExperienceLevel; labelKey: string; descriptionKey: string }[] = [
  {
    value: "beginner",
    labelKey: "onboarding.experience.beginner",
    descriptionKey: "onboarding.experience.beginnerDescription",
  },
  {
    value: "intermediate",
    labelKey: "onboarding.experience.intermediate",
    descriptionKey: "onboarding.experience.intermediateDescription",
  },
  {
    value: "advanced",
    labelKey: "onboarding.experience.advanced",
    descriptionKey: "onboarding.experience.advancedDescription",
  },
];

/** Step 3 of onboarding — "Training Experience Selection" (docs/phase-1/05-screen-list.md #8). */
export default function OnboardingExperienceScreen() {
  const { t } = useTranslation();
  const experienceLevel = useOnboardingStore((state) => state.experienceLevel);
  const setExperienceLevel = useOnboardingStore((state) => state.setExperienceLevel);

  function handleContinue() {
    router.push("/(auth)/onboarding/body-metrics");
  }

  return (
    <ScreenContainer>
      <View className="gap-8">
        <ProgressDots total={TOTAL_STEPS} current={2} />

        <View className="gap-2">
          <Text variant="display">{t("onboarding.experience.question")}</Text>
          <Text variant="body" color="muted">
            {t("onboarding.experience.subtitle")}
          </Text>
        </View>

        <View className="gap-3">
          {LEVELS.map((option) => (
            <OptionCard
              key={option.value}
              label={t(option.labelKey)}
              description={t(option.descriptionKey)}
              isSelected={experienceLevel === option.value}
              onPress={() => setExperienceLevel(option.value)}
            />
          ))}
        </View>
      </View>

      <Button label={t("common.continue")} onPress={handleContinue} disabled={experienceLevel === null} />
    </ScreenContainer>
  );
}
