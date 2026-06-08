/**
 * Public surface of the notifications feature.
 */

export {
  notifyStatus,
  ensurePermission,
  clearBadge,
} from './scheduler';
export { decideNotify, type DecideNotifyArgs, type NotifyDecision } from './decide';
export {
  isWithinQuietHours,
  NO_QUIET,
  type QuietWindow,
} from './quietHours';
export {
  useNotificationOptIn,
  requestNotificationPermission,
  shouldShowOptIn,
  type OptInStatus,
} from './optIn';
export { OptInCard } from './OptInCard';
export { useNotificationBridge } from './useNotificationBridge';
