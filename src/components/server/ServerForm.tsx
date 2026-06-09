/**
 * ServerForm — the shared form for both Add and Edit server flows.
 *
 * Why a shared component?
 * -----------------------
 * Adding a server and editing a server have nearly identical form
 * semantics: name, URL, username, password. The only differences are:
 *   - Initial values (blank vs. pre-filled from the existing server)
 *   - Whether the user *must* re-type a password (yes in add, no in edit)
 *   - Save action (create vs. update)
 *
 * We extract the form into this component so the two screens stay in
 * sync — any change to validation, layout, or copy is automatically
 * applied to both flows.
 *
 * The form is purely presentational + state-management. It receives a
 * single `onSubmit` callback that does the full work: probe (real
 * login round-trip), save, and dismiss. The form renders any error
 * the callback returns and only dismisses when the callback resolves
 * with `null`. It also receives an `onCancel` so we can wire a back
 * button that just dismisses the form.
 *
 * Auth: username + password only
 * ------------------------------
 * The form used to offer a "bearer" mode (paste a long-lived API
 * token) and a "password" mode (username + password). The bearer
 * mode was removed in v0.8+ because Kuma 2.x's socket.io auth
 * only accepts JWTs, not the API Keys that the Kuma dashboard's
 * "Settings → API Tokens" screen creates. The app logs in once
 * with username+password, gets a JWT, and stores it for future
 * reconnects — so the user only types the password once per install.
 *
 * In edit mode, the password is OPTIONAL. If the user leaves it
 * blank, the parent's `onSubmit` receives `undefined` for the
 * credentials and decides whether to skip the credential update
 * (we preserve the existing Keychain entry).
 *
 * Single CTA: "Login"
 * -------------------
 * v0.8+ replaced the old "Test connection" + "Save server" pair with
 * a single full-width "Login" button — the same look as the welcome
 * screen's CTA. Tapping it runs the full flow: validate, probe,
 * save, dismiss. The user shouldn't have to tap two buttons to add
 * a server, and they shouldn't have to think about the difference
 * between "test" and "save" — there's only one action.
 */

import { useEffect, useReducer } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import { z } from 'zod';
import { ChevronRight } from 'lucide-react-native';
import { SafeScrollView, Button } from '@/components/ui';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t } from '@/i18n';
import type { Server } from '@/domain/models';
import {
  deriveCredentials,
  type ServerFormValues,
  type ServerFormSubmit,
} from './ServerForm.helpers';

export type { ServerFormValues, ServerFormSubmit } from './ServerForm.types';
export { deriveCredentials } from './ServerForm.helpers';

export interface ServerFormProps {
  /** Pre-filled values for edit mode (all fields, including secrets,
   *  should be left empty by the parent — we never display secrets).
   *  Presence also flips the form into "edit" mode: password becomes
   *  optional, the button label can be overridden, and the submit
   *  callback can decide to skip the credential rotation. */
  initial?: Pick<Server, 'name' | 'url'>;
  /**
   * Single submit callback. The form validates the inputs first, then
   * calls this with the typed values + (optionally) new credentials.
   *
   * The callback is responsible for:
   *   1. Probing Kuma (real `login` round-trip) when the user is
   *      adding or rotating credentials.
   *   2. Persisting the server metadata + credentials.
   *   3. Dismissing the form on success (router.back / replace).
   *
   * Return a non-null error string to show the user what went wrong;
   * return `null` on success. The form never navigates by itself.
   */
  onSubmit: (submit: ServerFormSubmit) => Promise<string | null> | string | null;
  /** Cancel/back action (close the modal). */
  onCancel: () => void;
}

type FormState = ServerFormValues;

type FormAction =
  | { type: 'setName'; value: string }
  | { type: 'setUrl'; value: string }
  | { type: 'setUsername'; value: string }
  | { type: 'setPassword'; value: string }
  | { type: 'reset'; values: FormState };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'setName':       return { ...state, name: action.value };
    case 'setUrl':        return { ...state, url: action.value };
    case 'setUsername':   return { ...state, username: action.value };
    case 'setPassword':   return { ...state, password: action.value };
    case 'reset':         return action.values;
  }
}

