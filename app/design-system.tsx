/**
 * Design System / Storybook screen.
 *
 * Shows every component in the design system, in light + dark
 * variants, so the design language is visible and reviewable.
 *
 * This is a "phase showcase" — once we have real data flowing,
 * some of these will be replaced by actual app screens.
 *
 * The fixtures here are tiny inline examples used to demonstrate
 * the components in context. Real app data flows from the Kuma
 * connection manager.
 */

import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { StatusPill, HeartbeatPulse } from '@/components/status';
import {
  Button,
  Chip,
  SegmentedControl,
  Tag,
  EmptyState,
  ErrorState,
  Server,
  ServerOff,
  SafeScrollView,
} from '@/components/ui';
import { MonitorCard, MonitorRow } from '@/components/monitor';
import { ServerCard } from '@/components/server';
import { ResponseTimeChart, UptimeBar } from '@/components/chart';
import {
  generateResponseTimeData,
  generateUptimeData,
} from '@/lib/chart-fixtures';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import type { Monitor, Server as ServerModel, Tag as TagModel } from '@/domain/models';

type ThemeVariant = 'light' | 'dark';

// Tiny inline fixtures for the showcase only. Real data comes from Kuma.
const DEMO_TAGS: TagModel[] = [
  { id: 1, name: 'production', color: '#EF4444' },
  { id: 2, name: 'api', color: '#3B82F6' },
];

const DEMO_MONITOR_UP: Monitor = {
  id: 0,
  parent: null,
  type: 'http',
  name: 'API Production',
  url: 'https://api.example.com/health',
  status: 'up',
  active: true,
  interval: 60,
  retryInterval: 60,
  maxretries: 0,
  upsideDown: false,
  tags: DEMO_TAGS,
  notificationIDList: {},
  lastCheckAt: new Date(Date.now() - 30_000),
  responseTime: 124,
  uptime24h: 99.98,
  uptime7d: 99.95,
  uptime30d: 99.92,
};

const DEMO_MONITOR_DOWN: Monitor = {
  ...DEMO_MONITOR_UP,
  id: 1,
  name: 'Database Primary',
  type: 'ping',
  status: 'down',
  responseTime: undefined,
  uptime24h: 87.5,
  uptime7d: 92.1,
  uptime30d: 95.4,
  msg: 'Connection timed out',
};

const DEMO_MONITOR_MAINT: Monitor = {
  ...DEMO_MONITOR_UP,
  id: 2,
  name: 'Staging API',
  status: 'maintenance',
  responseTime: 156,
  tags: [{ id: 5, name: 'staging', color: '#F59E0B' }],
};

const DEMO_MONITOR_PENDING: Monitor = {
  ...DEMO_MONITOR_UP,
  id: 3,
  name: 'Redis',
  type: 'port',
  status: 'pending',
  responseTime: undefined,
};

const DEMO_MONITOR_PAUSED: Monitor = {
  ...DEMO_MONITOR_UP,
  id: 4,
  name: 'Old API v1 (deprecated)',
  status: 'paused',
  active: false,
  responseTime: undefined,
  tags: [{ id: 6, name: 'deprecated', color: '#6B7280' }],
};

const DEMO_MONITORS_FOR_ROWS: Monitor[] = [
  DEMO_MONITOR_DOWN,
  DEMO_MONITOR_MAINT,
  DEMO_MONITOR_PENDING,
  DEMO_MONITOR_PAUSED,
];

const DEMO_SERVER: ServerModel = {
  id: 'demo',
  name: 'Production Kuma',
  url: 'https://kuma.example.com',
  auth: { kind: 'bearer', token: 'demo' },
  kumaVersion: '2.4.0',
  connected: true,
  lastConnectedAt: new Date(),
  notificationMode: 'relay',
  createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
};

