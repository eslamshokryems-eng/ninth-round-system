import { ActivityIndicator, Pressable, type PressableProps } from "react-native";
import { Text } from "./text";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "lg";

export interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const CONTAINER_BASE = "items-center justify-center rounded-pill";

const VARIANT_CONTAINER: Record<ButtonVariant, string> = {
  primary: "bg-gold",
  secondary: "border border-gold bg-transparent",
  ghost: "bg-transparent",
};

const VARIANT_TEXT_COLOR: Record<ButtonVariant, "ink" | "gold"> = {
  primary: "ink",
  secondary: "gold",
  ghost: "gold",
};

const SIZE_CONTAINER: Record<ButtonSize, string> = {
  md: "px-6 py-3",
  lg: "px-8 py-4",
};

/**
 * "Gold is earned" (docs/06-ui-flow-and-wireframes.md §6.1) — `primary` is
 * the only solid-gold-fill variant and is reserved for the one primary
 * action per screen (Continue, Sign up, Log in). `secondary`/`ghost` never
 * compete with it visually.
 */
export function Button({
  label,
  variant = "primary",
  size = "lg",
  isLoading = false,
  disabled,
  className = "",
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || isLoading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      disabled={isDisabled}
      className={`${CONTAINER_BASE} ${VARIANT_CONTAINER[variant]} ${SIZE_CONTAINER[size]} ${
        isDisabled ? "opacity-50" : ""
      } ${className}`}
      {...rest}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === "primary" ? "#0B0B0C" : "#C9A227"} />
      ) : (
        <Text variant="title" color={VARIANT_TEXT_COLOR[variant]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
