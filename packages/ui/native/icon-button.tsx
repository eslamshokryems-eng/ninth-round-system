import { I18nManager, Pressable, type PressableProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface IconButtonProps extends Omit<PressableProps, "children"> {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  /** Directional glyphs (chevrons, arrows) need their shape mirrored under RTL — plain icons (close, checkmark) don't. */
  mirrorInRtl?: boolean;
}

export function IconButton({
  name,
  size = 24,
  color = "#FFFFFF",
  mirrorInRtl = false,
  className = "",
  ...rest
}: IconButtonProps) {
  const shouldMirror = mirrorInRtl && I18nManager.isRTL;

  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      className={`h-10 w-10 items-center justify-center rounded-pill bg-white/[0.06] ${className}`}
      {...rest}
    >
      <Ionicons name={name} size={size} color={color} style={shouldMirror ? { transform: [{ scaleX: -1 }] } : undefined} />
    </Pressable>
  );
}

/** Back button pre-wired to the two chevron directions — the one place "which way does back point" is decided. */
export function BackButton(props: Omit<IconButtonProps, "name" | "mirrorInRtl">) {
  return <IconButton name="chevron-back" mirrorInRtl {...props} />;
}
