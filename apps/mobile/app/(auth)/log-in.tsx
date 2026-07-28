import { useState } from "react";
import { Link, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Button, Divider, ScreenContainer, Text, TextField } from "@9thround/ui/native";
import { getIdentityModule } from "../../src/lib/composition-root";
import { translateErrorCode } from "../../src/lib/translate-error";

export default function LogInScreen() {
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setErrorMessage(null);
    setIsSubmitting(true);

    const result = await getIdentityModule().signIn.execute({ email, password });

    setIsSubmitting(false);

    if (result.isErr) {
      setErrorMessage(t(translateErrorCode(result.error.code)));
      return;
    }

    // The root gate (app/index.tsx) reads the freshly-updated auth store
    // (via useAuthBootstrap's onAuthStateChange listener) and redirects to
    // onboarding or the dashboard as appropriate — this screen doesn't need
    // to know which.
    router.replace("/");
  }

  return (
    <ScreenContainer>
      <View className="gap-8">
        <View className="gap-2">
          <Text variant="display">{t("auth.logIn.title")}</Text>
          <Text variant="body" color="muted">
            {t("auth.logIn.subtitle")}
          </Text>
        </View>

        <View className="gap-4">
          <TextField
            label={t("auth.logIn.emailLabel")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label={t("auth.logIn.passwordLabel")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
          />
          {errorMessage ? (
            <Text variant="caption" className="text-red-400">
              {errorMessage}
            </Text>
          ) : null}

          <Link href="/(auth)/forgot-password" asChild>
            <Pressable accessibilityRole="button" hitSlop={8}>
              <Text color="gold" variant="caption">
                {t("auth.logIn.forgotPassword")}
              </Text>
            </Pressable>
          </Link>
        </View>

        <Button
          label={t("auth.logIn.submit")}
          onPress={handleSubmit}
          isLoading={isSubmitting}
          disabled={email.length === 0 || password.length === 0}
        />

        <Divider />

        <View className="flex-row items-center justify-center gap-2">
          <Text color="muted">{t("auth.logIn.noAccount")}</Text>
          <Link href="/(auth)/sign-up" replace>
            <Text color="gold">{t("auth.logIn.signUpLink")}</Text>
          </Link>
        </View>
      </View>
    </ScreenContainer>
  );
}
