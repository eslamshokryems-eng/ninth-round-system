import { useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { BackButton, Button, ScreenContainer, Text, TextField } from "@9thround/ui/native";
import { getIdentityModule } from "../../src/lib/composition-root";
import { translateErrorCode } from "../../src/lib/translate-error";

const RESET_PASSWORD_REDIRECT_URL = "9thround://reset-password";

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit() {
    setErrorMessage(null);
    setIsSubmitting(true);

    const result = await getIdentityModule().requestPasswordReset.execute({
      email,
      redirectTo: RESET_PASSWORD_REDIRECT_URL,
    });

    setIsSubmitting(false);

    if (result.isErr) {
      setErrorMessage(t(translateErrorCode(result.error.code)));
      return;
    }

    // Always shows the same confirmation regardless of whether the email is
    // registered — see packages/identity/application/request-password-reset.ts.
    setIsSubmitted(true);
  }

  if (isSubmitted) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center gap-3 px-4">
          <Text variant="display" style={{ textAlign: "center" }}>
            {t("auth.forgotPassword.successTitle")}
          </Text>
          <Text variant="body" color="muted" style={{ textAlign: "center" }}>
            {t("auth.forgotPassword.successMessage")}
          </Text>
        </View>
        <Button label={t("auth.forgotPassword.backToLogin")} onPress={() => router.replace("/(auth)/log-in")} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <BackButton onPress={() => router.back()} />

      <View className="mt-6 gap-8">
        <View className="gap-2">
          <Text variant="display">{t("auth.forgotPassword.title")}</Text>
          <Text variant="body" color="muted">
            {t("auth.forgotPassword.subtitle")}
          </Text>
        </View>

        <View className="gap-4">
          <TextField
            label={t("auth.forgotPassword.emailLabel")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          {errorMessage ? (
            <Text variant="caption" className="text-red-400">
              {errorMessage}
            </Text>
          ) : null}
        </View>

        <Button
          label={t("auth.forgotPassword.submit")}
          onPress={handleSubmit}
          isLoading={isSubmitting}
          disabled={email.length === 0}
        />
      </View>
    </ScreenContainer>
  );
}
