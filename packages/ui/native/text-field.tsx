import { useState } from "react";
import { TextInput as RNTextInput, View, type TextInputProps as RNTextInputProps } from "react-native";
import { Text } from "./text";

export interface TextFieldProps extends RNTextInputProps {
  label: string;
  errorMessage?: string | null;
}

/**
 * Every text input in the app goes through this component so focus/error
 * styling is consistent — a screen never reaches for a bare RN TextInput.
 * `ms-`/`me-` (not `ml-`/`mr-`) throughout this file and its siblings are
 * what let spacing mirror automatically once `I18nManager.forceRTL` is set,
 * per docs/11-internationalization.md §11.5.
 */
export function TextField({ label, errorMessage, className = "", onFocus, onBlur, ...rest }: TextFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const hasError = Boolean(errorMessage);

  return (
    <View className="gap-2">
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <RNTextInput
        className={`rounded-card border bg-surface px-4 py-3 text-base text-ink ${
          hasError ? "border-red-500" : isFocused ? "border-gold" : "border-white/10"
        } ${className}`}
        placeholderTextColor="#9A9A9A"
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {hasError ? (
        <Text variant="caption" className="text-red-400">
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}
