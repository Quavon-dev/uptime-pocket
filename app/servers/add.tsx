/**
 * Add Server screen.
 *
 * Phase 0: UI scaffolding with two auth methods. Phase 2: real save
 * through the Kuma auth + server store. Phase A3: extracted the form
 * into a shared <ServerForm /> component so the Edit screen can reuse
 * it without copy-paste.
 *
 * The submit flow:
 *   1. Zod validates the form (inside <ServerForm>).
 *   2. We probe the version via /api/status (Kuma 2.0+ doesn't need
 *      auth for this endpoint, so a placeholder bearer works).
 *   3. We call addServer(server, auth), which writes metadata to
 *      SQLite and the secret to the Keychain.
 *   4. We flip hasOnboarded=true so the welcome gate doesn't
 *      re-route us back here on next launch.
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

  const handleTest = async (values: ServerFormValues): Promise<string | null> => {
    if (!values.url.trim()) {
      return t('servers.add.error.invalidUrl');
    }
    try {
      // The session knows the username + password. The probe path
      // (KumaClient.pingOverSocket) opens a transient socket, and
      // on Kuma's `loginRequired` it calls `session.authenticate()`,
      // which does the real `login` round trip with the credentials
      // the user typed. No throwaway state, no empty-token hack.
      const session = new PasswordSession(values.username, values.password);
      const server = {
        id: 'temp',
        name: values.name || 'Test',
        url: values.url,
        authKind: 'password' as const,
        connected: false,
        notificationMode: 'direct' as const,
        createdAt: new Date(),
      };
      const client = createClient(server, session);
      const result = await client.ping();
      if (!result.connected) {
        return result.error ?? t('servers.add.error.unreachable');
      }
      const minVersion = '2.0.0';
      if (result.version && thisIsOlder(result.version, minVersion)) {
        return tn('servers.add.error.outdatedKuma', { version: result.version });
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t('servers.add.error.unreachable');
    }
  };

  const handleSubmit = async (submit: {
    values: ServerFormValues;
    credentials: AuthStrategy | undefined;
  }): Promise<void> => {
    const { values, credentials } = submit;
    const trimmedUrl = values.url.trim().replace(/\/+$/, '');

    // Best-effort version probe. The session does the real `login`
    // round trip on Kuma's `loginRequired` event, so the probe
    // actually authenticates (and we get a JWT cached in the session
    // as a side effect, but we don't use it for the save — the
    // session we save is the one we build fresh below).
    let detectedVersion: string | null = null;
    try {
      const probeSession = new PasswordSession(values.username, values.password);
      const probeServer = {
        id: 'probe',
        name: values.name,
        url: trimmedUrl,
        authKind: 'password' as const,
        connected: false,
        notificationMode: 'direct' as const,
        createdAt: new Date(),
      };
      const probe = await createClient(probeServer, probeSession).ping();
      if (probe.connected && probe.version) {
        detectedVersion = probe.version;
      }
    } catch {
      // Probe failure is non-fatal; we just don't pre-populate the version.
    }

    if (!credentials) {
      // We required a secret in the form schema, so we shouldn't get
      // here — but if we do, surface the validation error from the
      // form rather than silently write a server with no auth.
      throw new Error(t('servers.add.error.missingToken'));
    }

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
  };

  return (
    <View style={{ flex: 1, backgroundColor: surface.background, paddingTop: spacing[2] }}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar title={t('servers.add.title')} />
      <ServerForm
        onSubmit={handleSubmit}
        onTest={handleTest}
        onCancel={() => router.back()}
      />
    </View>
  );
}
