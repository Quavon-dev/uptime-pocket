/**
 * SafeScrollView — a ScrollView wrapper that handles dynamic bottom safe
 * area correctly on iOS and Android, and respects the iOS nav-bar
 * contentInsetAdjustmentBehavior so content doesn't sit under the nav bar.
 *
 * Why this exists:
 *   Setting `paddingBottom` on `contentContainerStyle` with a value derived
 *   from `useSafeAreaInsets()` causes the content to "jump" as it scrolls
 *   because the layout keeps shifting. The fix is to use `contentInset` so
 *   the OS-level scroll view handles the bottom inset, while the content
 *   itself stays static.
 *
 *   iOS specifically wants `contentInsetAdjustmentBehavior="automatic"`
 *   so that content below a translucent nav bar (like the GlassNavBar
 *   with BlurView) scrolls correctly underneath it.
 *
 * react-doctor flags the `paddingBottom`-on-content pattern as
 * `rn-scrollview-dynamic-padding`. This component centralizes the
 * correct behavior.
 *
 * Props mirror ScrollView, minus `contentContainerStyle` (we apply our own).
 * For custom padding, pass `contentContainerStyle` and we'll merge it in.
 */

import { Platform, ScrollView, type ScrollViewProps } from 'react-native';
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
      // iOS: let the scroll view's contentInset automatically extend
      // under translucent nav bars / tab bars. This is the standard
      // fix for the "content sits under the nav bar" overlap bug.
      contentInsetAdjustmentBehavior="automatic"
      contentInset={{ bottom: bottomInset }}
      scrollIndicatorInsets={{ bottom: bottomInset }}
      // On Android, contentInset is a no-op, so we add the inset to
      // the contentContainerStyle so the content has the right
      // bottom padding and doesn't get cut off by the tab bar.
      contentContainerStyle={[
        { paddingBottom: Platform.OS === 'ios' ? 0 : bottomInset },
        contentContainerStyle,
      ]}
      {...rest}>
      {children}
    </ScrollView>
  );
}
