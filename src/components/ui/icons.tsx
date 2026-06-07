/**
 * Icon system for Uptime Pocket.
 *
 * Uses Lucide (lucide-react-native) for cross-platform consistency.
 * Lucide has 1000+ icons, all in a consistent stroke-based style.
 *
 * We wrap it so we can:
 * - Add a default size that matches our design tokens
 * - Apply our color tokens
 * - Map monitor types to specific icons
 * - Add a few custom icons Kuma needs (e.g. status pulse)
 */

import type { MonitorType } from '@/domain/models';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleDashed,
  Clock,
  Copy,
  Database,
  Edit,
  Eye,
  EyeOff,
  ExternalLink,
  Filter,
  Globe,
  Hash,
  Heart,
  HeartPulse,
  HelpCircle,
  Info,
  KeyRound,
  Link2,
  Loader,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Maximize2,
  Menu,
  MessageSquare,
  Minimize2,
  MoreHorizontal,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Power,
  Radio,
  RefreshCw,
  RotateCw,
  Save,
  Search,
  Send,
  Server,
  ServerCrash,
  ServerOff,
  Settings,
  Share2,
  Shield,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Slash,
  Sliders,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  TrendingDown,
  TrendingUp,
  Unlock,
  User,
  Users,
  Wifi,
  WifiOff,
  X,
  Zap,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react-native';

export type IconProps = LucideProps & {
  size?: number;
  color?: string;
};

/** Re-export all icons for ad-hoc use. */
export {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleDashed,
  Clock,
  Copy,
  Database,
  Edit,
  Eye,
  EyeOff,
  ExternalLink,
  Filter,
  Globe,
  Hash,
  Heart,
  HeartPulse,
  HelpCircle,
  Info,
  KeyRound,
  Link2,
  Loader,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Maximize2,
  Menu,
  MessageSquare,
  Minimize2,
  MoreHorizontal,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Power,
  Radio,
  RefreshCw,
  RotateCw,
  Save,
  Search,
  Send,
  Server,
  ServerCrash,
  ServerOff,
  Settings,
  Share2,
  Shield,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Slash,
  Sliders,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  TrendingDown,
  TrendingUp,
  Unlock,
  User,
  Users,
  Wifi,
  WifiOff,
  X,
  Zap,
  type LucideIcon,
  type LucideProps,
};

/**
 * Map a Kuma monitor type to the right icon.
 * Falls back to a generic Radio icon.
 */

export function monitorTypeIcon(type: MonitorType): LucideIcon {
  switch (type) {
    case 'http':
    case 'keyword':
    case 'json-query':
    case 'grpc-keyword':
      return Globe;
    case 'ping':
    case 'tailscale-ping':
      return Radio;
    case 'port':
    case 'websocket':
      return Signal;
    case 'dns':
      return Hash;
    case 'push':
      return Bell;
    case 'steam':
      return Zap;
    case 'mqtt':
      return MessageSquare;
    case 'sqlserver':
    case 'postgres':
    case 'mysql':
    case 'mongodb':
    case 'redis':
      return Database;
    case 'radius':
      return Shield;
    case 'snmp':
      return Activity;
    case 'smtp':
      return Mail;
    case 'sip':
      return Smartphone;
    case 'gamedig':
      return HeartPulse;
    case 'docker':
      return Server;
    case 'group':
      return Users;
    default:
      return Radio;
  }
}

/** Default size for monitor type icons. */
export const ICON_SIZES = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;
