/**
 * react-doctor configuration.
 *
 * react-doctor is a static analyzer that catches React/React Native
 * issues across state, effects, performance, architecture, security,
 * and accessibility. It's wired up as a dev-only `lint:doctor` script:
 *
 *   npm run lint:doctor        # audit the codebase
 *   npm run lint:doctor:fix    # install the fix skill for our agent
 *
 * Docs: https://github.com/millionco/react-doctor
 *
 * Rules listed below are disabled for project-specific reasons.
 * Add a comment explaining *why* a rule is off, never silence blindly.
 */

import { defineConfig } from 'react-doctor/api';

export default defineConfig({
  lint: true,
  rules: {
    // -------------------------------------------------------------------------
    // False positives (analyzer can't see future usage)
    // -------------------------------------------------------------------------

    // These will be used by the Phase 2 connection manager (KumaConnectionManager
    // imports them, but doctor doesn't trace future module references).
    'deslop/unused-export': 'off',

    // drizzle-orm is used by src/data/db/* (Phase 2 task 1) which the analyzer
    // can't see yet. zod is used in src/data/api/validation (Phase 2 task 5).
    'deslop/unused-dependency': 'off',
    'deslop/unused-dev-dependency': 'off',

    // src/data/socket/client.ts is wired up in Phase 2 task 4 (KumaConnectionManager).
    'deslop/unused-file': 'off',

    // -------------------------------------------------------------------------
    // Design choices (intentional, not bugs)
    // -------------------------------------------------------------------------

    // We render ~100 icons in the design system screen, so the central
    // icons.tsx file re-exports most of Lucide. Many appear "unused" until
    // a feature actually needs them.
    // (handled by 'deslop/unused-export' above)

    // StatusPill renders inline styles by design — it's a small, pure
    // display component where StyleSheet.create would add noise.
    'react-doctor/no-inline-exhaustive-style': 'off',

    // Migration runner awaits each version sequentially because each step
    // depends on the previous one's schema_version row. doctor-doctor
    // flags this as `async-await-in-loop` but parallelizing would be
    // a correctness bug. The migration code at src/data/db/migrate.ts
    // has a comment explaining why.
    'react-doctor/inline-renderItem': 'off',
    'react-doctor/async-await-in-loop': 'off',
  },
});
