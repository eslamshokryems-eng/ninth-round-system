import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { AppProviders } from "../src/providers/app-providers";
import { useAuthBootstrap } from "../src/features/auth/use-auth-bootstrap";
import { useAuthStore } from "../src/features/auth/store";

// Held up until the auth bootstrap resolves — see RootNavigator below —
// so there is never a flash of the wrong screen for an already-signed-in
// user. Errors are swallowed: a splash-screen API failure should never
// crash the app.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  useAuthBootstrap();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status !== "hydrating") {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [status]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
