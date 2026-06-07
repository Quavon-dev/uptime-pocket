/**
 * Add Server screen - form to add a Kuma instance.
 * Phase 0: UI scaffolding with two auth methods. Logic comes in Phase 2.
 */

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter , Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { t, tn } from '@/i18n';
import { useServers } from '@/data/store/servers';
import { createClient } from '@/data/api/client';
import { createSession } from '@/data/api/auth';

type AuthMethod = 'bearer' | 'password';

export default function AddServerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addServer = useServers((s) => s.addServer);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('bearer');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setError(null);
    if (!url.trim()) {
      setError(t('servers.add.error.invalidUrl'));
      return;
    }
    setTesting(true);
    try {
      const session = createSession(
        authMethod === 'bearer'
          ? { kind: 'bearer', token: token || 'placeholder' }
          : { kind: 'password', username, password },
        url
      );
      const server = {
        id: 'temp',
        name: name || 'Test',
        url,
        auth:
          authMethod === 'bearer'
            ? { kind: 'bearer' as const, token: token || 'placeholder' }
            : { kind: 'password' as const, username, password },
        connected: false,
        notificationMode: 'direct' as const,
        createdAt: new Date(),
      };
      const client = createClient(server, session);
      const result = await client.ping();
      if (!result.connected) {
        setError(t('servers.add.error.unreachable'));
      } else {
        const minVersion = '2.0.0';
        if (result.version && thisIsOlder(result.version, minVersion)) {
          setError(tn('servers.add.error.outdatedKuma', { version: result.version }));
        } else {
          setError(null);
          // Success! Could navigate back or auto-save
        }
      }
    } catch {
      setError(t('servers.add.error.unreachable'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim() || !url.trim()) {
      setError(t('servers.add.error.invalidUrl'));
      return;
    }
    if (authMethod === 'bearer' && !token.trim()) {
      setError('Please enter a token');
      return;
    }
    if (authMethod === 'password' && (!username.trim() || !password)) {
      setError('Please enter username and password');
      return;
    }
    setSaving(true);
    try {
      const id = `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      addServer({
        id,
        name: name.trim(),
        url: url.trim().replace(/\/+$/, ''),
        auth:
          authMethod === 'bearer'
            ? { kind: 'bearer', token: token.trim() }
            : { kind: 'password', username: username.trim(), password },
        connected: false,
        notificationMode: 'direct',
        createdAt: new Date(),
      });
      router.back();
    } catch {
      setError(t('servers.add.error.unreachable'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar
        title={t('servers.add.title')}
        left={
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={[typography.body, { color: colors.brand[500] }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: spacing[4],
          paddingBottom: insets.bottom + 80,
          gap: spacing[4],
        }}
        keyboardShouldPersistTaps="handled">
        {/* Name */}
        <Field label={t('servers.add.name')}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('servers.add.namePlaceholder')}
            placeholderTextColor={colors.gray[400]}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>

        {/* URL */}
        <Field label={t('servers.add.url')}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder={t('servers.add.urlPlaceholder')}
            placeholderTextColor={colors.gray[400]}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>

        {/* Auth method */}
        <Field label={t('servers.add.authMethod')}>
          <View style={styles.segmented}>
            {(['bearer', 'password'] as AuthMethod[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setAuthMethod(m)}
                style={[
                  styles.segment,
                  authMethod === m && styles.segmentActive,
                ]}>
                <Text
                  style={[
                    typography.captionEmphasized,
                    {
                      color: authMethod === m ? 'white' : colors.surface.light.text,
                    },
                  ]}>
                  {m === 'bearer' ? t('servers.add.bearer') : t('servers.add.password')}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>

        {authMethod === 'bearer' ? (
          <>
            <Field label={t('servers.add.bearerToken')} hint={t('servers.add.bearerHint')}>
              <TextInput
                value={token}
                onChangeText={setToken}
                placeholder="••••••••"
                placeholderTextColor={colors.gray[400]}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
            </Field>
          </>
        ) : (
          <>
            <Field label={t('servers.add.username')}>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="admin"
                placeholderTextColor={colors.gray[400]}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Field>
            <Field label={t('servers.add.password')}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.gray[400]}
                style={styles.input}
                secureTextEntry
              />
            </Field>
          </>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={[typography.callout, { color: colors.status.down }]}>
              {error}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Pressable
            onPress={handleTest}
            disabled={testing || saving}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { opacity: pressed || testing ? 0.85 : 1 },
            ]}>
            {testing ? (
              <ActivityIndicator size="small" color={colors.brand[500]} />
            ) : (
              <Text style={[typography.bodyEmphasized, { color: colors.brand[500] }]}>
                {t('servers.add.test')}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={saving || testing}
            style={({ pressed }) => [
              styles.primaryBtn,
              { opacity: pressed || saving ? 0.85 : 1 },
            ]}>
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={[typography.bodyEmphasized, { color: 'white' }]}>
                {t('servers.add.save')}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing[2] }}>
      <Text style={[typography.captionEmphasized, { color: colors.gray[700] }]}>
        {label}
      </Text>
      {children}
      {hint && (
        <Text style={[typography.caption, { color: colors.gray[500] }]}>
          {hint}
        </Text>
      )}
    </View>
  );
}

function thisIsOlder(version: string, minVersion: string): boolean {
  const v = version.split('.').map(Number);
  const m = minVersion.split('.').map(Number);
  for (let i = 0; i < Math.max(v.length, m.length); i++) {
    const a = v[i] ?? 0;
    const b = m[i] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.light.background },
  input: {
    ...typography.body,
    backgroundColor: colors.surface.light.elevated,
    borderWidth: 0.5,
    borderColor: colors.surface.light.border,
    borderRadius: semanticRadius.button,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    color: colors.surface.light.text,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface.light.sunken,
    borderRadius: semanticRadius.button,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing[2],
    alignItems: 'center',
    borderRadius: semanticRadius.button - 3,
  },
  segmentActive: {
    backgroundColor: colors.brand[500],
  },
  errorBox: {
    padding: spacing[3],
    backgroundColor: `${colors.status.down}1A`,
    borderRadius: 12,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.brand[500],
    paddingVertical: spacing[3],
    borderRadius: semanticRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.surface.light.elevated,
    paddingVertical: spacing[3],
    borderRadius: semanticRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: colors.brand[500],
  },
});
