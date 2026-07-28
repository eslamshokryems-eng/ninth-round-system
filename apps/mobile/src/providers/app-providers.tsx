import type { ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { I18nProvider } from "./i18n-provider";
import { QueryProvider } from "./query-provider";

/**
 * The single composition point for every cross-cutting provider — the root
 * layout mounts this once and nothing else in the app reaches for a
 * provider directly. See docs/phase-1/08-state-management.md.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <QueryProvider>{children}</QueryProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
