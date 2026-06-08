/**
 * Theme index - re-exports all design tokens.
 *
 * Usage:
 *   import { colors, spacing, typography, spring } from '@/theme';
 *   import { useAppTheme } from '@/theme';
 */

export { colors } from './colors';
export { typography } from './typography';
export { spacing, semanticSpacing, radius, semanticRadius } from './spacing';
export { duration, easing, spring } from './motion';
export { useAppTheme } from './useAppTheme';
export type { AppTheme, SurfacePalette } from './useAppTheme';
