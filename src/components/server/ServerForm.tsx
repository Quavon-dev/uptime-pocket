/**
 * ServerForm — the shared form for both Add and Edit server flows.
 *
 * Why a shared component?
 * -----------------------
 * Adding a server and editing a server have nearly identical form
 * semantics: name, URL, auth method, token/username/password. The only
 * differences are:
 *   - Initial values (blank vs. pre-filled from the existing server)
 *   - Submit action (create vs. update)
 *   - Title + button labels
 *
 * We extract the form into this component so the two screens stay in
 * sync — any change to validation, layout, or auth-method UX is
 * automatically applied to both flows.
 *
 * The form is purely presentational + state-management. It receives
 * callbacks for `onSubmit` and `onTest` so the parent screen can
 * decide what to do on success (navigate back, refresh the connection,
 * etc.). It also receives an `onCancel` so we can wire a back button
 * that just dismisses the form.
 *
 * Auth-method UX
 * --------------
 * The auth method is a SegmentedControl with two options: "bearer" and
 * "password". The bearer option shows a single token field; the
 * password option shows username + password. We never show both at
 * once, which keeps the form short and obvious.
 *
 * In edit mode, we pre-fill the current auth kind but leave the
 * token/username/password fields blank. The user must re-enter the
 * secret to change it (a security measure — we never display the
 * existing secret). If the user submits without entering a new secret,
 * the parent's `onSubmit` receives `undefined` for the credentials
 * and can decide whether to skip the credential update.
 */

import { useEffect, useReducer } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { z } from 'zod';
import { SafeScrollView } from '@/components/ui';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t } from '@/i18n';
import type { Server } from '@/domain/models';
import {
  deriveCredentials,
  type ServerFormValues,
  type ServerFormSubmit,
} from './ServerForm.helpers';
import type { AuthMethod } from './ServerForm.types';

export type { ServerFormValues, ServerFormSubmit } from './ServerForm.types';
export { deriveCredentials } from './ServerForm.helpers';

export interface ServerFormProps {
  /** Pre-filled values for edit mode (all fields, including secrets,
   *  should be left empty by the parent — we never display secrets). */
  initial?: Pick<Server, 'name' | 'url' | 'authKind'>;
  /** Called with the merged values + (optionally) new credentials. */
  onSubmit: (submit: ServerFormSubmit) => Promise<void> | void;
  /** Called when the user taps "Test connection". Should not throw —
   *  the form renders the error itself. */
  onTest: (values: ServerFormValues) => Promise<string | null>;
  /** Cancel/back action (close the modal). */
  onCancel: () => void;
  /** Override the title and primary button label. */
  submitLabel?: string;
}

type FormState = ServerFormValues;

type FormAction =
  | { type: 'setName'; value: string }
  | { type: 'setUrl'; value: string }
  | { type: 'setAuthMethod'; value: AuthMethod }
  | { type: 'setToken'; value: string }
  | { type: 'setUsername'; value: string }
  | { type: 'setPassword'; value: string }
  | { type: 'reset'; values: FormState };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'setName':       return { ...state, name: action.value };
    case 'setUrl':        return { ...state, url: action.value };
    case 'setAuthMethod': return { ...state, authMethod: action.value };
    case 'setToken':      return { ...state, token: action.value };
    case 'setUsername':   return { ...state, username: action.value };
    case 'setPassword':   return { ...state, password: action.value };
    case 'reset':         return action.values;
  }
}

const initialForm: FormState = {
  name: '',
  url: '',
  authMethod: 'bearer',
  token: '',
  username: '',
  password: '',
};

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

