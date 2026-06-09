/**
 * Add Server screen.
 *
 * Phase 0: UI scaffolding with two auth methods. Phase 2: real save
 * through the Kuma auth + server store. Phase A3: extracted the form
 * into a shared <ServerForm /> component so the Edit screen can reuse
 * it without copy-paste.
 *
 * The single-CTA flow (v0.8+):
 *   1. User taps "Login".
 *   2. Zod validates the form (inside <ServerForm>).
 *   3. We probe the server with a real `login` round-trip using the
 *      credentials the user just typed. The session authenticates
 *      against Kuma on its `loginRequired` event, so we genuinely
 *      log in (and would catch wrong creds here, not at first use).
 *   4. On probe success, we write metadata to SQLite and the secret
 *      to the Keychain via addServer(server, credentials).
 *   5. We flip hasOnboarded=true so the welcome gate doesn't
 *      re-route us back here on next launch, and dismiss the modal.
 *
 * Why probe and save in the same callback?
 *   In v0.7 and earlier there were two buttons — "Test connection"
 *   and "Save server" — and users (rightly) didn't know the
 *   difference. Tapping Test logged in but didn't persist; tapping
 *   Save skipped the login. The new single CTA does the full flow
 *   so the only way to add a server is to have successfully logged
 *   into it. Looks the same as the welcome screen's button.
 */

import { View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { ServerForm, type ServerFormValues } from '@/components/server/ServerForm';
import { spacing, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';
import { useServers } from '@/data/store/servers';
import { useSettings } from '@/data/store/settings';
import { createClient } from '@/data/api/client';
import { PasswordSession } from '@/data/api/auth';
import { thisIsOlder } from '@/lib/version';
import type { AuthStrategy } from '@/domain/models';

export default function AddServerScreen() {
  const router = useRouter();
  const { surface } = useAppTheme();
  const addServer = useServers((s) => s.addServer);
  const setOnboarded = useSettings((s) => s.setOnboarded);

  /**
   * The form's single onSubmit. Probes Kuma with the typed creds,
   * returns null on success (and dismisses) or a translated error
   * string on failure (and stays on the form so the user can fix
   * the input).
   */
  const handleSubmit = async (submit: {
    values: ServerFormValues;
    credentials: AuthStrategy | undefined;
  }): Promise<string | null> => {
    const { values, credentials } = submit;
    if (!credentials) {
      // Schema in 'add' mode requires both fields; this branch
      // is only reachable if deriveCredentials changed its rules
      // without updating the schema. Be defensive.
      return t('servers.add.error.missingToken');
    }
    const trimmedUrl = values.url.trim().replace(/\/+$/, '');

    // Probe — the session does the real `login` round trip on
    // Kuma's `loginRequired` event, so this actually authenticates.
    // If creds are wrong, Kuma returns authInvalidToken and we
    // surface a friendly error to the user.
    let detectedVersion: string | null = null;
    try {
      const session = new PasswordSession(credentials.username, credentials.password);
      const probeServer = {
        id: 'probe',
        name: values.name,
        url: trimmedUrl,
        authKind: 'password' as const,
        connected: false,
        notificationMode: 'direct' as const,
        createdAt: new Date(),
      };
      const result = await createClient(probeServer, session).ping();
      if (!result.connected) {
        return result.error ?? t('servers.add.error.unreachable');
      }
      const minVersion = '2.0.0';
      if (result.version && thisIsOlder(result.version, minVersion)) {
        return tn('servers.add.error.outdatedKuma', { version: result.version });
      }
      if (result.version) {
        detectedVersion = result.version;
      }
    } catch (err) {
      return err instanceof Error ? err.message : t('servers.add.error.unreachable');
    }

    // Persist. We use a fresh id so re-tries of the form don't
    // collide with a previous run that left a half-written record.
    const id = `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await addServer(
      {
        id,
        name: values.name.trim(),
        url: trimmedUrl,
        authKind: credentials.kind,
        kumaVersion: detectedVersion ?? undefined,
        connected: false,
        notificationMode: 'direct',
        createdAt: new Date(),
      },
      credentials,
    );
    setOnboarded(true);
    router.back();
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: surface.background, paddingTop: spacing[2] }}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar title={t('servers.add.title')} />
      <ServerForm
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </View>
  );
}
