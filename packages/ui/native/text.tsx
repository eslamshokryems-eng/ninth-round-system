import { Text as RNText, type TextProps as RNTextProps } from "react-native";

export type TextVariant = "display" | "title" | "body" | "caption";
export type TextColor = "ink" | "muted" | "gold";

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: TextColor;
}

const VARIANT_CLASSES: Record<TextVariant, string> = {
  display: "text-3xl font-semibold",
  title: "text-xl font-semibold",
  body: "text-base font-normal",
  caption: "text-sm font-normal",
};

const COLOR_CLASSES: Record<TextColor, string> = {
  ink: "text-ink",
  muted: "text-muted",
  gold: "text-gold",
};

/**
 * The one place font size/weight/color for body copy is decided — a screen
 * never hardcodes a font size. Text alignment is left to the platform
 * default (RN resolves it per-string via Unicode bidi detection, which is
 * usually right for mixed-content labels); screens that need an explicit
 * direction use flex-row layout instead, which mirrors automatically once
 * `I18nManager.forceRTL` is set at boot — see docs/11-internationalization.md §11.5.
 */
export function Text({ variant = "body", color = "ink", className = "", ...rest }: TextProps) {
  return (
    <RNText className={`${VARIANT_CLASSES[variant]} ${COLOR_CLASSES[color]} ${className}`} {...rest} />
  );
}
