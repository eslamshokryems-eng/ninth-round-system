import { ScreenContainer, Text } from "@9thround/ui/native";
import { View } from "react-native";

export interface ComingSoonProps {
  title: string;
  subtitle: string;
}

/**
 * Placeholder for tabs whose bounded context isn't implemented yet (Train,
 * Nutrition, Progress, Profile all depend on contexts that are still
 * Clean Architecture skeletons — see
 * docs/phase-1/12-implementation-status.md). An honest "not built yet"
 * screen, not a stubbed-out feature pretending to work.
 */
export function ComingSoon({ title, subtitle }: ComingSoonProps) {
  return (
    <ScreenContainer scrollable={false}>
      <View className="flex-1 items-center justify-center gap-3 px-4">
        <Text variant="display" style={{ textAlign: "center" }}>
          {title}
        </Text>
        <Text variant="body" color="muted" style={{ textAlign: "center" }}>
          {subtitle}
        </Text>
      </View>
    </ScreenContainer>
  );
}
