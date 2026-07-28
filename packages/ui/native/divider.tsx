import { View } from "react-native";
import { Text } from "./text";

export interface DividerProps {
  label?: string;
}

/** Used for "or continue with" between email auth and OAuth buttons. */
export function Divider({ label }: DividerProps) {
  if (!label) {
    return <View className="h-px bg-white/10" />;
  }

  return (
    <View className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-white/10" />
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <View className="h-px flex-1 bg-white/10" />
    </View>
  );
}
