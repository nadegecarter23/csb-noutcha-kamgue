import { forwardRef } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextProps,
  type TextInputProps,
  type TextStyle,
  type StyleProp,
} from 'react-native';

function fontStyle(style: StyleProp<TextStyle>): TextStyle {
  const flattened = StyleSheet.flatten(style) ?? {};
  const weight = flattened.fontWeight === 'bold' ? 700 : Number(flattened.fontWeight ?? 400);
  const fontFamily =
    flattened.fontFamily ??
    ((flattened.fontSize ?? 15) >= 18 && weight >= 600
      ? 'Manrope-Bold'
      : weight >= 700
        ? 'Inter-Bold'
        : weight >= 600
          ? 'Inter-SemiBold'
          : weight >= 500
            ? 'Inter-Medium'
            : 'Inter-Regular');
  return { fontFamily, fontWeight: 'normal' };
}

/** Explicit static font faces keep Android, iOS and Expo Web consistent. */
export const Text = forwardRef<NativeText, TextProps>(function Text({ style, ...props }, ref) {
  return <NativeText {...props} ref={ref} style={[style, fontStyle(style)]} />;
});

export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput(
  { style, ...props },
  ref,
) {
  return <NativeTextInput {...props} ref={ref} style={[style, fontStyle(style)]} />;
});
