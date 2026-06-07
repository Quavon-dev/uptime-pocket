/**
 * Motion tokens for Uptime Pocket
 *
 * Reanimated 4 supports spring and timing animations.
 * Use these constants throughout the app for consistent motion.
 */

export const duration = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 450,
  slower: 600,
} as const;

export const easing = {
  // Standard easings
  standard: 'cubic-bezier(0.2, 0, 0, 1)' as const, // iOS standard
  decelerate: 'cubic-bezier(0, 0, 0, 1)' as const, // iOS decelerate
  accelerate: 'cubic-bezier(0.3, 0, 1, 1)' as const, // iOS accelerate
  sharp: 'cubic-bezier(0.4, 0, 0.6, 1)' as const,

  // Reanimated easings
  inOut: 'ease-in-out' as const,
  in: 'ease-in' as const,
  out: 'ease-out' as const,
} satisfies Record<string, string | EasingFunction>;

// Reanimated 4 spring configs
export const spring = {
  // Snappy - for press feedback
  snappy: {
    damping: 18,
    stiffness: 320,
    mass: 0.8,
  },
  // Smooth - for general transitions
  smooth: {
    damping: 22,
    stiffness: 200,
    mass: 1,
  },
  // Bouncy - for status changes (subtle bounce)
  bouncy: {
    damping: 12,
    stiffness: 220,
    mass: 0.9,
  },
  // Gentle - for sheets and large surfaces
  gentle: {
    damping: 30,
    stiffness: 150,
    mass: 1.2,
  },
} as const;

type EasingFunction = (value: number) => number;
