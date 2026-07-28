import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export interface ScreenContainerProps {
  children: ReactNode;
  /** Most onboarding/form screens scroll; a few (e.g. a full-bleed carousel) opt out. */
  scrollable?: boolean;
  className?: string;
}

/**
 * Every screen mounts its content through this component — the one place
 * safe-area insets, keyboard avoidance, and the base background color are
 * handled, so no screen re-implements them. Flexbox here naturally adapts
 * to any device width/height, which is what "every screen must be
 * responsive" means in an RN context (there is no fixed-pixel canvas to
 * design against, unlike a single web breakpoint) — see
 * docs/06-ui-flow-and-wireframes.md §6.1a.
 *
 * `justify-between` on the content wrapper is what pins a screen's last
 * child (almost always the primary CTA button) to the bottom when content
 * is shorter than the viewport, while still scrolling normally if content
 * overflows — a screen passes its form content and its Button as direct
 * siblings, in that order, to get this for free.
 */
export function ScreenContainer({ children, scrollable = true, className = "" }: ScreenContainerProps) {
  const content = scrollable ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName="flex-grow justify-between px-6 py-6"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 justify-between px-6 py-6 ${className}`}>{children}</View>
  );

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
