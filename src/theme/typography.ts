/**
 * Typography tokens for Uptime Pocket
 *
 * - iOS uses SF Pro Display/Text (automatic via system-ui)
 * - Android uses Roboto Flex (automatic via sans-serif)
 * - We define a type scale that works on both platforms
 */

import { Platform, type TextStyle } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System', // SF Pro
  android: 'sans-serif', // Roboto
  default: 'System',
})!;

const fontFamilyMedium = Platform.select({
  ios: 'System',
  android: 'sans-serif-medium',
  default: 'System',
})!;

const fontFamilyMono = Platform.select({
  ios: 'Menlo', // SF Mono fallback
  android: 'monospace',
  default: 'monospace',
})!;

export const typography = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700' as const,
    fontFamily: fontFamilyMedium,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600' as const,
    fontFamily: fontFamilyMedium,
    letterSpacing: -0.3,
  },
  heading: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
    fontFamily: fontFamilyMedium,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400' as const,
    fontFamily,
  },
  bodyEmphasized: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600' as const,
    fontFamily: fontFamilyMedium,
  },
  callout: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '400' as const,
    fontFamily,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
    fontFamily,
    letterSpacing: 0.1,
  },
  captionEmphasized: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
    fontFamily: fontFamilyMedium,
    letterSpacing: 0.1,
  },
  micro: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500' as const,
    fontFamily: fontFamilyMedium,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
  mono: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
    fontFamily: fontFamilyMono,
  },
} as const satisfies Record<string, TextStyle>;
