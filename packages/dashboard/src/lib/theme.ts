/**
 * Theme: Option B Graphite
 * Single source of truth for all colors, shadows, and transitions.
 *
 * UX Design Principles:
 * 1. Neutral Canvas - Let content shine on clean white backgrounds
 * 2. Sky Blue Highlights - Use accent color for links and interactive states
 * 3. Developer Familiar - Cool grays echo IDE themes
 */

// =============================================================================
// CORE PALETTE - Graphite
// =============================================================================

export const colors = {
  // Primary - Slate gray for primary actions
  primary: '#475569',
  primaryHover: '#334155',
  primaryLight: '#F1F5F9',

  // Accent - Sky blue for links and highlights
  accent: '#0EA5E9',
  accentLight: '#E0F2FE',

  // Status colors
  success: '#22C55E',
  successLight: '#DCFCE7',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  info: '#3B82F6',
  infoLight: '#DBEAFE',

  // Backgrounds
  bg: '#FFFFFF',
  surface: '#F8FAFC',
  card: '#FFFFFF',

  // Borders
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  // Text
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
} as const;

// =============================================================================
// SEMANTIC TOKENS - Status
// =============================================================================

export const statusColors = {
  success: {
    color: colors.success,
    bgColor: '#14532D',
    lightBg: colors.successLight,
  },
  failed: {
    color: colors.error,
    bgColor: '#7F1D1D',
    lightBg: colors.errorLight,
  },
  error: {
    color: colors.error,
    bgColor: '#7F1D1D',
    lightBg: colors.errorLight,
  },
  cancelled: {
    color: colors.warning,
    bgColor: '#78350F',
    lightBg: colors.warningLight,
  },
  running: {
    color: colors.info,
    bgColor: '#1E3A5F',
    lightBg: colors.infoLight,
  },
  pending: {
    color: '#6B7280',
    bgColor: '#374151',
    lightBg: '#F3F4F6',
  },
  stopped: {
    color: colors.warning,
    bgColor: '#78350F',
    lightBg: colors.warningLight,
  },
} as const;

// =============================================================================
// SEMANTIC TOKENS - Category Levels
// =============================================================================

export const categoryColors = {
  primitive: {
    color: '#6B7280',
    bgColor: '#F3F4F6',
  },
  task: {
    color: colors.info,
    bgColor: colors.infoLight,
  },
  process: {
    color: colors.success,
    bgColor: colors.successLight,
  },
  workflow: {
    color: '#8B5CF6',
    bgColor: '#EDE9FE',
  },
  pipeline: {
    color: colors.warning,
    bgColor: colors.warningLight,
  },
} as const;

// =============================================================================
// SEMANTIC TOKENS - Category Domains
// =============================================================================

export const domainColors = {
  engineering: {
    color: '#8B5CF6',     // purple
    bgColor: '#EDE9FE',
    borderColor: '#C4B5FD',
  },
  sales: {
    color: '#F59E0B',     // amber
    bgColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  support: {
    color: '#06B6D4',     // cyan
    bgColor: '#CFFAFE',
    borderColor: '#67E8F9',
  },
  marketing: {
    color: '#EC4899',     // pink
    bgColor: '#FCE7F3',
    borderColor: '#F9A8D4',
  },
  finance: {
    color: '#10B981',     // emerald
    bgColor: '#D1FAE5',
    borderColor: '#6EE7B7',
  },
  hr: {
    color: '#F97316',     // orange
    bgColor: '#FFEDD5',
    borderColor: '#FDBA74',
  },
  ops: {
    color: '#6366F1',     // indigo
    bgColor: '#E0E7FF',
    borderColor: '#A5B4FC',
  },
  research: {
    color: '#14B8A6',     // teal
    bgColor: '#CCFBF1',
    borderColor: '#5EEAD4',
  },
  personal: {
    color: '#64748B',     // slate
    bgColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
} as const;

// =============================================================================
// SEMANTIC TOKENS - Step Types
// =============================================================================

export const stepTypeColors = {
  browser: colors.info,        // #3B82F6 - blue
  shell: colors.success,       // #22C55E - green
  terminal: colors.success,    // #22C55E - green
  llm: '#A855F7',              // purple
  control: colors.warning,     // #F59E0B - amber
  workflow: '#06B6D4',         // cyan
  data: '#EC4899',             // pink
  default: '#6B7280',          // gray
} as const;

// =============================================================================
// SHADOWS
// =============================================================================

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.03)',
} as const;

// =============================================================================
// TRANSITIONS
// =============================================================================

export const transitions = {
  fast: '0.15s ease',
  medium: '0.25s ease',
  slow: '0.4s ease',
} as const;

// =============================================================================
// COLOR PICKER PALETTE
// =============================================================================

export const pickerPalette = [
  colors.info,      // #3B82F6 - blue
  colors.success,   // #22C55E - green
  colors.warning,   // #F59E0B - amber
  '#8B5CF6',        // purple
  '#06B6D4',        // cyan/teal
  '#EC4899',        // pink
  colors.primary,   // #475569 - slate
  colors.error,     // #EF4444 - red
] as const;

// =============================================================================
// CSS CUSTOM PROPERTIES GENERATOR
// =============================================================================

export function generateCSSVariables(): string {
  return `
  --color-primary: ${colors.primary};
  --color-primary-hover: ${colors.primaryHover};
  --color-primary-light: ${colors.primaryLight};
  --color-accent: ${colors.accent};
  --color-accent-light: ${colors.accentLight};
  --color-success: ${colors.success};
  --color-success-light: ${colors.successLight};
  --color-warning: ${colors.warning};
  --color-warning-light: ${colors.warningLight};
  --color-error: ${colors.error};
  --color-error-light: ${colors.errorLight};
  --color-info: ${colors.info};
  --color-info-light: ${colors.infoLight};
  --color-bg: ${colors.bg};
  --color-surface: ${colors.surface};
  --color-card: ${colors.card};
  --color-border: ${colors.border};
  --color-border-strong: ${colors.borderStrong};
  --color-text: ${colors.text};
  --color-text-secondary: ${colors.textSecondary};
  --color-text-muted: ${colors.textMuted};
  --shadow-sm: ${shadows.sm};
  --shadow-md: ${shadows.md};
  --shadow-lg: ${shadows.lg};
  --shadow-xl: ${shadows.xl};
  --transition-fast: ${transitions.fast};
  --transition-medium: ${transitions.medium};
  --transition-slow: ${transitions.slow};
  `.trim();
}

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type StatusType = keyof typeof statusColors;
export type CategoryLevel = keyof typeof categoryColors;
export type DomainType = keyof typeof domainColors;
export type StepTypePrefix = keyof typeof stepTypeColors;
