import { useState } from "react";
import { Link, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button, Divider, ScreenContainer, Text, TextField } from "@9thround/ui/native";
import { DEFAULT_LOCALE } from "@9thround/shared-kernel";
import { getIdentityModule } from "../../src/lib/composition-root";
import { useLocaleStore } from "../../src/lib/locale-store";
import { translateErrorCode } from "../../src/lib/translate-error";

export default function SignUpScreen() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale) ?? DEFAULT_LOCALE;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setErrorMessage(null);
    setIsSubmitting(true);

    const result = await getIdentityModule().signUp.execute({
      email,
      password,
      preferredLocale: locale,
    });

    setIsSubmitting(false);

    if (result.isErr) {
      setErrorMessage(t(translateErrorCode(result.error.code)));
      return;
    }

    // `handle_new_user()` creates the profiles row synchronously with
    // sign-up (supabase/migrations/20260801000002), so onboarding can start
    // immediately — no separate "waiting for profile" state needed.
    router.replace("/(auth)/onboarding/profile");
  }

  return (
    <ScreenContainer>
      <View className="gap-8">
        <View className="gap-2">
          <Text variant="display">{t("auth.signUp.title")}</Text>
          <Text variant="body" color="muted">
            {t("auth.signUp.subtitle")}
          </Text>
        </View>

        <View className="gap-4">
          <TextField
            label={t("auth.signUp.emailLabel")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label={t("auth.signUp.passwordLabel")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
          />
          {errorMessage ? (
            <Text variant="caption" className="text-red-400">
              {errorMessage}
            </Text>
          ) : null}
        </View>

        <Button
          label={t("auth.signUp.submit")}
          onPress={handleSubmit}
          isLoading={isSubmitting}
          disabled={email.length === 0 || password.length === 0}
        />

        <Divider />

        <View className="flex-row items-center justify-center gap-2">
          <Text color="muted">{t("auth.signUp.haveAccount")}</Text>
          <Link href="/(auth)/log-in" replace>
            <Text color="gold">{t("auth.signUp.logInLink")}</Text>
          </Link>
        </View>
      </View>
    </ScreenContainer>
  );
}
