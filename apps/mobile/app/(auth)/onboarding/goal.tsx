import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button, OptionCard, ProgressDots, ScreenContainer, Text } from "@9thround/ui/native";
import type { FitnessGoal } from "@9thround/identity";
import { useOnboardingStore } from "../../../src/features/onboarding/store";

const TOTAL_STEPS = 4;

const GOALS: { value: FitnessGoal; labelKey: string }[] = [
  { value: "weight_loss", labelKey: "onboarding.goal.weightLoss" },
  { value: "muscle_gain", labelKey: "onboarding.goal.muscleGain" },
  { value: "general_fitness", labelKey: "onboarding.goal.generalFitness" },
  { value: "athletic_performance", labelKey: "onboarding.goal.athleticPerformance" },
];

/** Step 2 of onboarding — "Fitness Goal Selection" (docs/phase-1/05-screen-list.md #7). */
export default function OnboardingGoalScreen() {
  const { t } = useTranslation();
  const goal = useOnboardingStore((state) => state.goal);
  const setGoal = useOnboardingStore((state) => state.setGoal);

  function handleContinue() {
    router.push("/(auth)/onboarding/experience");
  }

  return (
    <ScreenContainer>
      <View className="gap-8">
        <ProgressDots total={TOTAL_STEPS} current={1} />

        <View className="gap-2">
          <Text variant="display">{t("onboarding.goal.question")}</Text>
          <Text variant="body" color="muted">
            {t("onboarding.goal.subtitle")}
          </Text>
        </View>

        <View className="gap-3">
          {GOALS.map((option) => (
            <OptionCard
              key={option.value}
              label={t(option.labelKey)}
              isSelected={goal === option.value}
              onPress={() => setGoal(option.value)}
            />
          ))}
        </View>
      </View>

      <Button label={t("common.continue")} onPress={handleContinue} disabled={goal === null} />
    </ScreenContainer>
  );
}
