/**
 * Add Monitor screen — form to create a new Kuma monitor.
 *
 * Supports the most common monitor types. The form is type-aware:
 * HTTP monitors show URL + method, ping/port show hostname+port,
 * keyword shows URL + keyword body, etc.
 *
 * On save:
 *   1. Validate with Zod (per type)
 *   2. Sanitize the draft (strips Kuma 2.3.2 SQL-bug fields)
 *   3. Call `manager.addMonitor(activeServerId, draft)`
 *   4. On success: navigate back to the monitor list
 *
 * The next `monitorList` event from the socket will include the new
 * monitor — no need to manually refresh.
 *
 * Theme: page bg = surface.background. Inputs use surface.elevated +
 * surface.border. The segmented controls use surface.sunken tracks.
 */

import { useReducer, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Switch,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { SafeScrollView } from '@/components/ui';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t } from '@/i18n';
import { useKumaActions } from '@/features/monitors/useKumaActions';
import { useServers } from '@/data/store/servers';
import type { MonitorType } from '@/domain/models';
import type { MonitorDraft } from '@/data/api/monitors';

type FormState = {
  name: string;
  type: MonitorType;
  url: string;
  hostname: string;
  port: string;
  method: 'GET' | 'POST' | 'HEAD' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';
  interval: string;
  retryInterval: string;
  maxretries: string;
  upsideDown: boolean;
  active: boolean;
  description: string;
  ignoreTls: boolean;
  maxredirects: string;
  keywordValue: string;
  dnsRecordType: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV';
  dnsResolverServer: string;
};

type FormAction =
  | { type: 'setName'; value: string }
  | { type: 'setMonitorType'; value: MonitorType }
  | { type: 'setUrl'; value: string }
  | { type: 'setHostname'; value: string }
  | { type: 'setPort'; value: string }
  | { type: 'setMethod'; value: FormState['method'] }
  | { type: 'setInterval'; value: string }
  | { type: 'setRetryInterval'; value: string }
  | { type: 'setMaxretries'; value: string }
  | { type: 'setUpsideDown'; value: boolean }
  | { type: 'setActive'; value: boolean }
  | { type: 'setDescription'; value: string }
  | { type: 'setIgnoreTls'; value: boolean }
  | { type: 'setMaxredirects'; value: string }
  | { type: 'setKeywordValue'; value: string }
  | { type: 'setDnsRecordType'; value: FormState['dnsRecordType'] }
  | { type: 'setDnsResolverServer'; value: string }
  | { type: 'reset' };

const initialForm: FormState = {
  name: '',
  type: 'http',
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
  keywordValue: '',
  dnsRecordType: 'A',
  dnsResolverServer: '1.1.1.1',
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'setName': return { ...state, name: action.value };
    case 'setMonitorType': return { ...state, type: action.value };
    case 'setUrl': return { ...state, url: action.value };
    case 'setHostname': return { ...state, hostname: action.value };
    case 'setPort': return { ...state, port: action.value };
    case 'setMethod': return { ...state, method: action.value };
    case 'setInterval': return { ...state, interval: action.value };
    case 'setRetryInterval': return { ...state, retryInterval: action.value };
    case 'setMaxretries': return { ...state, maxretries: action.value };
    case 'setUpsideDown': return { ...state, upsideDown: action.value };
    case 'setActive': return { ...state, active: action.value };
    case 'setDescription': return { ...state, description: action.value };
    case 'setIgnoreTls': return { ...state, ignoreTls: action.value };
    case 'setMaxredirects': return { ...state, maxredirects: action.value };
    case 'setKeywordValue': return { ...state, keywordValue: action.value };
    case 'setDnsRecordType': return { ...state, dnsRecordType: action.value };
    case 'setDnsResolverServer': return { ...state, dnsResolverServer: action.value };
    case 'reset': return initialForm;
  }
}

/** Types that need a URL field. */
const TYPES_WITH_URL: MonitorType[] = [
  'http',
  'keyword',
  'json-query',
  'grpc-keyword',
  'websocket',
];

/** Types that need hostname + port. */
const TYPES_WITH_HOST_PORT: MonitorType[] = ['ping', 'port', 'dns', 'smtp', 'snmp'];

