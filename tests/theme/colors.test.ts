/**
 * Tests for the theme color tokens.
 *
 * The whole theme system rests on `colors.surface.light` and
 * `colors.surface.dark` being well-formed and self-consistent.
 * These tests lock in the contract so refactors can't silently
 * break the design system.
 *
 * The full visual rendering is verified manually on iOS / Android.
 */

import { colors } from '@/theme/colors';

describe('colors.surface (theme palette)', () => {
  describe('light palette', () => {
    it('exposes the full surface token set', () => {
      expect(colors.surface.light).toEqual(
        expect.objectContaining({
          background: expect.any(String),
          elevated: expect.any(String),
          sunken: expect.any(String),
          border: expect.any(String),
          text: expect.any(String),
          textMuted: expect.any(String),
          textSubtle: expect.any(String),
        })
      );
    });

    it('uses a near-white background and near-black text (AA contrast)', () => {
      // Background should be very light (zinc-50 ~ #FAFAFA).
      const bg = colors.surface.light.background.toLowerCase();
      const text = colors.surface.light.text.toLowerCase();
      expect(bg).toBe('#fafafa');
      expect(text).toBe('#18181b');
    });

    it('keeps textMuted darker than textSubtle (so the hierarchy reads)', () => {
      // textMuted (#71717A) should be darker than textSubtle (#A1A1AA)
      // for the size-12 caption + size-15 body hierarchy to look right.
      const muted = parseInt(colors.surface.light.textMuted.slice(1), 16);
      const subtle = parseInt(colors.surface.light.textSubtle.slice(1), 16);
      expect(muted).toBeLessThan(subtle);
    });
  });

  describe('dark palette', () => {
    it('exposes the full surface token set', () => {
      expect(colors.surface.dark).toEqual(
        expect.objectContaining({
          background: expect.any(String),
          elevated: expect.any(String),
          sunken: expect.any(String),
          border: expect.any(String),
          text: expect.any(String),
          textMuted: expect.any(String),
          textSubtle: expect.any(String),
        })
      );
    });

    it('inverts the light palette (light text on dark background)', () => {
      // Background should be very dark (zinc-950 ~ #09090B).
      // Text should be very light (zinc-50 ~ #FAFAFA).
      const bg = colors.surface.dark.background.toLowerCase();
      const text = colors.surface.dark.text.toLowerCase();
      expect(bg).toBe('#09090b');
      expect(text).toBe('#fafafa');
    });

    it('also inverts the textMuted / textSubtle relationship', () => {
      // In dark mode, textMuted (zinc-400 = #A1A1AA) is LIGHTER than
      // textSubtle (zinc-500 = #71717A). The values are swapped vs light.
      const muted = parseInt(colors.surface.dark.textMuted.slice(1), 16);
      const subtle = parseInt(colors.surface.dark.textSubtle.slice(1), 16);
      expect(muted).toBeGreaterThan(subtle);
    });
  });

  describe('semantic status colors (never change with theme)', () => {
    it('up is green (instantly recognizable as healthy)', () => {
      expect(colors.status.up).toBe('#10B981');
    });

    it('down is red (instantly recognizable as failing)', () => {
      expect(colors.status.down).toBe('#EF4444');
    });

    it('pending is amber (in-progress)', () => {
      expect(colors.status.pending).toBe('#F59E0B');
    });

    it('maintenance is blue (scheduled)', () => {
      expect(colors.status.maintenance).toBe('#3B82F6');
    });

    it('paused is gray (manually disabled)', () => {
      expect(colors.status.paused).toBe('#6B7280');
    });
  });

  describe('brand palette (parked at emerald-500)', () => {
    it('exposes a 50-950 scale anchored at #10B981 (500)', () => {
      expect(colors.brand[500]).toBe('#10B981');
      // Anchor: the 50 / 950 endpoints should still be valid hex
      expect(colors.brand[50]).toMatch(/^#[0-9A-F]{6}$/i);
      expect(colors.brand[950]).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });
});
