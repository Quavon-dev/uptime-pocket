/**
 * Color tokens for Uptime Pocket
 *
 * Brand color is parked — will be finalized once the logo is provided.
 * For now we use emerald-500 (#10B981) as the primary brand color.
 *
 * Status colors are SEMANTIC and must never change. They map directly to
 * monitor health and must be instantly recognizable.
 */

export const colors = {
  // Brand (parked - update with final logo hex)
  brand: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981', // primary brand
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
    950: '#022C22',
  },

  // Status (semantic - never change)
  status: {
    up: '#10B981', // green - service is healthy
    down: '#EF4444', // red - service is failing
    pending: '#F59E0B', // amber - check in progress
    maintenance: '#3B82F6', // blue - scheduled downtime
    paused: '#6B7280', // gray - manually paused
  },

  // Neutral grays
  gray: {
    50: '#FAFAFA',
    100: '#F4F4F5',
    200: '#E4E4E7',
    300: '#D4D4D8',
    400: '#A1A1AA',
    500: '#71717A',
    600: '#52525B',
    700: '#3F3F46',
    800: '#27272A',
    900: '#18181B',
    950: '#09090B',
  },

  // Semantic surfaces (theme-aware)
  surface: {
    light: {
      background: '#FAFAFA',
      elevated: '#FFFFFF',
      sunken: '#F4F4F5',
      border: '#E4E4E7',
      text: '#18181B',
      textMuted: '#71717A',
      textSubtle: '#A1A1AA',
    },
    dark: {
      background: '#09090B',
      elevated: '#18181B',
      sunken: '#000000',
      border: '#27272A',
      text: '#FAFAFA',
      textMuted: '#A1A1AA',
      textSubtle: '#71717A',
    },
  },

  // Overlays
  overlay: {
    light: 'rgba(0, 0, 0, 0.4)',
    dark: 'rgba(0, 0, 0, 0.6)',
  },
} as const;

export type StatusColor = keyof typeof colors.status;
