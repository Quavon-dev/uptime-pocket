/**
 * Edit Server screen.
 *
 * Reuses the shared <ServerForm /> component with the existing
 * server's name + URL pre-filled. Password fields are blank (we
 * never display secrets) and submitting without re-typing a password
 * leaves the existing Keychain entry alone.
 *
 * As of v0.8+ the form is password-only — the bearer/API-key
 * option was removed because Kuma 2.x doesn't accept API keys for
 * socket auth.
 */

import { View } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import {
  ServerForm,
  type ServerFormValues,
} from '@/components/server/ServerForm';
import { spacing, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';
import { useServers } from '@/data/store/servers';
import { createClient } from '@/data/api/client';
import { PasswordSession } from '@/data/api/auth';
import { thisIsOlder } from '@/lib/version';
import type { AuthStrategy } from '@/domain/models';

export default function EditServerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { surface } = useAppTheme();

  const server = useServers((s) => s.servers.find((srv) => srv.id === id));
  const updateServer = useServers((s) => s.updateServer);

  // Pre-fill values for the form. The form will treat `initial` as a
  // controlled source of truth, but the secret fields are always blank
  // by construction.
  const initial = server
    ? {
        name: server.name,
        url: server.url,
      }
    : undefined;

  const handleTest = async (values: ServerFormValues): Promise<string | null> => {
    if (!server) return t('servers.detail.notFound.title');
    if (!values.url.trim()) return t('servers.add.error.invalidUrl');
    try {
      // Use the new credentials if the user typed any, otherwise
      // fall back to a no-op probe session.
      const newCreds = deriveForTest(values);
      const session = new PasswordSession(
        newCreds?.username ?? 'probe-user',
        newCreds?.password ?? 'probe-pass',
        '',
        () => Promise.reject(new Error('test')),
      );
      const probeServer = {
        id: server.id,
        name: values.name || server.name,
        url: values.url,
        authKind: 'password' as const,
        connected: false,
        notificationMode: 'direct' as const,
        createdAt: server.createdAt,
      };
      const result = await createClient(probeServer, session).ping();
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
    if (!server) return;
    const { values, credentials } = submit;
    const trimmedUrl = values.url.trim().replace(/\/+$/, '');

    await updateServer(
      server.id,
      {
        name: values.name.trim(),
        url: trimmedUrl,
      },
      credentials, // may be undefined - updateServer preserves the existing entry
    );
    router.back();
  };

  if (!server) {
    return (
      <View style={{ flex: 1, backgroundColor: surface.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <GlassNavBar title={t('servers.detail.notFound.title')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: surface.background, paddingTop: spacing[2] }}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar title={t('servers.edit.title')} />
      <ServerForm
        initial={initial}
        onSubmit={handleSubmit}
        onTest={handleTest}
        onCancel={() => router.back()}
        submitLabel={t('common.save')}
      />
    </View>
  );
}

/** Mirror the ServerForm's deriveCredentials logic for the test path. */
function deriveForTest(
  values: ServerFormValues
): { username: string; password: string } | undefined {
  if (values.username.trim().length === 0 || values.password.length === 0) {
    return undefined;
  }
  return {
    username: values.username.trim(),
    password: values.password,
  };
}
