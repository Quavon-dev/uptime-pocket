/**
 * Edit Server screen.
 *
 * Reuses the shared <ServerForm /> component with the existing
 * server's name + URL pre-filled. Password fields are blank (we
 * never display secrets) and the form runs in "edit" mode: password
 * is optional, and the Login button decides whether to probe based
 * on whether the user typed a fresh secret.
 *
 * As of v0.8+ the form is password-only — the bearer/API-key
 * option was removed because Kuma 2.x doesn't accept API keys for
 * socket auth. v0.8+ also collapses the old "Test" + "Save" pair
 * into a single "Login" CTA that runs the full flow.
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

  /**
   * The form's single onSubmit. Behavior:
   *   - If the user typed new credentials (username + password both
   *     non-blank), probe the server with them first. On probe
   *     failure, return the error so the form can display it.
   *   - If the user left the credentials blank, skip the probe and
   *     keep the existing Keychain entry. updateServer(..., undefined)
   *     preserves it.
   *   - On success, persist the (possibly updated) metadata and
   *     dismiss the modal.
   */
  const handleSubmit = async (submit: {
    values: ServerFormValues;
    credentials: AuthStrategy | undefined;
  }): Promise<string | null> => {
    if (!server) return t('servers.detail.notFound.title');
    const { values, credentials } = submit;
    const trimmedUrl = values.url.trim().replace(/\/+$/, '');

    if (credentials) {
      // Probe with the fresh creds — must succeed before we commit.
      try {
        const session = new PasswordSession(
          credentials.username,
          credentials.password,
        );
        const probeServer = {
          id: server.id,
          name: values.name || server.name,
          url: trimmedUrl,
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
      } catch (err) {
        return err instanceof Error ? err.message : t('servers.add.error.unreachable');
      }
    }

    await updateServer(
      server.id,
      {
        name: values.name.trim(),
        url: trimmedUrl,
      },
      credentials, // may be undefined - updateServer preserves the existing entry
    );
    router.back();
    return null;
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
        onCancel={() => router.back()}
      />
    </View>
  );
}
