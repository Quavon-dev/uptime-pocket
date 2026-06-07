/**
 * Spacing tokens for Uptime Pocket
 *
 * 4pt base grid. We define semantic names + raw multiples.
 * Use semantic names in components, raw multiples in low-level layout.
 */

export const spacing = {
  // Raw 4pt grid
  0: 0,
  px: 1,
  '0.5': 2,
  1: 4,
  '1.5': 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

// Semantic aliases - prefer these in components
export const semanticSpacing = {
  hairline: 1,
  xs: spacing[1], // 4
  sm: spacing[2], // 8
  md: spacing[3], // 12
  lg: spacing[4], // 16
  xl: spacing[6], // 24
  '2xl': spacing[8], // 32
  '3xl': spacing[10], // 40
  '4xl': spacing[12], // 48
} as const;

// Border radius
export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
} as const;

export const semanticRadius = {
  xs: radius.sm, // 4
  sm: radius.md, // 8
  md: radius.lg, // 12
  card: radius.xl, // 16 - cards, monitor rows
  button: radius.xl, // 16 - buttons
  pill: radius.full, // 9999 - status pills
  sheet: radius['2xl'], // 20 - bottom sheets
} as const;
