/**
 * Widget platform integration — public API.
 *
 * What this module does:
 *   - Bridges the React app's monitor state to the Android home
 *     screen widget. The iOS widget is a separate codebase (Swift
 *     + WidgetKit) and lives in `src/platform/widget/ios/`.
 *   - On Android, the widget reads a JSON file from the app's
 *     `filesDir`. We keep that file in sync with the live state.
 *
 * Public exports:
 *   - useWidgetSnapshot: hook to mount at app startup
 *   - forceWidgetRefresh: imperative flush after a critical event
 *   - clearWidgetSnapshot: wipe the file (e.g. on sign-out)
 *   - WidgetSnapshot, buildWidgetSnapshot: pure data layer
 *
 * @example
 *   // In the root layout:
 *   export default function RootLayout() {
 *     useWidgetSnapshot();
 *     return <Stack />;
 *   }
 */
export {
  useWidgetSnapshot,
  forceWidgetRefresh,
  clearWidgetSnapshot,
} from './useWidgetSnapshot';

export {
  buildWidgetSnapshot,
  worstStatus,
  type WidgetSnapshot,
  type WidgetServer,
  type WidgetMonitor,
} from './snapshot';

export {
  SNAPSHOT_FILENAME,
  writeSnapshotFile,
  clearSnapshotFile,
} from './storage';
