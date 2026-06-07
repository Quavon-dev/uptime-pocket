/**
 * Sample data for design system previews and development.
 *
 * When we have no real Kuma connection, the app can use this to
 * show off the components in context.
 */

import type { Monitor, TimePoint, UptimePoint, Server } from '@/domain/models';

export const SAMPLE_MONITORS: Monitor[] = [
  {
    id: 1,
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
    tags: [
      { id: 1, name: 'production', color: '#EF4444' },
      { id: 2, name: 'api', color: '#3B82F6' },
    ],
    notificationIDList: {},
    lastCheckAt: new Date(Date.now() - 30_000),
    responseTime: 124,
    uptime24h: 99.98,
    uptime7d: 99.95,
    uptime30d: 99.92,
  },
  {
    id: 2,
    parent: null,
    type: 'http',
    name: 'Web Frontend',
    url: 'https://www.example.com',
    status: 'up',
    active: true,
    interval: 60,
    retryInterval: 60,
    maxretries: 0,
    upsideDown: false,
    tags: [
      { id: 1, name: 'production', color: '#EF4444' },
      { id: 3, name: 'web', color: '#10B981' },
    ],
    notificationIDList: {},
    lastCheckAt: new Date(Date.now() - 45_000),
    responseTime: 89,
    uptime24h: 100,
    uptime7d: 99.99,
    uptime30d: 99.97,
  },
  {
    id: 3,
    parent: null,
    type: 'ping',
    name: 'Database Primary',
    hostname: 'db.internal.example.com',
    status: 'down',
    active: true,
    interval: 30,
    retryInterval: 30,
    maxretries: 3,
    upsideDown: false,
    tags: [
      { id: 4, name: 'infrastructure', color: '#8B5CF6' },
    ],
    notificationIDList: {},
    lastCheckAt: new Date(Date.now() - 2 * 60_000),
    responseTime: undefined,
    uptime24h: 87.5,
    uptime7d: 92.1,
    uptime30d: 95.4,
    msg: 'Connection timed out',
  },
  {
    id: 4,
    parent: null,
    type: 'port',
    name: 'Redis',
    hostname: 'redis.internal.example.com',
    port: 6379,
    status: 'pending',
    active: true,
    interval: 60,
    retryInterval: 60,
    maxretries: 0,
    upsideDown: false,
    tags: [
      { id: 4, name: 'infrastructure', color: '#8B5CF6' },
    ],
    notificationIDList: {},
    lastCheckAt: new Date(Date.now() - 5_000),
  },
  {
    id: 5,
    parent: null,
    type: 'http',
    name: 'Staging API',
    url: 'https://staging-api.example.com',
    status: 'maintenance',
    active: true,
    interval: 300,
    retryInterval: 60,
    maxretries: 0,
    upsideDown: false,
    tags: [
      { id: 5, name: 'staging', color: '#F59E0B' },
    ],
    notificationIDList: {},
    lastCheckAt: new Date(Date.now() - 5 * 60_000),
    responseTime: 156,
    uptime24h: 100,
    uptime7d: 100,
    uptime30d: 99.8,
  },
  {
    id: 6,
    parent: null,
    type: 'dns',
    name: 'DNS Primary',
    hostname: 'ns1.example.com',
    status: 'up',
    active: true,
    interval: 300,
    retryInterval: 60,
    maxretries: 0,
    upsideDown: false,
    tags: [
      { id: 4, name: 'infrastructure', color: '#8B5CF6' },
    ],
    notificationIDList: {},
    lastCheckAt: new Date(Date.now() - 60_000),
    responseTime: 23,
    uptime24h: 100,
    uptime7d: 100,
    uptime30d: 100,
  },
  {
    id: 7,
    parent: null,
    type: 'http',
    name: 'Old API v1 (deprecated)',
    url: 'https://api-v1.example.com',
    status: 'paused',
    active: false,
    interval: 600,
    retryInterval: 60,
    maxretries: 0,
    upsideDown: false,
    tags: [
      { id: 6, name: 'deprecated', color: '#6B7280' },
    ],
    notificationIDList: {},
  },
];

/**
 * Generate sample response time data for a chart.
 * Produces N points with realistic-looking variation.
 */
export function generateResponseTimeData(
  count: number = 60,
  base: number = 120,
  variance: number = 40,
  seed: number = 1
): TimePoint[] {
  const data: TimePoint[] = [];
  const now = Date.now();
  let value = base;

  // Simple LCG for deterministic randomness
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  for (let i = 0; i < count; i++) {
    // Random walk with mean reversion
    const target = base + (rand() - 0.5) * variance * 2;
    value = value * 0.7 + target * 0.3;
    // Occasional spike
    if (rand() > 0.95) value += variance * 1.5;
    data.push({
      timestamp: new Date(now - (count - i) * 60_000),
      value: Math.max(10, value),
    });
  }
  return data;
}

/**
 * Generate sample uptime data for a UptimeBar.
 * Mostly up, with a few down periods.
 */
export function generateUptimeData(
  count: number = 200,
  downtimeRate: number = 0.02,
  seed: number = 2
): UptimePoint[] {
  const data: UptimePoint[] = [];
  const now = Date.now();

  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  // Add a small outage cluster around the middle
  const outageStart = Math.floor(count * 0.4);
  const outageEnd = outageStart + 8;

  for (let i = 0; i < count; i++) {
    let up = rand() > downtimeRate;
    if (i >= outageStart && i < outageEnd) {
      up = false; // outage
    }
    data.push({
      timestamp: new Date(now - (count - i) * 60_000),
      up,
    });
  }
  return data;
}

export const SAMPLE_SERVER: Server = {
  id: 'sample-1',
  name: 'Production Kuma',
  url: 'https://kuma.example.com',
  auth: { kind: 'bearer', token: 'sample' },
  kumaVersion: '2.4.0',
  connected: true,
  lastConnectedAt: new Date(),
  notificationMode: 'relay',
  createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
};