/** Types that need a keyword body to check. */
const TYPES_WITH_KEYWORD: MonitorType[] = ['keyword', 'grpc-keyword'];

export default function AddMonitorScreen() {
  const router = useRouter();
  const { addMonitor, isAdding, error, clearError } = useKumaActions();
  const activeServerId = useServers((s) => s.activeServerId);
  const { surface, brand, statusTints } = useAppTheme();

  const [form, dispatch] = useReducer(formReducer, initialForm);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSave = async () => {
    setValidationError(null);
    clearError();

    // Build the draft + run type-specific validation.
    const draft = buildDraft(form);
    const validation = validateDraft(form);
    if (validation) {
      setValidationError(validation);
      return;
    }

    if (!activeServerId) {
      setValidationError(t('monitorForm.error.notConnected'));
      return;
    }

    const result = await addMonitor(draft);
    if (result.ok) {
      router.back();
    }
    // error state is set by the hook on failure
  };

  const showUrl = TYPES_WITH_URL.includes(form.type);
  const showHostPort = TYPES_WITH_HOST_PORT.includes(form.type);
  const showKeyword = TYPES_WITH_KEYWORD.includes(form.type);
  const showDnsOptions = form.type === 'dns';

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar
        title={t('monitorForm.addTitle')}
        left={
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={[typography.body, { color: brand }]}>
              {t('monitorForm.actions.cancel')}
            </Text>
          </Pressable>
        }
      />

      <SafeScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing[4], gap: spacing[4] }}
        keyboardShouldPersistTaps="handled">
        {/* Type selector */}
        <Field label={t('monitorForm.fields.type')}>
          <View style={[styles.segmented, { backgroundColor: surface.sunken }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {(['http', 'ping', 'port', 'dns', 'keyword', 'tcp'] as MonitorType[]).map((ty) => (
                <Pressable
                  key={ty}
                  onPress={() => dispatch({ type: 'setMonitorType', value: ty as MonitorType })}
                  style={[
                    styles.segment,
                    form.type === ty && { backgroundColor: brand },
                  ]}>
                  <Text
                    style={[
                      typography.captionEmphasized,
                      {
                        color: form.type === ty ? 'white' : surface.text,
                      },
                    ]}>
                    {t(`monitorForm.types.${ty}` as any)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Field>

        {/* Name */}
        <Field label={t('monitorForm.fields.name')}>
          <TextInput
            value={form.name}
            onChangeText={(v) => dispatch({ type: 'setName', value: v })}
            placeholder={t('monitorForm.fields.namePlaceholder')}
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>

        {/* URL (for HTTP/keyword/etc) */}
        {showUrl && (
          <Field label={t('monitorForm.fields.url')}>
            <TextInput
              value={form.url}
              onChangeText={(v) => dispatch({ type: 'setUrl', value: v })}
              placeholder={t('monitorForm.fields.urlPlaceholder')}
              placeholderTextColor={surface.textSubtle}
              style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Field>
        )}

        {/* Method (for HTTP) */}
        {form.type === 'http' && (
          <Field label={t('monitorForm.fields.method')}>
            <View style={[styles.segmented, { backgroundColor: surface.sunken }]}>
              {(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => dispatch({ type: 'setMethod', value: m })}
                  style={[
                    styles.segment,
                    form.method === m && { backgroundColor: brand },
                  ]}>
                  <Text
                    style={[
                      typography.captionEmphasized,
                      {
                        color: form.method === m ? 'white' : surface.text,
                      },
                    ]}>
                    {m}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>
        )}

        {/* Hostname + Port (for ping/port/dns) */}
        {showHostPort && (
          <>
            <Field label={t('monitorForm.fields.hostname')}>
              <TextInput
                value={form.hostname}
                onChangeText={(v) => dispatch({ type: 'setHostname', value: v })}
                placeholder={t('monitorForm.fields.hostnamePlaceholder')}
                placeholderTextColor={surface.textSubtle}
                style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Field>
            {form.type === 'port' && (
              <Field label={t('monitorForm.fields.port')}>
                <TextInput
                  value={form.port}
                  onChangeText={(v) => dispatch({ type: 'setPort', value: v.replace(/[^0-9]/g, '') })}
                  placeholder="22"
                  placeholderTextColor={surface.textSubtle}
                  style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
                  keyboardType="number-pad"
                />
              </Field>
            )}
          </>
        )}

        {/* Keyword body (for keyword/grpc-keyword) */}
        {showKeyword && (
          <Field label={t('monitorForm.fields.keywordValue')}>
            <TextInput
              value={form.keywordValue}
              onChangeText={(v) => dispatch({ type: 'setKeywordValue', value: v })}
              placeholder="200"
              placeholderTextColor={surface.textSubtle}
              style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
        )}

        {/* DNS options */}
        {showDnsOptions && (
          <>
            <Field label="Record type">
              <View style={[styles.segmented, { backgroundColor: surface.sunken }]}>
                {(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'] as const).map((rt) => (
                  <Pressable
                    key={rt}
                    onPress={() => dispatch({ type: 'setDnsRecordType', value: rt })}
                    style={[
                      styles.segment,
                      form.dnsRecordType === rt && { backgroundColor: brand },
                    ]}>
                    <Text
                      style={[
                        typography.captionEmphasized,
                        {
                          color: form.dnsRecordType === rt ? 'white' : surface.text,
                        },
                      ]}>
                      {rt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>
            <Field label="Resolver">
              <TextInput
                value={form.dnsResolverServer}
                onChangeText={(v) => dispatch({ type: 'setDnsResolverServer', value: v })}
                placeholder="1.1.1.1"
                placeholderTextColor={surface.textSubtle}
                style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Field>
          </>
        )}

        {/* Interval */}
        <Field label={t('monitorForm.fields.interval')}>
          <TextInput
            value={form.interval}
            onChangeText={(v) => dispatch({ type: 'setInterval', value: v.replace(/[^0-9]/g, '') })}
            placeholder="60"
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
            keyboardType="number-pad"
          />
        </Field>

        {/* Retry interval */}
        <Field label={t('monitorForm.fields.retryInterval')}>
          <TextInput
            value={form.retryInterval}
            onChangeText={(v) => dispatch({ type: 'setRetryInterval', value: v.replace(/[^0-9]/g, '') })}
            placeholder="60"
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
            keyboardType="number-pad"
          />
        </Field>

        {/* Max retries */}
        <Field label={t('monitorForm.fields.maxretries')}>
          <TextInput
            value={form.maxretries}
            onChangeText={(v) => dispatch({ type: 'setMaxretries', value: v.replace(/[^0-9]/g, '') })}
            placeholder="0"
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
            keyboardType="number-pad"
          />
        </Field>

        {/* Max redirects (HTTP only) */}
        {form.type === 'http' && (
          <Field label={t('monitorForm.fields.maxredirects')}>
            <TextInput
              value={form.maxredirects}
              onChangeText={(v) => dispatch({ type: 'setMaxredirects', value: v.replace(/[^0-9]/g, '') })}
              placeholder="10"
              placeholderTextColor={surface.textSubtle}
              style={[styles.input, { backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
              keyboardType="number-pad"
            />
          </Field>
        )}

        {/* Description */}
        <Field label={t('monitorForm.fields.description')}>
          <TextInput
            value={form.description}
            onChangeText={(v) => dispatch({ type: 'setDescription', value: v })}
            placeholder=""
            placeholderTextColor={surface.textSubtle}
            style={[styles.input, { minHeight: 60, backgroundColor: surface.elevated, borderColor: surface.border, color: surface.text }]}
            multiline
          />
        </Field>

        {/* Toggles */}
        <Field label="">
          <ToggleRow
            label={t('monitorForm.fields.active')}
            value={form.active}
            onChange={(v) => dispatch({ type: 'setActive', value: v })}
          />
          <ToggleRow
            label={t('monitorForm.fields.upsideDown')}
            value={form.upsideDown}
            onChange={(v) => dispatch({ type: 'setUpsideDown', value: v })}
          />
          {form.type === 'http' && (
            <ToggleRow
              label={t('monitorForm.fields.ignoreTls')}
              value={form.ignoreTls}
              onChange={(v) => dispatch({ type: 'setIgnoreTls', value: v })}
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
            disabled={isAdding}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { backgroundColor: surface.elevated, borderColor: brand, opacity: pressed || isAdding ? 0.85 : 1 },
            ]}>
            <Text style={[typography.bodyEmphasized, { color: brand }]}>
              {t('monitorForm.actions.cancel')}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={isAdding}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: brand, opacity: pressed || isAdding ? 0.85 : 1 },
            ]}>
            {isAdding ? (
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

// ---- Sub-components ----------------------------------------------------

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

// ---- Pure helpers ------------------------------------------------------

function buildDraft(form: FormState): MonitorDraft {
  const interval = parseInt(form.interval || '60', 10);
  const retryInterval = parseInt(form.retryInterval || '60', 10);
  const maxretries = parseInt(form.maxretries || '0', 10);
  const maxredirects = parseInt(form.maxredirects || '10', 10);
  const port = form.port ? parseInt(form.port, 10) : undefined;

  // Kuma 2.3.2 server-side validator crashes with
  // "Cannot read properties of undefined (reading 'every')" for
  // non-HTTP monitor types if `accepted_statuscodes` is missing.
  // We always include it; for non-HTTP types it's a harmless no-op.
  const base: MonitorDraft = {
    name: form.name.trim(),
    type: form.type,
    interval,
    retryInterval,
    maxretries,
    upsideDown: form.upsideDown,
    active: form.active,
    description: form.description.trim() || undefined,
    accepted_statuscodes: ['200-299'],
    // Don't set tags: [] — Kuma 2.3.2 SQL bug
    // Don't set follow_redirect* — Kuma 2.3.2 SQL bug
  };

  switch (form.type) {
    case 'http':
      return {
        ...base,
        url: form.url.trim(),
        method: form.method,
        httpBodyEncoding: 'json',
        ignoreTls: form.ignoreTls,
        maxredirects,
      };
    case 'keyword':
    case 'grpc-keyword':
      return {
        ...base,
        url: form.url.trim(),
        keyword: form.keywordValue,
        httpBodyEncoding: 'json',
      };
    case 'json-query':
      return {
        ...base,
        url: form.url.trim(),
        method: form.method,
        httpBodyEncoding: 'json',
      };
    case 'websocket':
      return {
        ...base,
        url: form.url.trim(),
      };
    case 'ping':
      return {
        ...base,
        hostname: form.hostname.trim(),
      };
    case 'port':
      return {
        ...base,
        hostname: form.hostname.trim(),
        port,
      };
    case 'dns':
      return {
        ...base,
        hostname: form.hostname.trim(),
        dns_resolve_type: form.dnsRecordType,
        dns_resolve_server: form.dnsResolverServer.trim() || '1.1.1.1',
      };
    case 'smtp':
      return {
        ...base,
        hostname: form.hostname.trim(),
        port: port ?? 25,
      };
    case 'snmp':
      return {
        ...base,
        hostname: form.hostname.trim(),
        port: port ?? 161,
      };
    default:
      return base;
  }
}

function validateDraft(form: FormState): string | null {
  const name = form.name.trim();
  if (!name) return t('monitorForm.validation.nameRequired');

  const interval = parseInt(form.interval || '0', 10);
  if (interval < 20) return t('monitorForm.validation.intervalMin');

  switch (form.type) {
    case 'http':
    case 'json-query':
    case 'websocket':
      if (!form.url.trim()) return t('monitorForm.validation.urlRequired');
      break;
    case 'keyword':
    case 'grpc-keyword':
      if (!form.url.trim()) return t('monitorForm.validation.urlRequired');
      if (!form.keywordValue.trim()) return 'Keyword value is required';
      break;
    case 'ping':
      if (!form.hostname.trim()) return t('monitorForm.validation.hostnameRequired');
      break;
    case 'port':
    case 'smtp':
    case 'snmp':
      if (!form.hostname.trim()) return t('monitorForm.validation.hostnameRequired');
      if (!form.port.trim()) return t('monitorForm.validation.portRequired');
      const port = parseInt(form.port, 10);
      if (port < 1 || port > 65535) return t('monitorForm.validation.portInvalid');
      break;
    case 'dns':
      if (!form.hostname.trim()) return t('monitorForm.validation.hostnameRequired');
      break;
  }
  return null;
}

// ---- Styles ------------------------------------------------------------

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
    paddingHorizontal: spacing[3],
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
