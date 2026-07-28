import { View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

export interface ProgressDotsProps {
  total: number;
  /** 0-indexed */
  current: number;
}

/**
 * The onboarding step indicator (docs/phase-1/05-screen-list.md). Built
 * with `flex-row` + `gap`, not absolute positions, so it mirrors correctly
 * under RTL without any conditional logic — see
 * docs/11-internationalization.md §11.5.
 */
export function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <View className="flex-row items-center justify-center gap-2">
      {Array.from({ length: total }, (_, index) => (
        <Dot key={index} isActive={index === current} isPast={index < current} />
      ))}
    </View>
  );
}

function Dot({ isActive, isPast }: { isActive: boolean; isPast: boolean }) {
  const animatedStyle = useAnimatedStyle(() => ({
    width: withTiming(isActive ? 20 : 8, { duration: 220 }),
    opacity: withTiming(isActive || isPast ? 1 : 0.35, { duration: 220 }),
  }));

  return <Animated.View className="h-2 rounded-pill bg-gold" style={animatedStyle} />;
}
