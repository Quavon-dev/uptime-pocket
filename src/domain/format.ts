/**
 * Formatting utilities.
 */

export function formatResponseTime(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatUptime(percentage: number | undefined): string {
  if (percentage === undefined || percentage === null) return '—';
  if (percentage >= 99.99) return '100%';
  return `${percentage.toFixed(2)}%`;
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatRelativeTime(date: Date | undefined): string {
  if (!date) return '—';
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) return date.toLocaleDateString();
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 10) return `${seconds}s ago`;
  return 'just now';
}

export function formatLastCheck(date: Date | undefined): string {
  if (!date) return 'Never checked';
  return `Last check ${formatRelativeTime(date)}`;
}

export function formatCertExpiry(days: number | undefined): string {
  if (days === undefined || days === null) return '—';
  if (days < 0) return 'Expired';
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days < 30) return `Expires in ${days} days`;
  if (days < 365) return `Expires in ${Math.floor(days / 30)} months`;
  return `Expires in ${Math.floor(days / 365)} years`;
}
