import { Image, type ImageProps } from "react-native";

export interface LogoProps extends Omit<ImageProps, "source"> {
  /** `wordmark` = the full "9TH ROUND Kenpo & Fitness" lockup; `emblem` = the 9 mark alone. */
  variant?: "wordmark" | "emblem";
  /** Rendered width in px; height follows the asset's aspect ratio. */
  width?: number;
}

// Aspect ratios of the source assets in ../assets/.
const ASPECT: Record<NonNullable<LogoProps["variant"]>, number> = {
  wordmark: 1, // 1200×1200 — the lockup is centered with generous padding
  emblem: 255 / 261,
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- React Native's asset pipeline needs a static require() to bundle images
const WORDMARK = require("../assets/logo-wordmark-white-on-black.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
const EMBLEM = require("../assets/emblem-red.png");

/**
 * The brand mark, rendered in JS rather than as a native splash asset —
 * this is what makes it visible inside Expo Go, where the native splash
 * screen and app icon can't apply (Expo Go is a shared prebuilt container;
 * custom native config only takes effect in a standalone/dev-client build).
 */
export function Logo({ variant = "wordmark", width = 220, style, ...rest }: LogoProps) {
  return (
    <Image
      source={variant === "wordmark" ? WORDMARK : EMBLEM}
      resizeMode="contain"
      accessibilityRole="image"
      style={[{ width, height: width / ASPECT[variant] }, style]}
      {...rest}
    />
  );
}
