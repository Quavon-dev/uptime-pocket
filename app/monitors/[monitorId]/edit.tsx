/**
 * Edit Monitor screen — load an existing Kuma monitor, let the user
 * change its fields, and persist via `manager.editMonitor()`.
 *
 * **Kuma 2.3.2 quirk:** `editMonitor` requires the FULL monitor bean
 * (all 113 fields) — partial edits are silently dropped. So instead
 * of building a fresh draft like Add, we:
 *   1. Fetch the monitor via `getMonitor(id)` → full bean
 *   2. Mirror its fields into form state
 *   3. On save, mutate the bean in place with the form values and
 *      send the whole thing back
 *
 * Also handles delete via a confirmation dialog (deleteConfirm).
 *
 * Theme: page bg = surface.background. Inputs use surface.elevated +
 * surface.border. Error box uses statusTints.down.
 */

import { useEffect, useReducer, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { SafeScrollView } from '@/components/ui';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';
import { useKumaActions } from '@/features/monitors/useKumaActions';
import { useServers } from '@/data/store/servers';
import type { KumaMonitorBean } from '@/data/api/monitors';

// Form state — mirrors the subset of the bean that the user can edit.
// Everything else lives in the `bean` reference and is sent back
// untouched on save.
interface FormState {
  name: string;
  url: string;
  hostname: string;
  port: string;
  method: string;
  interval: string;
  retryInterval: string;
  maxretries: string;
  upsideDown: boolean;
  active: boolean;
  description: string;
  ignoreTls: boolean;
  maxredirects: string;
  keyword: string;
}

type FormAction =
  | { type: 'set'; field: keyof FormState; value: string | boolean }
  | { type: 'init'; bean: KumaMonitorBean };

function formReducer(state: FormState, action: FormAction): FormState {
  if (action.type === 'init') {
    const b = action.bean;
    return {
      name: String(b.name ?? ''),
      url: String(b.url ?? ''),
      hostname: String(b.hostname ?? ''),
      port: b.port != null ? String(b.port) : '',
      method: String(b.method ?? 'GET'),
      interval: String(b.interval ?? 60),
      retryInterval: String(b.retryInterval ?? 60),
      maxretries: String(b.maxretries ?? 0),
      upsideDown: Boolean(b.upsideDown),
      active: Boolean(b.active),
      description: String(b.description ?? ''),
      ignoreTls: Boolean(b.ignoreTls),
      maxredirects: String(b.maxredirects ?? 10),
      keyword: String(b.keyword ?? ''),
    };
  }
  if (action.type === 'set') {
    return { ...state, [action.field]: action.value } as FormState;
  }
  return state;
}

const initialForm: FormState = {
  name: '',
  url: '',
  hostname: '',
  port: '',
  method: 'GET',
  interval: '60',
  retryInterval: '60',
  maxretries: '0',
  upsideDown: false,
  active: true,
  description: '',
  ignoreTls: false,
  maxredirects: '10',
  keyword: '',
};

export default function EditMonitorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ monitorId: string }>();
  const monitorId = Number(params.monitorId);
  const activeServer = useServers((s) =>
    s.servers.find((srv) => srv.id === s.activeServerId)
  );
  const { surface, brand, statusTints } = useAppTheme();

  const { getMonitor, editMonitor, deleteMonitor, isEditing, isDeleting, isFetching, error, clearError } =
    useKumaActions();

  const [bean, setBean] = useState<KumaMonitorBean | null>(null);
  const [form, dispatch] = useReducer(formReducer, initialForm);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load the monitor on mount.
  useEffect(() => {
    if (!Number.isFinite(monitorId)) {
      setLoadError('Invalid monitor id');
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await getMonitor(monitorId);
      if (cancelled) return;
      if (res.ok && res.monitor) {
        setBean(res.monitor);
        dispatch({ type: 'init', bean: res.monitor });
      } else {
        setLoadError(res.msg ?? 'Monitor not found');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorId]);

  const handleSave = async () => {
    setValidationError(null);
    clearError();
    if (!bean) return;

    if (!form.name.trim()) {
      setValidationError(t('monitorForm.validation.nameRequired'));
      return;
    }

    // Build the updated bean: copy the original, then overlay the
    // form values. Everything else (tags, notificationIDList, etc.)
    // is preserved exactly.
    const updated: KumaMonitorBean = {
      ...bean,
      name: form.name.trim(),
      url: form.url.trim() || undefined,
      hostname: form.hostname.trim() || undefined,
      port: form.port ? parseInt(form.port, 10) : undefined,
      method: form.method || 'GET',
      interval: parseInt(form.interval || '60', 10),
      retryInterval: parseInt(form.retryInterval || '60', 10),
      maxretries: parseInt(form.maxretries || '0', 10),
      upsideDown: form.upsideDown,
      active: form.active,
      description: form.description.trim() || undefined,
      ignoreTls: form.ignoreTls,
      maxredirects: parseInt(form.maxredirects || '10', 10),
      keyword: form.keyword || undefined,
    };

    const result = await editMonitor(updated);
    if (result.ok) {
      router.back();
    }
  };

  const handleDelete = () => {
    if (!bean) return;
    Alert.alert(
      t('monitorDetail.deleteConfirm.title'),
      tn('monitorDetail.deleteConfirm.body', {
        name: form.name,
        server: activeServer?.name ?? '',
      }),
      [
        { text: t('monitorForm.actions.cancel'), style: 'cancel' },
        {
          text: t('monitorForm.actions.delete'),
          style: 'destructive',
          onPress: async () => {
            const result = await deleteMonitor(monitorId);
            if (result.ok) {
              router.back();
            }
          },
        },
      ]
    );
  };

  // ---- Render guards ---------------------------------------------------

  if (isFetching && !bean) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: surface.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <GlassNavBar
          title={t('monitorForm.editTitle')}
          left={
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={[typography.body, { color: brand }]}>
                {t('monitorForm.actions.cancel')}
              </Text>
            </Pressable>
          }
        />
        <ActivityIndicator size="large" color={brand} />
      </View>
    );
  }

  if (loadError || !bean) {
    return (
      <View style={[styles.container, { backgroundColor: surface.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <GlassNavBar
          title={t('monitorForm.editTitle')}
          left={
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={[typography.body, { color: brand }]}>
                {t('monitorForm.actions.cancel')}
              </Text>
            </Pressable>
          }
        />
        <SafeScrollView contentContainerStyle={{ padding: spacing[4] }}>
          <View style={[styles.errorBox, { backgroundColor: statusTints.down.bg }]}>
            <Text style={[typography.callout, { color: colors.status.down }]}>
              {loadError ? tn('monitorForm.error.loadFailed', { msg: loadError }) : tn('monitorForm.error.loadFailed', { msg: 'unknown' })}
            </Text>
          </View>
        </SafeScrollView>
      </View>
    );
  }

  const isHttp = bean.type === 'http';
  const isKeyword = bean.type === 'keyword' || bean.type === 'grpc-keyword';
  const isPort = bean.type === 'port' || bean.type === 'smtp' || bean.type === 'snmp';
  const isPing = bean.type === 'ping' || bean.type === 'dns';

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar
        title={t('monitorForm.editTitle')}
        left={
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={[typography.body, { color: brand }]}>
              {t('monitorForm.actions.cancel')}
            </Text>
          </Pressable>
        }
        right={
          <Pressable onPress={handleDelete} hitSlop={10} disabled={isDeleting}>
            <Trash2 size={22} color={colors.status.down} strokeWidth={1.5} />
          </Pressable>
        }
      />

      <SafeScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing[4], gap: spacing[4] }}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.typeBadge, { backgroundColor: surface.sunken }]}>
          <Text style={[typography.captionEmphasized, { color: brand }]}>
            {String(bean.type).toUpperCase()}
          </Text>
          {isDeleting ? (
            <ActivityIndicator size="small" color={colors.status.down} />
          ) : null}
        </View>

        <Field label={t('monitorForm.fields.name')}>
          <TextInput
            value={form.name}
            onChangeText={(v) => dispatch({ type: 'set', field: 'name', value: v })}
            placeholder={t('monitorForm.fields.namePlaceholder')}
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>

        {(isHttp || isKeyword || bean.type === 'json-query' || bean.type === 'websocket') && (
          <Field label={t('monitorForm.fields.url')}>
            <TextInput
              value={form.url}
              onChangeText={(v) => dispatch({ type: 'set', field: 'url', value: v })}
              placeholder={t('monitorForm.fields.urlPlaceholder')}
              placeholderTextColor={surface.textSubtle}
              style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Field>
        )}

        {isKeyword && (
          <Field label={t('monitorForm.fields.keywordValue')}>
            <TextInput
              value={form.keyword}
              onChangeText={(v) => dispatch({ type: 'set', field: 'keyword', value: v })}
              placeholder="200"
              placeholderTextColor={surface.textSubtle}
              style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
        )}

        {(isPing || isPort) && (
          <Field label={t('monitorForm.fields.hostname')}>
            <TextInput
              value={form.hostname}
              onChangeText={(v) => dispatch({ type: 'set', field: 'hostname', value: v })}
              placeholder={t('monitorForm.fields.hostnamePlaceholder')}
              placeholderTextColor={surface.textSubtle}
              style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
        )}

        {isPort && (
          <Field label={t('monitorForm.fields.port')}>
            <TextInput
              value={form.port}
              onChangeText={(v) => dispatch({ type: 'set', field: 'port', value: v.replace(/[^0-9]/g, '') })}
              placeholder="22"
              placeholderTextColor={surface.textSubtle}
              style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
              keyboardType="number-pad"
            />
          </Field>
        )}

        <Field label={t('monitorForm.fields.interval')}>
          <TextInput
            value={form.interval}
            onChangeText={(v) => dispatch({ type: 'set', field: 'interval', value: v.replace(/[^0-9]/g, '') })}
            placeholder="60"
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
            keyboardType="number-pad"
          />
        </Field>

        <Field label={t('monitorForm.fields.retryInterval')}>
          <TextInput
            value={form.retryInterval}
            onChangeText={(v) => dispatch({ type: 'set', field: 'retryInterval', value: v.replace(/[^0-9]/g, '') })}
            placeholder="60"
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
            keyboardType="number-pad"
          />
        </Field>

        <Field label={t('monitorForm.fields.maxretries')}>
          <TextInput
            value={form.maxretries}
            onChangeText={(v) => dispatch({ type: 'set', field: 'maxretries', value: v.replace(/[^0-9]/g, '') })}
            placeholder="0"
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
            keyboardType="number-pad"
          />
        </Field>

        {isHttp && (
          <>
            <Field label={t('monitorForm.fields.method')}>
              <View style={[styles.segmented, { backgroundColor: surface.sunken }]}>
                {(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => dispatch({ type: 'set', field: 'method', value: m })}
                    style={[styles.segment, form.method === m && { backgroundColor: brand }]}>
                    <Text
                      style={[
                        typography.captionEmphasized,
                        { color: form.method === m ? 'white' : surface.text },
                      ]}>
                      {m}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            <Field label={t('monitorForm.fields.maxredirects')}>
              <TextInput
                value={form.maxredirects}
                onChangeText={(v) => dispatch({ type: 'set', field: 'maxredirects', value: v.replace(/[^0-9]/g, '') })}
                placeholder="10"
                placeholderTextColor={surface.textSubtle}
                style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
                keyboardType="number-pad"
              />
            </Field>
          </>
        )}

        <Field label={t('monitorForm.fields.description')}>
          <TextInput
            value={form.description}
            onChangeText={(v) => dispatch({ type: 'set', field: 'description', value: v })}
            placeholder=""
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { minHeight: 60, backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
            multiline
          />
        </Field>

        <Field label="">
          <ToggleRow
            label={t('monitorForm.fields.active')}
            value={form.active}
            onChange={(v) => dispatch({ type: 'set', field: 'active', value: v })}
          />
          <ToggleRow
            label={t('monitorForm.fields.upsideDown')}
            value={form.upsideDown}
            onChange={(v) => dispatch({ type: 'set', field: 'upsideDown', value: v })}
          />
          {isHttp && (
            <ToggleRow
              label={t('monitorForm.fields.ignoreTls')}
              value={form.ignoreTls}
              onChange={(v) => dispatch({ type: 'set', field: 'ignoreTls', value: v })}
            />
          )}
        </Field>

        {(validationError || error) && (
          <View style={[styles.errorBox, { backgroundColor: statusTints.down.bg }]}>
            <Text style={[typography.callout, { color: colors.status.down }]}>
              {validationError || error}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Pressable
            onPress={() => router.back()}
            disabled={isEditing || isDeleting}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { backgroundColor: surface.elevated, borderColor: brand, opacity: pressed || isEditing || isDeleting ? 0.85 : 1 },
            ]}>
            <Text style={[typography.bodyEmphasized, { color: brand }]}>
              {t('monitorForm.actions.cancel')}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={isEditing || isDeleting}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: brand, opacity: pressed || isEditing || isDeleting ? 0.85 : 1 },
            ]}>
            {isEditing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={[typography.bodyEmphasized, { color: 'white' }]}>
                {t('monitorForm.actions.save')}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeScrollView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { surface } = useAppTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      {label ? (
        <Text style={[typography.captionEmphasized, { color: surface.textMuted }]}>
          {label}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { surface, brand, isDark } = useAppTheme();
  return (
    <View
      style={[
        styles.toggleRow,
        { backgroundColor: surface.elevated, borderColor: surface.border },
      ]}>
      <Text style={[typography.body, { color: surface.text, flex: 1 }]}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: isDark ? colors.gray[700] : colors.gray[300], true: brand }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1 },
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: semanticRadius.button,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 8,
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
