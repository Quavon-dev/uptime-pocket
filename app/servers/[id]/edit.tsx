/**
 * Edit Server screen.
 *
 * Reuses the shared <ServerForm /> component with the existing
 * server's metadata pre-filled. The form is identical to Add except
 * the title, button label, and submit behavior differ.
 *
 * Security
 * --------
 * The Keychain entry for the server is NOT decrypted and pre-filled
 * into the form. The user must re-enter the secret to change it. If
 * the form is submitted without a new secret, the existing Keychain
 * entry is preserved (updateServer is called with credentials=undefined).
 *
 * This is the safer default for two reasons:
 *   1. A shoulder-surfer can't glance at the form to see the token.
 *   2. We never have to put the secret into React state where it
 *      could be logged or rendered by a screen recorder.
 *
 * Version probe
 * -------------
 * We re-probe /api/status on save so the detected version field
 * stays in sync with the actual server (e.g. if the user pointed us
 * at a different Kuma instance with the same name).
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
import { BearerSession, PasswordSession } from '@/data/api/auth';
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
        authKind: server.authKind,
      }
    : undefined;

  const handleTest = async (values: ServerFormValues): Promise<string | null> => {
    if (!server) return t('servers.detail.notFound.title');
    if (!values.url.trim()) return t('servers.add.error.invalidUrl');
    try {
      // Use the new token/credentials if the user typed any, otherwise
      // fall back to a placeholder bearer (probe-only path).
      const newCreds = deriveForTest(values);
      const session =
        newCreds?.kind === 'password'
          ? new PasswordSession(newCreds.username, newCreds.password, '', () =>
              Promise.reject(new Error('test')),
            )
          : new BearerSession(
              newCreds?.kind === 'bearer' ? newCreds.token : 'probe',
            );
      const probeServer = {
        id: server.id,
        name: values.name || server.name,
        url: values.url,
        authKind: newCreds?.kind ?? server.authKind,
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
        // If the user changed the auth method but didn't type a new
        // secret, keep the existing kind. The credentials we pass are
        // undefined so the Keychain entry is left alone.
        authKind: credentials?.kind ?? server.authKind,
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
function deriveForTest(values: ServerFormValues): AuthStrategy | undefined {
  if (values.authMethod === 'bearer') {
    if (values.token.trim().length === 0) return undefined;
    return { kind: 'bearer', token: values.token.trim() };
  }
  if (values.username.trim().length === 0 || values.password.length === 0) {
    return undefined;
  }
  return {
    kind: 'password',
    username: values.username.trim(),
    password: values.password,
  };
}