export default function DesignSystemScreen() {
  const [variant, setVariant] = useState<ThemeVariant>('light');
  const isDark = variant === 'dark';

  const themeColors = isDark ? colors.surface.dark : colors.surface.light;
  const chartData = generateResponseTimeData(40);
  const uptimeData = generateUptimeData(100);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar
        title="Design System"
        subtitle="v0.2.0"
        right={
          <Pressable
            onPress={() => setVariant(isDark ? 'light' : 'dark')}
            style={({ pressed }) => [
              styles.variantChip,
              { backgroundColor: isDark ? `${colors.brand[400]}1A` : `${colors.brand[500]}14`, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text style={[typography.captionEmphasized, { color: isDark ? colors.brand[400] : colors.brand[500] }]}>
              {isDark ? 'Dark' : 'Light'}
            </Text>
          </Pressable>
        }
      />

      <SafeScrollView
        contentContainerStyle={{
          padding: spacing[4],
          gap: spacing[6],
        }}
        showsVerticalScrollIndicator={false}>
        {/* ═══════════════ STATUS PILLS ═══════════════ */}
        <Section title="Status pills" themeColors={themeColors}>
          <Text style={[typography.caption, { color: themeColors.textMuted, marginBottom: spacing[2] }]}>
            Semantic colors. Never change.
          </Text>
          <View style={styles.row}>
            <StatusPill status="up" />
            <StatusPill status="down" />
            <StatusPill status="pending" />
            <StatusPill status="maintenance" />
            <StatusPill status="paused" />
          </View>
          <View style={[styles.row, { marginTop: spacing[2] }]}>
            <StatusPill status="up" size="sm" />
            <StatusPill status="up" size="lg" />
            <StatusPill status="up" showLabel={false} />
          </View>
        </Section>

        {/* ═══════════════ HEARTBEAT ═══════════════ */}
        <Section title="Heartbeat pulse" themeColors={themeColors}>
          <View style={[styles.row, { alignItems: 'center' }]}>
            <HeartbeatPulse color={colors.status.up} size={8} active />
            <Text style={[typography.body, { color: themeColors.text, marginLeft: spacing[3] }]}>
              Live monitor
            </Text>
          </View>
        </Section>

        {/* ═══════════════ BUTTONS ═══════════════ */}
        <Section title="Buttons" themeColors={themeColors}>
          <Button label="Primary action" onPress={() => {}} />
          <View style={{ height: spacing[2] }} />
          <Button label="Secondary" onPress={() => {}} variant="secondary" />
          <View style={{ height: spacing[2] }} />
          <Button label="Ghost" onPress={() => {}} variant="ghost" />
          <View style={{ height: spacing[2] }} />
          <Button label="Destructive" onPress={() => {}} variant="destructive" />
          <View style={{ height: spacing[3] }} />
          <View style={[styles.row, { gap: spacing[2] }]}>
            <Button label="Small" onPress={() => {}} size="sm" />
            <Button label="Medium" onPress={() => {}} size="md" />
            <Button label="Large" onPress={() => {}} size="lg" />
          </View>
        </Section>

        {/* ═══════════════ CHIPS ═══════════════ */}
        <Section title="Chips" themeColors={themeColors}>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Chip label="All" selected />
            <Chip label="Up" selected selectedColor={colors.status.up} />
            <Chip label="Down" selected selectedColor={colors.status.down} />
            <Chip label="Pending" />
            <Chip label="Maintenance" />
            <Chip label="Disabled" disabled />
          </View>
        </Section>

        {/* ═══════════════ SEGMENTED CONTROL ═══════════════ */}
        <Section title="Segmented control" themeColors={themeColors}>
          <SegmentedControlExample />
          <View style={{ height: spacing[3] }} />
          <SegmentedControlExample
            options={[
              { value: '24h', label: '24h' },
              { value: '7d', label: '7d' },
              { value: '30d', label: '30d' },
            ]}
            initial="24h"
            size="sm"
          />
        </Section>

        {/* ═══════════════ TAGS ═══════════════ */}
        <Section title="Tags" themeColors={themeColors}>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {DEMO_TAGS.map((tag) => (
              <Tag key={tag.id} tag={tag} />
            ))}
            <Tag tag={{ id: 99, name: 'no-dot', color: '#6B7280' }} showDot={false} />
          </View>
        </Section>

        {/* ═══════════════ GLASS SURFACES ═══════════════ */}
        <Section title="Glass surfaces" themeColors={themeColors}>
          <GlassSurface variant="thin" radius={semanticRadius.card} style={styles.glassCard}>
            <Text style={[typography.bodyEmphasized, { color: themeColors.text }]}>Thin glass</Text>
            <Text style={[typography.caption, { color: themeColors.textMuted, marginTop: 2 }]}>
              Backdrop blur
            </Text>
          </GlassSurface>
          <View style={{ height: spacing[2] }} />
          <GlassSurface variant="regular" radius={semanticRadius.card} style={styles.glassCard}>
            <Text style={[typography.bodyEmphasized, { color: themeColors.text }]}>Regular glass</Text>
            <Text style={[typography.caption, { color: themeColors.textMuted, marginTop: 2 }]}>
              iOS 26 Liquid Glass on supported devices
            </Text>
          </GlassSurface>
        </Section>

        {/* ═══════════════ MONITOR CARD ═══════════════ */}
        <Section title="Monitor card" themeColors={themeColors}>
          <MonitorCard monitor={DEMO_MONITOR_UP} />
        </Section>

        {/* ═══════════════ MONITOR ROWS ═══════════════ */}
        <Section title="Monitor rows" themeColors={themeColors}>
          <View style={{ gap: spacing[2] }}>
            {DEMO_MONITORS_FOR_ROWS.map((m) => (
              <MonitorRow key={m.id} monitor={m} />
            ))}
          </View>
        </Section>

        {/* ═══════════════ CHARTS ═══════════════ */}
        <Section title="Response time chart" themeColors={themeColors}>
          <View style={[styles.chartCard, { backgroundColor: themeColors.elevated, borderColor: themeColors.border }]}>
            <Text style={[typography.caption, { color: themeColors.textMuted, marginBottom: spacing[2] }]}>
              Last 40 minutes
            </Text>
            <ResponseTimeChart data={chartData} width={300} height={100} />
          </View>
        </Section>

        <Section title="Uptime bar" themeColors={themeColors}>
          <View style={[styles.chartCard, { backgroundColor: themeColors.elevated, borderColor: themeColors.border }]}>
            <UptimeBar data={uptimeData} />
          </View>
        </Section>

        {/* ═══════════════ SERVER CARD ═══════════════ */}
        <Section title="Server card" themeColors={themeColors}>
          <View style={{ gap: spacing[2] }}>
            <ServerCard server={DEMO_SERVER} isActive monitorCount={12} showChevron />
            <ServerCard
              server={{ ...DEMO_SERVER, connected: false, name: 'Staging Kuma' }}
              monitorCount={4}
              showChevron
            />
          </View>
        </Section>

        {/* ═══════════════ EMPTY + ERROR STATES ═══════════════ */}
        <Section title="Empty & error states" themeColors={themeColors}>
          <View style={[styles.chartCard, { backgroundColor: themeColors.elevated, borderColor: themeColors.border }]}>
            <EmptyState
              icon={Server}
              title="No monitors yet"
              body="Add a Kuma server to start monitoring your services."
            />
          </View>
          <View style={{ height: spacing[3] }} />
          <View style={[styles.chartCard, { backgroundColor: themeColors.elevated, borderColor: themeColors.border }]}>
            <ErrorState
              icon={ServerOff}
              title="Couldn't connect"
              body="We couldn't reach your Kuma server. Check the URL and your network."
              onRetry={() => {}}
            />
          </View>
        </Section>

        {/* ═══════════════ COLOR TOKENS ═══════════════ */}
        <Section title="Color tokens" themeColors={themeColors}>
          <Text style={[typography.caption, { color: themeColors.textMuted, marginBottom: spacing[2] }]}>
            Brand (parked — emerald) + semantic status colors
          </Text>
          <ColorRow label="brand.500" color={colors.brand[500]} hex="#10B981" />
          <ColorRow label="brand.600" color={colors.brand[600]} hex="#059669" />
          <ColorRow label="status.up" color={colors.status.up} hex="#10B981" />
          <ColorRow label="status.down" color={colors.status.down} hex="#EF4444" />
          <ColorRow label="status.pending" color={colors.status.pending} hex="#F59E0B" />
          <ColorRow label="status.maintenance" color={colors.status.maintenance} hex="#3B82F6" />
          <ColorRow label="status.paused" color={colors.status.paused} hex="#6B7280" />
        </Section>
      </SafeScrollView>
    </View>
  );
}

function Section({
  title,
  children,
  themeColors,
}: {
  title: string;
  children: React.ReactNode;
  themeColors: typeof colors.surface.light | typeof colors.surface.dark;
}) {
  return (
    <View style={{ gap: spacing[3] }}>
      <Text style={[typography.micro, { color: themeColors.textMuted, letterSpacing: 0.5 }]}>
        {title.toUpperCase()}
      </Text>
      <View>{children}</View>
    </View>
  );
}

function ColorRow({ label, color, hex }: { label: string; color: string; hex: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        paddingVertical: spacing[2],
      }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: color,
          borderWidth: 0.5,
          borderColor: 'rgba(0,0,0,0.05)',
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={[typography.captionEmphasized, { color: colors.surface.light.text }]}>
          {label}
        </Text>
        <Text style={[typography.mono, { color: colors.gray[500], fontSize: 11 }]}>{hex}</Text>
      </View>
    </View>
  );
}

function SegmentedControlExample({
  options = [
    { value: 'bearer', label: 'Bearer' },
    { value: 'password', label: 'Password' },
  ],
  initial,
  size = 'md' as 'md' | 'sm',
}: {
  options?: { value: string; label: string }[];
  initial?: string;
  size?: 'md' | 'sm';
}) {
  const [value, setValue] = useState(initial ?? options[0].value);
  return (
    <SegmentedControl options={options as any} value={value} onChange={setValue as any} size={size} />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  variantChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: semanticRadius.pill,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  glassCard: {
    padding: spacing[4],
    minHeight: 60,
    justifyContent: 'center',
  },
  chartCard: {
    padding: spacing[4],
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
  },
});
