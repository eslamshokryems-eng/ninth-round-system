import { useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { ScreenContainer, Text, Button, OptionCard } from "@9thround/ui/native";
import type { LocaleCode } from "@9thround/shared-kernel";
import { useLocaleStore } from "../../src/lib/locale-store";
import { applyRtlForLocale } from "../../src/lib/apply-rtl";

const LANGUAGES: { code: LocaleCode; nativeLabel: string }[] = [
  { code: "en", nativeLabel: "English" },
  { code: "ar", nativeLabel: "العربية" },
];

/**
 * Screen 1 of the app (docs/phase-1/05-screen-list.md #1a) — shown before
 * sign-up because RTL must be set before anything else renders, per
 * docs/11-internationalization.md §11.6.
 */
export default function LanguageScreen() {
  const { t } = useTranslation();
  const setLocale = useLocaleStore((state) => state.setLocale);
  const [selected, setSelected] = useState<LocaleCode>("en");
  const [needsRestart, setNeedsRestart] = useState(false);

  function handleContinue() {
    setLocale(selected);
    const changed = applyRtlForLocale(selected);
    if (changed) {
      setNeedsRestart(true);
      return;
    }
    router.replace("/(auth)/welcome");
  }

  return (
    <ScreenContainer>
      <View className="flex-1 justify-center gap-8">
        <View className="items-center gap-2">
          <Text variant="display">{t("common.appName")}</Text>
          <Text variant="body" color="muted">
            {t("onboarding.languagePicker.title")}
          </Text>
        </View>

        <View className="gap-3">
          {LANGUAGES.map((language) => (
            <OptionCard
              key={language.code}
              label={language.nativeLabel}
              isSelected={selected === language.code}
              onPress={() => setSelected(language.code)}
            />
          ))}
        </View>

        {needsRestart ? (
          <Text variant="caption" color="gold" style={{ textAlign: "center" }}>
            {t("onboarding.languagePicker.restartNotice")}
          </Text>
        ) : null}
      </View>

      <Button
        label={t("common.continue")}
        onPress={handleContinue}
        disabled={needsRestart}
      />
    </ScreenContainer>
  );
}
