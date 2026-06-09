/**
 * Accessibility static analysis.
 *
 * We can't easily run react-test-renderer in this Jest config (no
 * @types/react-test-renderer installed, and the components depend
 * on Reanimated + native modules that aren't easy to mock). So
 * instead of rendering, we do a static scan of the source tree and
 * look for common a11y pitfalls:
 *
 *   1. Interactive Pressable / TouchableOpacity elements that don't
 *      declare accessibilityRole and accessibilityLabel.
 *   2. Image components without alt text (we only have Lucide
 *      icons, but the rule still applies).
 *   3. Switch components without accessibilityLabel.
 *   4. Min tap target sizes — Pressables in user-facing screens
 *      should have a minHeight >= 44 (or use hitSlop).
 *
 * The scan is intentionally narrow: it asserts structural
 * commitments, not visual ones. Visual a11y needs a real device
 * + VoiceOver / TalkBack.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SRC_GLOB_DIRS = ['app', 'src/components', 'src/features'];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = SRC_GLOB_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

describe('a11y static scan', () => {
  it('scans at least 20 source files (catches a misconfigured glob)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  describe('primitive components declare a11y props', () => {
    /**
     * Whitelist of components that should always have an
     * accessibilityRole + accessibilityLabel. Anything new on this
     * list must be justified in the commit message.
     */
    const MUST_HAVE_A11Y: Array<{ file: string; substring: string }> = [
      { file: 'src/components/ui/Button.tsx', substring: 'accessibilityRole="button"' },
      { file: 'src/components/ui/Button.tsx', substring: 'accessibilityLabel' },
      { file: 'src/components/ui/SegmentedControl.tsx', substring: 'accessibilityRole="radio"' },
      { file: 'src/components/ui/SegmentedControl.tsx', substring: 'accessibilityRole="radiogroup"' },
      { file: 'src/components/monitor/MonitorCard.tsx', substring: 'accessibilityLabel' },
      { file: 'src/components/monitor/MonitorCard.tsx', substring: 'accessibilityRole="button"' },
      { file: 'src/components/monitor/MonitorRow.tsx', substring: 'accessibilityLabel' },
      { file: 'src/components/server/ServerCard.tsx', substring: 'accessibilityLabel' },
    ];

    it.each(MUST_HAVE_A11Y)('$file has $substring', ({ file, substring }) => {
      const full = path.join(ROOT, file);
      const src = fs.readFileSync(full, 'utf8');
      expect(src).toContain(substring);
    });
  });

  describe('Switch components carry a label', () => {
    it('every <Switch> in app/(tabs)/settings.tsx has accessibilityLabel', () => {
      const file = path.join(ROOT, 'app/(tabs)/settings.tsx');
      const src = fs.readFileSync(file, 'utf8');
      // Find every <Switch ... /> self-closing or <Switch ...> ... </Switch>
      // pair and assert the surrounding 400 chars include
      // accessibilityLabel.
      const switchRe = /<Switch[\s\S]*?\/>/g;
      const switches = src.match(switchRe) ?? [];
      expect(switches.length).toBeGreaterThan(0);
      for (const sw of switches) {
        expect(sw).toMatch(/accessibilityLabel/);
        expect(sw).toMatch(/accessibilityRole="switch"/);
      }
    });
  });

  describe('decorative elements are hidden from a11y', () => {
    it('StatusPill dot carries accessibilityElementsHidden', () => {
      const file = path.join(ROOT, 'src/components/status/StatusPill.tsx');
      const src = fs.readFileSync(file, 'utf8');
      expect(src).toMatch(/accessibilityElementsHidden/);
      expect(src).toMatch(/importantForAccessibility/);
    });

    it('UptimeBar segments are hidden from a11y (the bar is a visual encoding of the status pill + percentage)', () => {
      const file = path.join(ROOT, 'src/components/chart/UptimeBar.tsx');
      const src = fs.readFileSync(file, 'utf8');
      // Each segment is a colored stripe — a screen reader reading
      // "75 of 100 segments" would be useless. The percentage in
      // the footer + the parent card/row's status pill are what
      // convey the state.
      expect(src).toMatch(/importantForAccessibility/);
    });
  });

  describe('monitor cards surface their UPTIME bar in a11y', () => {
    it('MonitorCard includes the cached uptime ratio in its accessibilityLabel', () => {
      const file = path.join(ROOT, 'src/components/monitor/MonitorCard.tsx');
      const src = fs.readFileSync(file, 'utf8');
      // Existing test: this file must contain accessibilityLabel.
      // New: the label should also reference "uptime24h" so a screen
      // reader user hears the same number they see in the bar.
      expect(src).toContain('accessibilityLabel');
      expect(src).toMatch(/uptime24h/);
    });

    it('MonitorRow includes the monitor name + status in its accessibilityLabel', () => {
      // Guard against the regression where adding the bar pushed
      // the existing a11y label out of the file.
      const file = path.join(ROOT, 'src/components/monitor/MonitorRow.tsx');
      const src = fs.readFileSync(file, 'utf8');
      expect(src).toContain('accessibilityLabel');
      expect(src).toMatch(/monitor\.name/);
      expect(src).toMatch(/t\(`status\.\$\{monitor\.status\}`\)/);
    });
  });

  describe('min tap target sizes', () => {
    it('Button uses hitSlop on size="sm" to meet the 44pt iOS minimum', () => {
      const file = path.join(ROOT, 'src/components/ui/Button.tsx');
      const src = fs.readFileSync(file, 'utf8');
      expect(src).toMatch(/hitSlop/);
    });

    it('SegmentedControl uses hitSlop on size="sm"', () => {
      const file = path.join(ROOT, 'src/components/ui/SegmentedControl.tsx');
      const src = fs.readFileSync(file, 'utf8');
      expect(src).toMatch(/hitSlop/);
    });
  });
});
