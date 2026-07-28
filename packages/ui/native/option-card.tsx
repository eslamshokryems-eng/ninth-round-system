import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Text } from "./text";

export interface OptionCardProps {
  label: string;
  description?: string;
  isSelected: boolean;
  onPress: () => void;
  /** Leading content (e.g. a flag emoji, an icon) — rendered before the label. */
  leading?: ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The selectable-card pattern behind Language, Fitness Goal, and Training
 * Experience selection — one component, three screens, so "what a selected
 * option looks like" never drifts between them.
 */
export function OptionCard({ label, description, isSelected, onPress, leading }: OptionCardProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isSelected ? 1.0 : 0.98, { damping: 14 }) }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      onPress={onPress}
      style={animatedStyle}
      className={`flex-row items-center justify-between rounded-card border p-4 ${
        isSelected ? "border-gold bg-gold/10" : "border-white/10 bg-surface"
      }`}
    >
      <View className="flex-row items-center gap-3" style={{ flexShrink: 1 }}>
        {leading}
        <View style={{ flexShrink: 1 }}>
          <Text variant="title">{label}</Text>
          {description ? (
            <Text variant="caption" color="muted">
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <Checkmark isSelected={isSelected} />
    </AnimatedPressable>
  );
}

function Checkmark({ isSelected }: { isSelected: boolean }) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withSpring(isSelected ? 1 : 0, { damping: 16 }),
    transform: [{ scale: withSpring(isSelected ? 1 : 0.5, { damping: 14 }) }],
  }));

  return (
    <Animated.View
      className="h-6 w-6 items-center justify-center rounded-pill bg-gold"
      style={animatedStyle}
    >
      <Text style={{ color: "#0B0B0C", fontSize: 14, fontWeight: "700" }}>✓</Text>
    </Animated.View>
  );
}
