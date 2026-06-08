/**
 * Storage adapter for the widget snapshot.
 *
 * The widget runs in a different Android process. We share data with
 * it by writing a JSON file to the app's internal `filesDir`, which
 * both processes can read. On non-Android platforms the write is a
 * no-op (the iOS widget is a separate codebase that doesn't share
 * a file with us).
 *
 * Implementation: we use `expo-file-system`'s `File` API. It maps to
 * the platform-native file APIs, and on Android the document
 * directory IS the `filesDir` the widget reads from.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { WidgetSnapshot } from './snapshot';

/** The file name. The Kotlin widget reads this same name. */
export const SNAPSHOT_FILENAME = 'widget_snapshot.json';

/**
 * Write the snapshot to disk, replacing any previous file.
 *
 * We use `createAtomically` because a partial write mid-flush
 * would leave the widget reading a broken JSON. Atomic write =
 * write to a temp file, then rename. POSIX guarantees rename
 * is atomic on the same filesystem.
 */
export async function writeSnapshotFile(snapshot: WidgetSnapshot): Promise<void> {
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
    const json = JSON.stringify(snapshot, null, 2);
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
