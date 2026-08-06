import { useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button, OptionCard, ProgressDots, ScreenContainer, Text, TextField } from "@9thround/ui/native";
import type { Gender } from "@9thround/identity";
import { dateOfBirthFromAge } from "@9thround/identity";
import { useAuthStore } from "../../../src/features/auth/store";
import { useOnboardingStore } from "../../../src/features/onboarding/store";
import { getIdentityModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";

const TOTAL_STEPS = 4;

const GENDERS: { value: Gender; labelKey: string }[] = [
  { value: "female", labelKey: "onboarding.bodyMetrics.genderFemale" },
  { value: "male", labelKey: "onboarding.bodyMetrics.genderMale" },
  { value: "unspecified", labelKey: "onboarding.bodyMetrics.genderUnspecified" },
];

/** Step 4 of onboarding — "Height, Weight, Age, Gender" (docs/phase-1/05-screen-list.md #9). */
export default function OnboardingBodyMetricsScreen() {
  const { t } = useTranslation();
  const profileId = useAuthStore((state) => state.profileId);
  const setSignedIn = useAuthStore((state) => state.setSignedIn);

  const fullName = useOnboardingStore((state) => state.fullName);
  const goal = useOnboardingStore((state) => state.goal);
  const experienceLevel = useOnboardingStore((state) => state.experienceLevel);

  const [gender, setGender] = useState<Gender | null>(null);
  const [ageText, setAgeText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [weightText, setWeightText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const age = parseInt(ageText, 10);
  const heightCm = parseFloat(heightText);
  const weightKg = parseFloat(weightText);
  const isFormComplete =
    gender !== null && Number.isFinite(age) && Number.isFinite(heightCm) && Number.isFinite(weightKg);

  async function handleFinish() {
    if (!profileId || !gender || !Number.isFinite(age) || !Number.isFinite(heightCm) || !Number.isFinite(weightKg)) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    const result = await getIdentityModule().completeOnboarding.execute({
      profileId,
      fullName,
      goal: goal ?? "general_fitness",
      experienceLevel: experienceLevel ?? "beginner",
      gender,
      dateOfBirth: dateOfBirthFromAge(age),
      heightCm,
      weightKg,
    });

    setIsSubmitting(false);

    if (result.isErr) {
      setErrorMessage(t(translateErrorCode(result.error.code)));
      return;
    }

    // Public sign-up always creates a `member` — staff accounts are
    // provisioned separately (assignStaffRole), not through this flow.
    setSignedIn({ profileId, fullName, role: "member", branchId: null, isOnboarded: true });
    useOnboardingStore.getState().reset();
    router.replace("/(tabs)");
  }

  return (
    <ScreenContainer>
      <View className="gap-8">
        <ProgressDots total={TOTAL_STEPS} current={3} />

        <View className="gap-2">
          <Text variant="display">{t("onboarding.bodyMetrics.title")}</Text>
          <Text variant="body" color="muted">
            {t("onboarding.bodyMetrics.subtitle")}
          </Text>
        </View>

        <View className="gap-3">
          <Text variant="caption" color="muted">
            {t("onboarding.bodyMetrics.genderLabel")}
          </Text>
          <View className="flex-row gap-3">
            {GENDERS.map((option) => (
              <View key={option.value} className="flex-1">
                <OptionCard
                  label={t(option.labelKey)}
                  isSelected={gender === option.value}
                  onPress={() => setGender(option.value)}
                />
              </View>
            ))}
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField
              label={t("onboarding.bodyMetrics.ageLabel")}
              value={ageText}
              onChangeText={setAgeText}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
          <View className="flex-1">
            <TextField
              label={t("onboarding.bodyMetrics.heightLabel")}
              value={heightText}
              onChangeText={setHeightText}
              keyboardType="decimal-pad"
              maxLength={5}
            />
          </View>
          <View className="flex-1">
            <TextField
              label={t("onboarding.bodyMetrics.weightLabel")}
              value={weightText}
              onChangeText={setWeightText}
              keyboardType="decimal-pad"
              maxLength={5}
            />
          </View>
        </View>

        {errorMessage ? (
          <Text variant="caption" className="text-red-400">
            {errorMessage}
          </Text>
        ) : null}
      </View>

      <Button
        label={t("onboarding.bodyMetrics.finish")}
        onPress={handleFinish}
        isLoading={isSubmitting}
        disabled={!isFormComplete}
      />
    </ScreenContainer>
  );
}
