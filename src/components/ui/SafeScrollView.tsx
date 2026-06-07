/**
 * SafeScrollView — a ScrollView wrapper that handles dynamic bottom safe
 * area correctly on iOS.
 *
 * Why this exists:
 *   Setting `paddingBottom` on `contentContainerStyle` with a value derived
 *   from `useSafeAreaInsets()` causes the content to "jump" as it scrolls
 *   because the layout keeps shifting. The fix is to use `contentInset` so
 *   the OS-level scroll view handles the bottom inset, while the content
 *   itself stays static.
 *
 * react-doctor flags this pattern as `rn-scrollview-dynamic-padding`. This
 * component centralizes the correct behavior.
 *
 * Props mirror ScrollView, minus `contentContainerStyle` (we apply our own).
 * For custom padding, pass `contentContainerStyle` and we'll merge it in.
 */

import { ScrollView, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT_BOTTOM_INSET = 100; // breathing room for tab bar

export interface SafeScrollViewProps extends Omit<ScrollViewProps, 'contentContainerStyle'> {
  /** Extra bottom padding added inside contentContainerStyle (use sparingly). */
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  /** Extra bottom inset in addition to safe-area + tab bar space. */
  extraBottom?: number;
}

export function SafeScrollView({
  contentContainerStyle,
  extraBottom = DEFAULT_BOTTOM_INSET,
  children,
  ...rest
}: SafeScrollViewProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom + extraBottom;

  return (
    <ScrollView
      contentInset={{ bottom: bottomInset }}
      scrollIndicatorInsets={{ bottom: bottomInset }}
      contentContainerStyle={contentContainerStyle}
      {...rest}>
      {children}
    </ScrollView>
  );
}