export function ServerForm({
  initial,
  onSubmit,
  onTest,
  onCancel,
  submitLabel,
}: ServerFormProps) {
  const { surface, brand, statusTints } = useAppTheme();

  const startingValues: FormState = initial
    ? { ...initialForm, name: initial.name, url: initial.url, authMethod: initial.authKind }
    : initialForm;

  const [form, dispatch] = useReducer(formReducer, startingValues);
  const { name, url, authMethod, token, username, password } = form;

  // If the parent swaps `initial` (e.g. on remount with a different
  // server id), reset our local form to match.
  useEffect(() => {
    if (initial) {
      dispatch({
        type: 'reset',
        values: {
          ...initialForm,
          name: initial.name,
          url: initial.url,
          authMethod: initial.authKind,
        },
      });
    }
  }, [initial?.name, initial?.url, initial?.authKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const [testingState, dispatchUI] = useReducer(uiReducer, {
    testing: false,
    saving: false,
    error: null,
  });

  const handleTest = async () => {
    dispatchUI({ type: 'test-start' });
    try {
      const err = await onTest(form);
      dispatchUI({ type: 'test-done', error: err });
    } catch (e) {
      dispatchUI({
        type: 'test-done',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleSave = async () => {
    const parsed = FormSchema.safeParse(form);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const key = `servers.add.error.${first.message === 'url' ? 'invalidUrl' : 'missingToken'}`;
      dispatchUI({ type: 'set-error', error: t(key) });
      return;
    }
    dispatchUI({ type: 'save-start' });
    try {
      await onSubmit({ values: form, credentials: deriveCredentials(form) });
    } catch (e) {
      dispatchUI({
        type: 'save-done',
        error: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    dispatchUI({ type: 'save-done', error: null });
  };

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
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
            style={[
              styles.input,
              { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text },
            ]}
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
            style={[
              styles.input,
              { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text },
            ]}
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
                    { color: authMethod === m ? 'white' : surface.text },
                  ]}>
                  {m === 'bearer' ? t('servers.add.bearer') : t('servers.add.password')}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>

        {authMethod === 'bearer' ? (
          <Field label={t('servers.add.bearerToken')} hint={t('servers.add.bearerHint')}>
            <TextInput
              value={token}
              onChangeText={(v) => dispatch({ type: 'setToken', value: v })}
              placeholder="••••••••"
              placeholderTextColor={surface.textSubtle}
              style={[
                styles.input,
                { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </Field>
        ) : (
          <>
            <Field label={t('servers.add.username')}>
              <TextInput
                value={username}
                onChangeText={(v) => dispatch({ type: 'setUsername', value: v })}
                placeholder="admin"
                placeholderTextColor={surface.textSubtle}
                style={[
                  styles.input,
                  { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text },
                ]}
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
                style={[
                  styles.input,
                  { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text },
                ]}
                secureTextEntry
              />
            </Field>
          </>
        )}

        {testingState.error && (
          <View style={[styles.errorBox, { backgroundColor: statusTints.down.bg }]}>
            <Text style={[typography.callout, { color: colors.status.down }]}>
              {testingState.error}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Pressable
            onPress={handleTest}
            disabled={testingState.testing || testingState.saving}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { backgroundColor: surface.elevated, borderColor: brand, opacity: pressed || testingState.testing ? 0.85 : 1 },
            ]}>
            {testingState.testing ? (
              <ActivityIndicator size="small" color={brand} />
            ) : (
              <Text style={[typography.bodyEmphasized, { color: brand }]}>
                {t('servers.add.test')}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={testingState.saving || testingState.testing}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: brand, opacity: pressed || testingState.saving ? 0.85 : 1 },
            ]}>
            {testingState.saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={[typography.bodyEmphasized, { color: 'white' }]}>
                {submitLabel ?? t('servers.add.save')}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeScrollView>
      <Pressable
        onPress={onCancel}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        style={styles.cancelButton}>
        <Text style={[typography.body, { color: brand }]}>{t('common.cancel')}</Text>
      </Pressable>
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

// Local mini-reducer for the testing/saving/error UI state, since the
// form's main state is already in useReducer above.
type UIState = { testing: boolean; saving: boolean; error: string | null };
type UIAction =
  | { type: 'test-start' }
  | { type: 'test-done'; error: string | null }
  | { type: 'save-start' }
  | { type: 'save-done'; error: string | null }
  | { type: 'set-error'; error: string };
function uiReducer(s: UIState, a: UIAction): UIState {
  switch (a.type) {
    case 'test-start': return { ...s, testing: true, error: null };
    case 'test-done':  return { ...s, testing: false, error: a.error };
    case 'save-start': return { ...s, saving: true, error: null };
    case 'save-done':  return { ...s, saving: false, error: a.error };
    case 'set-error':  return { ...s, error: a.error };
  }
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
  cancelButton: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[4],
    zIndex: 10,
  },
});
