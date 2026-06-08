/**
 * Curated accent color swatches.
 *
 * The default is the brand emerald (#10B981). The other swatches are
 * "approximate" matches to a handful of recognizable brand palettes
 * (Stripe, Linear, Vercel, Tailwind indigo, etc.) — we use them as
 * preset user-selectable accents in Settings.
 *
 * To add a new swatch, just append to ACCENT_SWATCHES and rebuild.
 * The id is what's stored in settings.accent_swatch_id.
 */

export interface AccentSwatch {
  /** Stable id for persistence. */
  id: string;
  /** Human-readable name shown in the picker. */
  name: string;
  /** Fill background (used for the "chip" preview). */
  fill: string;
  /** The actual brand color applied to buttons, links, etc. */
  brand: string;
  /** Hex-only string for storage in the `accent_color` SQLite column. */
  hex: string;
}

export const ACCENT_SWATCHES: readonly AccentSwatch[] = [
  {
    id: 'emerald',
    name: 'Emerald (default)',
    fill: '#D1FAE5',
    brand: '#10B981',
    hex: '#10B981',
  },
  {
    id: 'sky',
    name: 'Sky',
    fill: '#DBEAFE',
    brand: '#0EA5E9',
    hex: '#0EA5E9',
  },
  {
    id: 'indigo',
    name: 'Indigo',
    fill: '#E0E7FF',
    brand: '#6366F1',
    hex: '#6366F1',
  },
  {
    id: 'violet',
    name: 'Violet',
    fill: '#EDE9FE',
    brand: '#8B5CF6',
    hex: '#8B5CF6',
  },
  {
    id: 'rose',
    name: 'Rose',
    fill: '#FFE4E6',
    brand: '#F43F5E',
    hex: '#F43F5E',
  },
  {
    id: 'amber',
    name: 'Amber',
    fill: '#FEF3C7',
    brand: '#F59E0B',
    hex: '#F59E0B',
  },
  {
    id: 'slate',
    name: 'Slate',
    fill: '#E2E8F0',
    brand: '#475569',
    hex: '#475569',
  },
] as const;

/** Find a swatch by its stable id, or fall back to the default. */
export function findSwatch(id: string | null): AccentSwatch {
  if (!id) return ACCENT_SWATCHES[0];
  return ACCENT_SWATCHES.find((s) => s.id === id) ?? ACCENT_SWATCHES[0];
}
