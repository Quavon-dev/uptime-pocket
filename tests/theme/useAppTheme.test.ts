/**
 * Tests for the `useAppTheme` hook — specifically the pure
 * `resolveBrand` helper that maps the user's accent pick (raw
 * hex or stable swatch id) into the single hex string the
 * theme uses for chrome.
 *
 * Why a separate file:
 *   `useAppTheme` itself is a React hook; we don't have
 *   @testing-library/react-native installed, so we test the
 *   pure logic that the hook delegates to. The hook's
 *   reactive behavior (re-rendering on store changes) is
 *   mechanical Zustand wiring; the actual business rules
 *   live in `resolveBrand`.
 *
 * The accent-resolution rules are:
 *   1. If `accentColor` is a non-empty hex string, use it.
 *   2. Else if `accentSwatchId` matches a current swatch, use
 *      that swatch's `brand` hex.
 *   3. Else fall back to the default swatch's `brand` hex
 *      (currently emerald-500, #10B981).
 *
 * The "accent affects status" toggle is consumed by the
 * `useAppTheme` hook to swap `status.up` between
 * `colors.status.up` (default) and the resolved brand.
 * There's no pure helper for that — the rule is a one-liner
 * in the hook. We don't try to test it here.
 */

import { resolveBrand } from '@/theme/useAppTheme';
import { ACCENT_SWATCHES, findSwatch } from '@/theme/swatches';

describe('resolveBrand', () => {
  it('returns the raw accentColor when it is set', () => {
    expect(resolveBrand('#FF00FF', 'rose')).toBe('#FF00FF');
  });

  it('returns the raw accentColor when set, even if accentSwatchId is null', () => {
    expect(resolveBrand('#FF00FF', null)).toBe('#FF00FF');
  });

  it('looks up the swatch by id when accentColor is null', () => {
    // The 'rose' swatch has brand hex #F43F5E per ACCENT_SWATCHES.
    expect(resolveBrand(null, 'rose')).toBe('#F43F5E');
  });

  it('falls back to the default swatch when both are null', () => {
    expect(resolveBrand(null, null)).toBe(findSwatch(null).brand);
  });

  it('falls back to the default swatch when the id does not exist', () => {
    // 'not-a-real-swatch' is not in ACCENT_SWATCHES; the lookup
    // should return the default.
    expect(resolveBrand(null, 'not-a-real-swatch')).toBe(
      findSwatch('not-a-real-swatch').brand
    );
  });

  it('falls back to the default swatch when accentColor is an empty string', () => {
    // An empty accentColor should be treated the same as null —
    // the user's "saved" an empty string by accident, not
    // explicitly chosen an empty accent.
    expect(resolveBrand('', 'rose')).toBe('#F43F5E');
  });

  it('falls back to the default swatch when accentColor is whitespace only', () => {
    // Defensive: a stray " " from a bad clipboard paste
    // shouldn't render as an empty / invisible accent.
    expect(resolveBrand('   ', 'rose')).toBe('#F43F5E');
  });

  it('prefers accentColor over accentSwatchId when both are set', () => {
    // When the user has a raw color stored AND a stale swatch
    // id (e.g. the user picked a swatch, then we shipped a
    // custom-color picker that overwrote the color directly
    // without clearing the id), the raw color wins.
    expect(resolveBrand('#112233', 'rose')).toBe('#112233');
  });

  it('default swatch is emerald-500 (#10B981)', () => {
    // The default fallback is hardcoded in swatches.ts; this
    // test locks the contract so a future swatch reorder can't
    // silently shift what "no pick" means.
    expect(findSwatch(null).id).toBe('emerald');
    expect(resolveBrand(null, null)).toBe('#10B981');
  });

  it('every swatch in ACCENT_SWATCHES resolves to its own brand hex', () => {
    for (const sw of ACCENT_SWATCHES) {
      expect(resolveBrand(null, sw.id)).toBe(sw.brand);
    }
  });
});
