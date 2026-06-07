/**
 * useServersHydrated — once-per-app mount hook that loads servers
 * from SQLite into the in-memory Zustand store.
 *
 * Mount this exactly once near the top of the React tree (in the
 * root layout, after the providers). It returns `{ hydrated }` so
 * callers can show a splash screen until hydration finishes.
 *
 * Why a hook and not a top-level side effect?
 *   - Side effects in module init run before React mounts, which means
 *     the database call would fire even on tests/SSR.
 *   - A hook inside the provider tree ensures it only runs in the
 *     app, and only once (the empty dep list).
 */

import { useEffect, useState } from 'react';
import { useServers } from '@/data/store/servers';

export function useServersHydrated(): { hydrated: boolean } {
  const hydrate = useServers((s) => s.hydrate);
  const hydrated = useServers((s) => s.hydrated);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (hydrated) return;
    hydrate().catch((err) => {
      // Surface the error to the console; the UI keeps the empty
      // list and the user can try adding a server fresh.
      console.error('[useServersHydrated] failed to hydrate', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    });
  }, [hydrated, hydrate]);

  if (error) {
    // Re-throw so the root error boundary catches it in production.
    // (In dev this just logs via console.error above.)
    throw error;
  }

  return { hydrated };
}