const initialForm: FormState = {
  name: '',
  url: '',
  username: '',
  password: '',
};

/**
 * Zod schema for the form, parameterized by mode.
 *
 *   - add:   all four fields required. We don't store a server that
 *            can't be talked to.
 *   - edit:  name + URL required; username + password optional.
 *            The user can keep the existing credentials by leaving
 *            both blank.
 */
function makeSchema(mode: 'add' | 'edit') {
  const nameField = z.string().trim().min(1, 'name').max(50, 'name');
  const urlField = z
    .string()
    .trim()
    .min(1, 'url')
    .url('url')
    .refine((u) => /^https?:\/\//i.test(u), 'url');
  const userField =
    mode === 'add'
      ? z.string().trim().min(1, 'username')
      : z.string();
  const passField = mode === 'add' ? z.string().min(1, 'password') : z.string();
  return z.object({
    name: nameField,
    url: urlField,
    username: userField,
    password: passField,
  });
}

export function ServerForm({
  initial,
  onSubmit,
  onCancel,
}: ServerFormProps) {
  const { surface, brand, statusTints } = useAppTheme();
  const mode: 'add' | 'edit' = initial ? 'edit' : 'add';

  const startingValues: FormState = initial
    ? { ...initialForm, name: initial.name, url: initial.url }
    : initialForm;

  const [form, dispatch] = useReducer(formReducer, startingValues);
  const { name, url, username, password } = form;

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
        },
      });
    }
  }, [initial?.name, initial?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const [ui, dispatchUI] = useReducer(
    (s: { submitting: boolean; error: string | null }, a: { type: 'submit-start' } | { type: 'submit-done'; error: string | null }) => {
      switch (a.type) {
        case 'submit-start': return { submitting: true, error: null };
        case 'submit-done':  return { submitting: false, error: a.error };
      }
    },
    { submitting: false, error: null },
  );

  const handleSubmit = async () => {
    const parsed = makeSchema(mode).safeParse(form);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const key = `servers.add.error.${first.message === 'url' ? 'invalidUrl' : 'missingToken'}`;
      dispatchUI({ type: 'submit-done', error: t(key) });
      return;
    }
    dispatchUI({ type: 'submit-start' });
    try {
      const error = await onSubmit({
        values: form,
        credentials: deriveCredentials(form),
      });
      dispatchUI({ type: 'submit-done', error: error ?? null });
    } catch (e) {
      dispatchUI({
        type: 'submit-done',
        error: e instanceof Error ? e.message : String(e),
      });
    }
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

        {/* Auth: username + password (the only kind we support). */}
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
        <Field
          label={t('servers.add.password')}
          hint={
            mode === 'edit'
              ? t('servers.edit.secretsHint')
              : t('servers.add.passwordHint')
          }>
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

        {ui.error && (
          <View style={[styles.errorBox, { backgroundColor: statusTints.down.bg }]}>
            <Text style={[typography.callout, { color: colors.status.down }]}>
              {ui.error}
            </Text>
          </View>
        )}

        {/* Single Login CTA. Same look as the welcome screen's button. */}
        <View style={styles.cta}>
          <Button
            label={t('servers.add.login')}
            onPress={handleSubmit}
            disabled={ui.submitting}
            loading={ui.submitting}
            variant="primary"
            size="lg"
            fullWidth
            icon={<ChevronRight size={18} color="white" strokeWidth={2.5} />}
            iconPosition="right"
          />
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  input: {
    ...typography.body,
    borderWidth: 0.5,
    borderRadius: semanticRadius.button,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  errorBox: {
    padding: spacing[3],
    borderRadius: 12,
  },
  cta: {
    paddingTop: spacing[2],
  },
  cancelButton: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[4],
    zIndex: 10,
  },
});
