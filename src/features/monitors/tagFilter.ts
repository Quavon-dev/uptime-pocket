/**
 * Pure helpers for tag-based filtering on the monitor list.
 *
 * The monitor list can get long for a busy Kuma server, so we let
 * the user filter by tag. The filter UI is two-level:
 *
 *   1. Status chips: All / Up / Down (existing)
 *   2. Tag chips:   <no filter> / tag-A / tag-B / ...
 *
 * We support "OR within tags" — if multiple tags are selected, a
 * monitor matches if it has ANY of them. We deliberately don't yet
 * support AND/intersection because that has the "empty result"
 * problem that's annoying to recover from.
 *
 * All functions are pure so they can be unit-tested without React.
 */

import type { Tag } from '@/domain/models';

export interface TagFilter {
  /** Stable ids of selected tags. Empty = no tag filter. */
  selectedTagIds: readonly number[];
}

/** Collect the union of all tags across a monitor list. */
export function collectAllTags<T extends { tags?: readonly Tag[] | null }>(
  monitors: readonly T[]
): Tag[] {
  const map = new Map<number, Tag>();
  for (const m of monitors) {
    if (!m.tags) continue;
    for (const tag of m.tags) {
      // Last-wins on color in case of duplicates, but tags are
      // usually unique within a server.
      if (!map.has(tag.id)) map.set(tag.id, tag);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Apply a status filter to a monitor list. */
export function applyStatusFilter<T extends { status: string }>(
  monitors: readonly T[],
  status: 'all' | 'up' | 'down'
): T[] {
  if (status === 'up') {
    return monitors.filter((m) => m.status === 'up' || m.status === 'maintenance');
  }
  if (status === 'down') {
    return monitors.filter((m) => m.status === 'down' || m.status === 'pending');
  }
  return monitors.slice();
}

/** Apply a tag filter to a monitor list. Empty selection = pass-through. */
export function applyTagFilter<T extends { tags?: Tag[] }>(
  monitors: readonly T[],
  filter: TagFilter
): T[] {
  if (filter.selectedTagIds.length === 0) return monitors.slice();
  const set = new Set(filter.selectedTagIds);
  return monitors.filter((m) => {
    if (!m.tags) return false;
    for (const tag of m.tags) {
      if (set.has(tag.id)) return true;
    }
    return false;
  });
}

/** Compose: status then tags. */
export function applyFilters<T extends { status: string; tags?: Tag[] }>(
  monitors: readonly T[],
  status: 'all' | 'up' | 'down',
  tags: TagFilter
): T[] {
  return applyTagFilter(applyStatusFilter(monitors, status), tags);
}

/** Toggle a tag id in/out of a filter. Returns a NEW filter object. */
export function toggleTag(
  filter: TagFilter,
  tagId: number
): TagFilter {
  const i = filter.selectedTagIds.indexOf(tagId);
  if (i === -1) {
    return { selectedTagIds: [...filter.selectedTagIds, tagId] };
  }
  return {
    selectedTagIds: filter.selectedTagIds.filter((id) => id !== tagId),
  };
}
