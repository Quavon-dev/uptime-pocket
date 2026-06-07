/**
 * Status logic - maps monitor states to UI semantics.
 */

import { colors, type StatusColor } from '@/theme/colors';
import type { MonitorStatus } from './models';

export function statusColor(status: MonitorStatus): string {
  switch (status) {
    case 'up':
      return colors.status.up;
    case 'down':
      return colors.status.down;
    case 'pending':
      return colors.status.pending;
    case 'maintenance':
      return colors.status.maintenance;
    case 'paused':
      return colors.status.paused;
  }
}

export function statusLabel(status: MonitorStatus): string {
  switch (status) {
    case 'up':
      return 'Up';
    case 'down':
      return 'Down';
    case 'pending':
      return 'Pending';
    case 'maintenance':
      return 'Maintenance';
    case 'paused':
      return 'Paused';
  }
}

export function isHealthy(status: MonitorStatus): boolean {
  return status === 'up' || status === 'maintenance' || status === 'paused';
}

export function statusKey(status: MonitorStatus): StatusColor {
  return status;
}
