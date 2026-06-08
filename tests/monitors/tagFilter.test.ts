/**
 * Tests for the pure tag-filter helpers.
 */

import {
  applyStatusFilter,
  applyTagFilter,
  applyFilters,
  collectAllTags,
  toggleTag,
  type TagFilter,
} from '@/features/monitors/tagFilter';

const tagA = { id: 1, name: 'Production', color: '#FF0000' };
const tagB = { id: 2, name: 'Staging', color: '#00FF00' };
const tagC = { id: 3, name: 'API', color: '#0000FF' };

const m1 = { id: 101, name: 'Web', status: 'up', tags: [tagA] };
const m2 = { id: 102, name: 'API', status: 'down', tags: [tagA, tagC] };
const m3 = { id: 103, name: 'Stage', status: 'up', tags: [tagB] };
const m4 = { id: 104, name: 'Other', status: 'pending', tags: [] };
const monitors = [m1, m2, m3, m4];

describe('collectAllTags()', () => {
  it('returns the union of tags across monitors', () => {
    const tags = collectAllTags(monitors);
    expect(tags).toHaveLength(3);
    expect(tags.map((t) => t.name).sort()).toEqual(['API', 'Production', 'Staging']);
  });
  it('handles monitors with no tags field', () => {
    const tags = collectAllTags([{ id: 1, name: 'x', status: 'up' } as { id: number; name: string; status: string; tags?: never[] }]);
    expect(tags).toEqual([]);
  });
  it('dedupes tags that appear on multiple monitors', () => {
    const tags = collectAllTags([
      { tags: [tagA, tagB] },
      { tags: [tagA, tagC] },
    ]);
    expect(tags).toHaveLength(3);
  });
});

describe('applyStatusFilter()', () => {
  it('passes everything through with "all"', () => {
    expect(applyStatusFilter(monitors, 'all')).toEqual(monitors);
  });
  it('keeps up + maintenance for "up"', () => {
    const result = applyStatusFilter(
      [...monitors, { id: 200, name: 'Maint', status: 'maintenance' }],
      'up'
    );
    expect(result.map((m) => m.id)).toEqual([101, 103, 200]);
  });
  it('keeps down + pending for "down"', () => {
    const result = applyStatusFilter(monitors, 'down');
    expect(result.map((m) => m.id)).toEqual([102, 104]);
  });
});

describe('applyTagFilter()', () => {
  const f: TagFilter = { selectedTagIds: [1] };
  it('passes everything through with empty selection', () => {
    expect(applyTagFilter(monitors, { selectedTagIds: [] })).toEqual(monitors);
  });
  it('keeps monitors with at least one matching tag (OR semantics)', () => {
    expect(applyTagFilter(monitors, { selectedTagIds: [1] }).map((m) => m.id)).toEqual([101, 102]);
    expect(applyTagFilter(monitors, { selectedTagIds: [2, 3] }).map((m) => m.id)).toEqual([102, 103]);
  });
  it('excludes monitors with no tags when a tag is selected', () => {
    const result = applyTagFilter(monitors, { selectedTagIds: [99] });
    expect(result).toEqual([]);
  });
});

describe('applyFilters()', () => {
  it('composes status then tags', () => {
    // Down + tag Production → just m2
    const result = applyFilters(monitors, 'down', { selectedTagIds: [1] });
    expect(result.map((m) => m.id)).toEqual([102]);
  });
  it('returns all when both filters are permissive', () => {
    expect(applyFilters(monitors, 'all', { selectedTagIds: [] })).toEqual(monitors);
  });
});

describe('toggleTag()', () => {
  it('adds a tag id that is not in the selection', () => {
    const next = toggleTag({ selectedTagIds: [1] }, 2);
    expect(next.selectedTagIds).toEqual([1, 2]);
  });
  it('removes a tag id that is in the selection', () => {
    const next = toggleTag({ selectedTagIds: [1, 2] }, 1);
    expect(next.selectedTagIds).toEqual([2]);
  });
  it('returns a new object (does not mutate the input)', () => {
    const input: TagFilter = { selectedTagIds: [1] };
    const next = toggleTag(input, 2);
    expect(next).not.toBe(input);
    expect(input.selectedTagIds).toEqual([1]); // unchanged
  });
});
