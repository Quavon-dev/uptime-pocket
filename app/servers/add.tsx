/**
 * Add Server screen - form to add a Kuma instance.
 * Phase 0: UI scaffolding with two auth methods. Logic comes in Phase 2.
 *
 * Form state is grouped in a useReducer to avoid 9 separate re-renders
 * (see react-doctor's `prefer-useReducer` rule).
 *
 * Theme: page bg = surface.background. Inputs use surface.elevated +
 * surface.border. The segmented auth method uses surface.sunken
 * track + brand active. The error box uses statusTints.down.
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
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';
import { useServers } from '@/data/store/servers';
import { useSettings } from '@/data/store/settings';
import { createClient } from '@/data/api/client';
import { BearerSession, PasswordSession } from '@/data/api/auth';
import { z } from 'zod';

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

/** Zod schema for form-level validation (used by handleSave). */
const FormSchema = z
  .object({
    name: z.string().trim().min(1, 'name').max(50, 'name'),
    url: z
      .string()
      .trim()
      .min(1, 'url')
      .url('url')
      .refine((u) => /^https?:\/\//i.test(u), 'url'),
    authMethod: z.enum(['bearer', 'password']),
    token: z.string(),
    username: z.string(),
    password: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.authMethod === 'bearer' && data.token.trim().length === 0) {
      ctx.addIssue({ code: 'custom', path: ['token'], message: 'token' });
    }
    if (data.authMethod === 'password') {
      if (data.username.trim().length === 0) {
        ctx.addIssue({ code: 'custom', path: ['username'], message: 'username' });
      }
      if (data.password.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'password' });
      }
    }
  });

export default function AddServerScreen() {
  const router = useRouter();
  const { surface, brand, statusTints } = useAppTheme();
  const addServer = useServers((s) => s.addServer);
  const setOnboarded = useSettings((s) => s.setOnboarded);

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
      // Build a transient session for the ping probe. The Test button
      // only checks connectivity (no auth actually fires), so the
      // password session gets a dummy loginFn it will never use.
      const throwawayLogin: () => Promise<string> = () =>
        Promise.reject(new Error('Test connection never refreshes auth'));
      const session =
        authMethod === 'bearer'
          ? new BearerSession(token || 'placeholder')
          : new PasswordSession(username, password, '', throwawayLogin);
      const server = {
        id: 'temp',
        name: name || 'Test',
        url,
        authKind: authMethod,
        connected: false,
        notificationMode: 'direct' as const,
        createdAt: new Date(),
      };
      const client = createClient(server, session);
      const result = await client.ping();
      if (!result.connected) {
        // Surface the actual reason — much more useful than
        // "Couldn't reach the server" (which could mean ATS block,
        // DNS, 404, timeout, or wrong Kuma version).
        const detail = result.error ?? t('servers.add.error.unreachable');
        setError(detail);
        return;
      }
      const minVersion = '2.0.0';
      if (result.version && thisIsOlder(result.version, minVersion)) {
        setError(tn('servers.add.error.outdatedKuma', { version: result.version }));
      } else {
        setError(null);
        // Success! Could navigate back or auto-save
      }
    } catch (err) {
      // This catch is now reachable for unexpected errors thrown
      // by the ping itself (rare — ping() catches its own errors).
      // Surface the message so the user isn't left guessing.
      const message = err instanceof Error ? err.message : String(err);
      setError(message || t('servers.add.error.unreachable'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    const parsed = FormSchema.safeParse({ name, url, authMethod, token, username, password });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const key = `servers.add.error.${first.message === 'url' ? 'invalidUrl' : 'missingToken'}`;
      setError(t(key));
      return;
    }
    setSaving(true);
    const trimmedUrl = url.trim().replace(/\/+$/, '');
    let detectedVersion: string | null = null;
    try {
      // Optionally probe the version so we can show the outdated-Kuma
      // warning on the server detail screen later. The /api/status
      // endpoint doesn't require auth on Kuma 2.0+, so a placeholder
      // bearer session is enough.
      const probeSession = new BearerSession(token || 'probe');
      const probeServer = {
        id: 'probe',
        name: name,
        url: trimmedUrl,
        authKind: 'bearer' as const,
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
    try {
      const id = `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const auth =
        authMethod === 'bearer'
          ? ({ kind: 'bearer' as const, token: token.trim() })
          : ({ kind: 'password' as const, username: username.trim(), password });
      await addServer(
        {
          id,
          name: name.trim(),
          url: trimmedUrl,
          authKind: auth.kind,
          kumaVersion: detectedVersion ?? undefined,
          connected: false,
          notificationMode: 'direct',
          createdAt: new Date(),
        },
        auth
      );
      // Mark onboarding complete if not already, so the welcome gate
      // doesn't re-route us back here on next launch.
      setOnboarded(true);
      router.back();
    } catch {
      setError(t('servers.add.error.unreachable'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar
        title={t('servers.add.title')}
        left={
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={[typography.body, { color: brand }]}>
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
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
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
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>

        {/* Auth method */}
        <Field label={t('servers.add.authMethod')}>
          <View style={[styles.segmented, { backgroundColor: surface.sunken }]}>
            {(['bearer', 'password'] as AuthMethod[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => dispatch({ type: 'setAuthMethod', value: m })}
                style={[
                  styles.segment,
                  authMethod === m && { backgroundColor: brand },
                ]}>
                <Text
                  style={[
                    typography.captionEmphasized,
                    {
                      color: authMethod === m ? 'white' : surface.text,
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
                placeholderTextColor={surface.textSubtle}
                style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
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
                placeholderTextColor={surface.textSubtle}
                style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Field>
            <Field label={t('servers.add.password')}>
              <TextInput
                value={password}
                onChangeText={(v) => dispatch({ type: 'setPassword', value: v })}
                placeholder="••••••••"
                placeholderTextColor={surface.textSubtle}
                style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
                secureTextEntry
              />
            </Field>
          </>
        )}

        {error && (
          <View style={[styles.errorBox, { backgroundColor: statusTints.down.bg }]}>
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
              { backgroundColor: surface.elevated, borderColor: brand, opacity: pressed || testing ? 0.85 : 1 },
            ]}>
            {testing ? (
              <ActivityIndicator size="small" color={brand} />
            ) : (
              <Text style={[typography.bodyEmphasized, { color: brand }]}>
                {t('servers.add.test')}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={saving || testing}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: brand, opacity: pressed || saving ? 0.85 : 1 },
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
  const { surface } = useAppTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <Text style={[typography.captionEmphasized, { color: surface.textMuted }]}>
        {label}
      </Text>
      {children}
      {hint && (
        <Text style={[typography.caption, { color: surface.textSubtle }]}>
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
  container: { flex: 1 },
  input: {
    ...typography.body,
    borderWidth: 0.5,
    borderRadius: semanticRadius.button,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  segmented: {
    flexDirection: 'row',
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
  errorBox: {
    padding: spacing[3],
    borderRadius: 12,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: semanticRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: semanticRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
  },
});
