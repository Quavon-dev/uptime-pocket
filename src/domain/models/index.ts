/**
 * Domain types for Uptime Pocket.
 * These are pure, framework-agnostic types that the rest of the app builds on.
 */

export type MonitorStatus = 'up' | 'down' | 'pending' | 'maintenance' | 'paused';

export type MonitorType =
  | 'http'
  | 'ping'
  | 'port'
  | 'dns'
  | 'push'
  | 'steam'
  | 'mqtt'
  | 'sqlserver'
  | 'postgres'
  | 'mysql'
  | 'mongodb'
  | 'redis'
  | 'radius'
  | 'keyword'
  | 'json-query'
  | 'grpc-keyword'
  | 'snmp'
  | 'smtp'
  | 'sip'
  | 'gamedig'
  | 'websocket'
  | 'tailscale-ping'
  | 'docker'
  | 'group';

export interface Monitor {
  id: number;
  parent: number | null;
  type: MonitorType;
  name: string;
  url?: string;
  hostname?: string;
  port?: number;
  status: MonitorStatus;
  active: boolean;
  interval: number; // seconds
  retryInterval: number;
  maxretries: number;
  upsideDown: boolean;
  tags: Tag[];
  notificationIDList: Record<string, boolean>;
  msg?: string;
  // Live data
  lastCheckAt?: Date;
  responseTime?: number; // ms
  uptime24h?: number; // 0-100
  uptime7d?: number;
  uptime30d?: number;
  // Cert info (https)
  certExpiryDays?: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Server {
  id: string; // local UUID
  name: string;
  url: string; // base URL of Kuma instance
  /**
   * The kind of authentication this server uses.
   * The actual credentials (token / password) are stored in
   * expo-secure-store, keyed by server id — see
   * `src/data/secure/credentials.ts`.
   */
  authKind: 'bearer' | 'password';
  kumaVersion?: string; // detected on connect
  connected: boolean;
  lastConnectedAt?: Date;
  notificationMode: NotificationMode;
  createdAt: Date;
}

export type AuthStrategy =
  | { kind: 'bearer'; token: string }
  | { kind: 'password'; username: string; password: string };

export type NotificationMode = 'none' | 'direct' | 'relay';

export interface RelayConfig {
  url: string; // e.g. https://kuma.example.com:3015
  token: string; // auth token issued by relay
}

export interface Incident {
  id: string;
  monitorId: number;
  serverId: string;
  startedAt: Date;
  endedAt?: Date;
  cause: 'down' | 'recovery' | 'cert_expiring' | 'maintenance_start' | 'maintenance_end';
  duration?: number; // ms, computed when ended
}

export interface MonitorStats {
  responseTime: TimePoint[];
  uptime: UptimePoint[];
  uptimePercentage: number; // 0-100 for the requested window
  averageResponseTime: number;
  incidents: Incident[];
}

export interface TimePoint {
  timestamp: Date;
  value: number; // ms
}

export interface UptimePoint {
  timestamp: Date;
  up: boolean;
}
