/**
 * Storage tests for the widget snapshot writer.
 *
 * We test the SNAPSHOT_FILENAME constant + a few invariants
 * about the writer. The full iOS / Android write paths are
 * not unit-tested because they require the native module +
 * expo-file-system, which are not friendly to mock in jest's
 * default RN preset. They are covered by manual smoke tests
 * (run the app, check the widget updates).
 */

import { SNAPSHOT_FILENAME } from '../storage';

describe('storage constants', () => {
  it('uses a stable snapshot filename', () => {
    // The Swift widget reads this same name. If you change it,
    // update WidgetSnapshotReader.swift's `snapshotFileName`
    // constant too.
    expect(SNAPSHOT_FILENAME).toBe('widget_snapshot.json');
  });
});
