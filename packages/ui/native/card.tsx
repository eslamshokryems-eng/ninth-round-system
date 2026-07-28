import { View, type ViewProps } from "react-native";

export interface CardProps extends ViewProps {
  /**
   * Solid surface card (default) vs. a translucent "glass" panel for stat
   * tiles/overlays. This is a semi-transparent tint approximation, not a
   * true backdrop-blur — real glassmorphism needs `expo-blur`'s BlurView,
   * intentionally deferred until a screen actually needs it (see
   * docs/phase-1/12-implementation-status.md) rather than adding another
   * native module to this slice speculatively.
   */
  variant?: "solid" | "glass";
}

export function Card({ variant = "solid", className = "", style, ...rest }: CardProps) {
  const base = "rounded-card p-4";
  const variantClass = variant === "glass" ? "bg-white/[0.06] border border-white/10" : "bg-surface";

  return <View className={`${base} ${variantClass} ${className}`} style={style} {...rest} />;
}
