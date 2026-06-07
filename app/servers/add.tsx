/**
 * Add Server screen - form to add a Kuma instance.
 * Phase 0: UI scaffolding with two auth methods. Logic comes in Phase 2.
 *
 * Form state is grouped in a useReducer to avoid 9 separate re-renders
 * (see react-doctor's `prefer-useReducer` rule).
 */

import { useReducer, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter , Stack } from 'expo-router';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { SafeScrollView } from '@/components/ui';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { t, tn } from '@/i18n';
import { useServers } from '@/data/store/servers';
import { createClient } from '@/data/api/client';
import { createSession } from '@/data/api/auth';

type AuthMethod = 'bearer' | 'password';

interface FormState {
  name: string;
  url: string;
  authMethod: AuthMethod;
  token: string;
  username: string;
  password: string;
}

type FormAction =
  | { type: 'setName'; value: string }
  | { type: 'setUrl'; value: string }
  | { type: 'setAuthMethod'; value: AuthMethod }
  | { type: 'setToken'; value: string }
  | { type: 'setUsername'; value: string }
  | { type: 'setPassword'; value: string }
  | { type: 'reset' };

const initialForm: FormState = {
  name: '',
  url: '',
  authMethod: 'bearer',
  token: '',
  username: '',
  password: '',
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'setName':      return { ...state, name: action.value };
    case 'setUrl':       return { ...state, url: action.value };
    case 'setAuthMethod':return { ...state, authMethod: action.value };
    case 'setToken':     return { ...state, token: action.value };
    case 'setUsername':  return { ...state, username: action.value };
    case 'setPassword':  return { ...state, password: action.value };
    case 'reset':        return initialForm;
  }
}

export default function AddServerScreen() {
  const router = useRouter();
  const addServer = useServers((s) => s.addServer);

  const [form, dispatch] = useReducer(formReducer, initialForm);
  const { name, url, authMethod, token, username, password } = form;

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    if (!url.trim()) {
      setError(t('servers.add.error.invalidUrl'));
      return;
    }
    setTesting(true);
    setError(null);
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

      <SafeScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: spacing[4],
          gap: spacing[4],
        }}
        keyboardShouldPersistTaps="handled">
        {/* Name */}
        <Field label={t('servers.add.name')}>
          <TextInput
            value={name}
            onChangeText={(v) => dispatch({ type: 'setName', value: v })}
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
            onChangeText={(v) => dispatch({ type: 'setUrl', value: v })}
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
                onPress={() => dispatch({ type: 'setAuthMethod', value: m })}
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
                onChangeText={(v) => dispatch({ type: 'setToken', value: v })}
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
                onChangeText={(v) => dispatch({ type: 'setUsername', value: v })}
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
                onChangeText={(v) => dispatch({ type: 'setPassword', value: v })}
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
      </SafeScrollView>
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
