/**
 * Regression test for the onboarding FlatList layout bug.
 *
 * Background: in the previous build, `app/welcome.tsx` captured
 * `SCREEN_WIDTH = Dimensions.get('window').width` at module scope
 * and used it as the per-item width and getItemLayout length. On
 * iOS 26 / RN 0.81, that value can be stale or wrong on first
 * render (the iOS UIScreen reporting changed in some cases), so the
 * three slides were laid out at tiny widths (e.g. 80px each) and
 * all three icon circles appeared crammed into the left third of
 * the screen, with the title/body text overflowing the visible area.
 *
 * The fix: use `useWindowDimensions()` (a hook) inside the component
 * so the width is read fresh on every render and reacts to size
 * changes (rotation, split view, etc).
 *
 * This test guards the import-time contract: the module must not
 * capture a width at module load. We grep the source for the
 * forbidden pattern instead of mounting the component (which would
 * require react-test-renderer, not in our deps).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WELCOME_PATH = join(
  process.cwd(),
  'app',
  'welcome.tsx',
);

describe('app/welcome.tsx — FlatList width handling', () => {
  const source = readFileSync(WELCOME_PATH, 'utf8');

  it('does NOT capture Dimensions at module scope (regression)', () => {
    // The bug was: `const SCREEN_WIDTH = Dimensions.get('window').width;`
    // outside the component, so the value was frozen at first import.
    expect(source).not.toMatch(/^\s*const\s+\w+\s*=\s*Dimensions\.get\(/m);
  });

  it('does NOT import the legacy Dimensions API', () => {
    // Either no Dimensions import at all, or only as a type import.
    // (A type-only import doesn't call into the runtime.)
    const importLines = source
      .split('\n')
      .filter((l) => /from\s+['"]react-native['"]/.test(l));
    const badImports = importLines.filter(
      (l) => /\{[^}]*\bDimensions\b[^}]*\}/.test(l) && !/^\s*import\s+type/.test(l),
    );
    expect(badImports).toEqual([]);
  });

  it('uses useWindowDimensions for the slide width', () => {
    expect(source).toMatch(/useWindowDimensions/);
  });

  it('passes a per-render width to getItemLayout (not a module constant)', () => {
    // The getItemLayout callback's `length` should be a dynamic value
    // derived from useWindowDimensions, not a hoisted const. Looking
    // for either `length: screenWidth` (the renamed var) or any other
    // non-constant expression. The simplest invariant: the const
    // SCREEN_WIDTH must not exist.
    expect(source).not.toMatch(/\bSCREEN_WIDTH\b/);
  });
});
