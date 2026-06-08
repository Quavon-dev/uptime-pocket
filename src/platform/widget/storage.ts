/**
 * Storage adapter for the widget snapshot.
 *
 * The widget runs in a different process from the main app on
 * BOTH platforms. We share data with it by writing a JSON file
 * to a location both processes can read.
 *
 *   - Android: the widget extension and the main app share
 *     `filesDir` (since they run in the same app package), so
 *     `expo-file-system`'s `documentDirectory` works.
 *
 *   - iOS: the widget extension is a separate target with its
 *     own bundle ID. They can only share a location if both
 *     declare the same App Group entitlement. We write to the
 *     App Group container via the native module bridge (a tiny
 *     Swift one-liner that calls `containerURL(forSecurity
 *     ApplicationGroupIdentifier:)`).
 *
 * Implementation:
 *   - We try `nativeAppGroup.writeSnapshot(json)` first if
 *     available. The native module is added by the
 *     `uptime-pocket-ios-widget` config plugin.
 *   - On Android we fall through to `expo-file-system` (which
 *     also serves as a no-op on web / iOS in the absence of
 *     the native module).
 *   - On platforms where neither works, `writeSnapshotFile`
 *     silently returns — the widget won't update but the app
 *     still works.
 *
 * The snapshot is:
 *   - small (<10 KB even with 50 monitors per server × 5 servers)
 *   - written at most every 2 seconds (debounced in the hook)
 *   - read-only for the widget (it never writes back)
 *   - missing files are treated as "no data" (widget shows a
 *     placeholder)
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { WidgetSnapshot } from './snapshot';

/** The file name. Both the Android and iOS widget read this
 *  same name. Keep in sync with the Swift `snapshotFileName`
 *  constant in `WidgetSnapshotReader.swift`. */
export const SNAPSHOT_FILENAME = 'widget_snapshot.json';

/**
 * Try the iOS App Group native module. Returns true if the
 * write succeeded, false if the module is not available (i.e.
 * the iOS widget plugin hasn't been run, or we're on a
 * non-iOS platform).
 *
 * We use a dynamic import-style require so the bundle doesn't
 * crash on platforms where the module isn't linked. The module
 * is exposed as `UptimePocketAppGroup` in the global require
 * tree once `expo prebuild` has been run with our plugin.
 */
type AppGroupModule = {
  writeSnapshot: (filename: string, json: string) => Promise<boolean>;
  isAvailable: () => Promise<boolean>;
};

let cachedModule: AppGroupModule | null | undefined;

function getAppGroupModule(): AppGroupModule | null {
  if (cachedModule !== undefined) return cachedModule;
  if (Platform.OS !== 'ios') {
    cachedModule = null;
    return null;
  }
  try {
    // The native module is added by the ios-widget config plugin.
    // If the user hasn't run prebuild with our plugin, this
    // require throws and we fall back to no-op.
    const mod = require('react-native').NativeModules.UptimePocketAppGroup;
    cachedModule = (mod as AppGroupModule) ?? null;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/**
 * Write the snapshot to the platform's widget-shared location,
 * replacing any previous file.
 *
 * On iOS: writes to the App Group container via the native
 * module. Atomic on POSIX (write + rename).
 *
 * On Android: writes to `filesDir/widget_snapshot.json` via
 * `expo-file-system`. We use `moveAsync` for atomicity.
 *
 * On web / unsupported: no-op.
 */
export async function writeSnapshotFile(snapshot: WidgetSnapshot): Promise<void> {
  const json = JSON.stringify(snapshot, null, 2);

  // iOS path: native App Group write.
  if (Platform.OS === 'ios') {
    const mod = getAppGroupModule();
    if (mod) {
      try {
        await mod.writeSnapshot(SNAPSHOT_FILENAME, json);
        return;
      } catch (err) {
        if (__DEV__) {
          console.warn('[widget] iOS App Group write failed:', err);
        }
        // Fall through to the legacy path below.
      }
    }
  }

  // Android path: expo-file-system into documentDirectory.
  if (Platform.OS !== 'android') return;
  const dir = FileSystem.documentDirectory;
  if (!dir) {
    // Document directory isn't available — should never happen
    // on a real device, but we don't want to crash the app
    // over a missing dir.
    return;
  }
  const target = `${dir}${SNAPSHOT_FILENAME}`;
  const temp = `${target}.tmp`;

  try {
    await FileSystem.writeAsStringAsync(temp, json, {
      encoding: 'utf8',
    });
    // Move the temp file over the real one. If the move fails
    // (e.g. process killed mid-write) the next flush will retry
    // from the same temp name and succeed on the next move.
    await FileSystem.moveAsync({ from: temp, to: target });
  } catch (err) {
    // Don't crash the app on a disk error. The next debounce
    // cycle will try again with a fresh snapshot.
    if (__DEV__) {
      console.warn('[widget] snapshot write failed:', err);
    }
  }
}

/**
 * Delete the snapshot file. Called when the user removes all
 * servers, or signs out.
 */
export async function clearSnapshotFile(): Promise<void> {
  if (Platform.OS === 'ios') {
    const mod = getAppGroupModule();
    if (mod) {
      try {
        await mod.writeSnapshot(SNAPSHOT_FILENAME, '');
        return;
      } catch {
        // Fall through.
      }
    }
  }
  if (Platform.OS !== 'android') return;
  const dir = FileSystem.documentDirectory;
  if (!dir) return;
  const target = `${dir}${SNAPSHOT_FILENAME}`;
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) {
      await FileSystem.deleteAsync(target, { idempotent: true });
    }
  } catch {
    // Idempotent clear — failing to clear is fine.
  }
}
