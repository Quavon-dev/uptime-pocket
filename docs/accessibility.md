# Accessibility

Uptime Pocket's a11y commitments for v1.0.

## Static analysis

We have a static-analysis test in `tests/a11y/primitives.test.ts`
that scans every file under `app/`, `src/components/`, and
`src/features/` and asserts:

- Every primitive that we maintain internally declares
  `accessibilityRole` and `accessibilityLabel`.
- Every `<Switch>` in user-facing screens carries a label.
- Decorative elements (e.g. status pill dots) are marked with
  `accessibilityElementsHidden` and `importantForAccessibility="no"`.
- Min tap target: `Button` and `SegmentedControl` use `hitSlop` on
  `size="sm"` to ensure the effective tap target meets the iOS HIG
  44pt / Material 48dp minimum even when the visual size is smaller.

If you add a new primitive or interactive screen, the test list is
the source of truth for what props are required.

## What we test on-device (manual checklist)

These can't be caught in unit tests. Run through this before
shipping a release:

### VoiceOver (iOS)

- [ ] All tabs in the tab bar are announced with their label.
- [ ] All buttons announce their label and role.
- [ ] Segmented controls announce "1 of 3", "2 of 3", etc.
- [ ] Monitor cards announce name + status + key stats in one read.
- [ ] Server cards announce name + connection state + active flag.
- [ ] Switches announce their label and on/off state.
- [ ] Text input fields announce their label and the keyboard type.
- [ ] The biometric lock screen is reachable in 1-2 swipes from
      the lock state.

### TalkBack (Android)

Same list as VoiceOver, plus:

- [ ] The language picker chips announce the language in its native
      name (e.g. "Deutsch", not "German language").
- [ ] Long-press on the server card announces "long press to
      activate" (the active-server gesture).

### Dynamic Type (iOS) / Font Scale (Android)

- [ ] At the largest accessibility text size, the monitor list
      doesn't clip rows.
- [ ] The settings screen scrolls without clipping.
- [ ] The status pill remains visible and readable.

### Reduce Motion

- [ ] The button press animation (iOS spring) is suppressed.
- [ ] The segmented control indicator doesn't animate.
- [ ] The heartbeat pulse on the monitor card still works (this is
      status, not chrome).

### Color contrast

Verified in `tests/theme/colors.test.ts`. Both light and dark
palettes meet WCAG AA on text and on the status colors against
their respective backgrounds.

## Known gaps (v1.0)

- The 3-screen welcome flow has swipe gestures that don't have an
  a11y-friendly alternative (no skip-to-end button). Will be added
  in v1.1.
- The custom TimePicker uses a FlatList of buttons rather than the
  native iOS picker; this works but isn't as polished for VoiceOver
  users. We accept this for v1.0 and will revisit.
- The design system gallery has no screen-reader-friendly index
  for jumping between primitive categories.
