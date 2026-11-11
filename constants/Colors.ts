import { TextStyle } from 'react-native';

/**
 * Paper & Lime Performance Mobile Design System Tokens
 * Source of truth: DESIGN.md
 */
export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemePalette {
  primary: string;
  primaryDeep: string;
  onPrimary: string;
  accent: string;
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;
  surfaceInverse: string;
  surfaceFeature: string;
  surfaceFeatureElevated: string;
  actionPrimary: string;
  onActionPrimary: string;
  modalSurface: string;
  modalSurfaceAlt: string;
  onSurface: string;
  onSurfaceVariant: string;
  onInverse: string;
  onInverseMuted: string;
  onFeature: string;
  onFeatureMuted: string;
  border: string;
  borderStrong: string;
  neutralSoft: string;
  backdrop: string;
  emberTint: string;
  spotifyGreen: string;
}

export const LIGHT_PALETTE: ThemePalette = {
  primary: '#D7FE47',          // Electric lime — accent only, never page surface
  primaryDeep: '#C8F02A',      // Pressed lime
  onPrimary: '#0E0F0C',        // Ink on lime
  accent: '#FF5A1F',           // Ember orange — hero metrics & alerts only
  surface: '#F4F2EC',          // Warm paper — global page background
  surfaceAlt: '#EBE8E0',       // Paper-alt — default tiles & grouped cards
  surfaceRaised: '#FFFFFF',    // Pure white — list-row cards on paper
  surfaceInverse: '#0E0F0C',   // Ink — dark feature cards & floating tab bar
  surfaceFeature: '#0E0F0C',   // Feature block canvas (Mini Player, Tab Bar, Soundtrack)
  surfaceFeatureElevated: '#1B1C18',
  actionPrimary: '#0E0F0C',    // Primary ink CTA & active chip background
  onActionPrimary: '#F4F2EC',  // Text on primary CTA & active chip
  modalSurface: '#F4F2EC',     // Custom dialog / sheet surface
  modalSurfaceAlt: '#EBE8E0',  // Secondary tiles, inputs, cancel pills inside modals
  onSurface: '#0E0F0C',        // Ink — primary text
  onSurfaceVariant: '#8A8A82', // Mute — metadata, kickers, secondary text
  onInverse: '#F4F2EC',        // Paper text on ink
  onInverseMuted: 'rgba(244, 242, 236, 0.62)', // Subdued text on ink
  onFeature: '#F4F2EC',
  onFeatureMuted: 'rgba(244, 242, 236, 0.62)',
  border: '#E3E0D7',           // Hairline dividers & ring tracks
  borderStrong: '#DDDAD1',     // Progress track fill
  neutralSoft: '#C8C5BA',      // De-emphasized data bar fill
  backdrop: 'rgba(14, 15, 12, 0.55)',
  emberTint: 'rgba(255, 90, 31, 0.12)',
  spotifyGreen: '#1DB954',     // Brand-compliant Spotify attribution & CTA
};

export const DARK_PALETTE: ThemePalette = {
  primary: '#D7FE47',          // Electric lime — strictly rationed accent
  primaryDeep: '#C8F02A',      // Pressed lime
  onPrimary: '#0E0F0C',        // Ink on lime
  accent: '#FF5A1F',           // Ember orange — hero metrics & alerts only
  surface: '#0E0F0C',          // Deep obsidian ink — global page background
  surfaceAlt: '#181A15',       // Charcoal-alt — default tiles & grouped cards
  surfaceRaised: '#22251E',    // Elevated tonal list-row surface on dark canvas
  surfaceInverse: '#F4F2EC',   // Warm paper inverse contrast on dark canvas
  surfaceFeature: '#161813',   // Dedicated dark feature block surface
  surfaceFeatureElevated: '#23261F',
  actionPrimary: '#F4F2EC',    // Paper pill CTA & active filter chip on dark canvas
  onActionPrimary: '#0E0F0C',  // Ink text on paper pill CTA
  modalSurface: '#191B16',     // Custom modal/sheet surface lifted off dimmed backdrop
  modalSurfaceAlt: '#242720',  // Inputs, stat boxes & cancel pills inside dark modals
  onSurface: '#F4F2EC',        // Warm paper — primary text
  onSurfaceVariant: '#9E9D93', // Balanced neutral mute on dark canvas
  onInverse: '#0E0F0C',        // Ink text on paper inverse
  onInverseMuted: 'rgba(14, 15, 12, 0.62)',
  onFeature: '#F4F2EC',        // Paper text on feature block
  onFeatureMuted: 'rgba(244, 242, 236, 0.64)',
  border: '#2B2E25',           // Dark hairline divider
  borderStrong: '#383C31',
  neutralSoft: '#45493E',      // Empty chart bar fill on dark canvas
  backdrop: 'rgba(0, 0, 0, 0.72)',
  emberTint: 'rgba(255, 90, 31, 0.18)',
  spotifyGreen: '#1DB954',
};

export const PALETTE = LIGHT_PALETTE;

// Legacy/semantic aliases kept in sync with DESIGN.md
export const PRIMARY_ORANGE = PALETTE.accent;
export const ELECTRIC_LIME = PALETTE.primary;
export const SPOTIFY_GREEN = PALETTE.spotifyGreen;
export const SPORT_RED = PALETTE.accent;
export const SPORT_BLUE = PALETTE.surfaceInverse;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  gutter: 24,
  cardPadding: 20,
  tilePadding: 16,
  sectionGap: 24,
} as const;

export const RADIUS = {
  sm: 8,
  md: 18,
  lg: 24,
  full: 9999,
} as const;

/**
 * Hanya floating bottom nav yang menggunakan box-shadow ("cta-shadow").
 * Kartu, foto, dan tombol lain tetap flat sesuai DESIGN.md.
 */
export const SHADOWS = {
  floatingNav: '0 10px 30px -8px rgba(14, 15, 12, 0.35), 0 2px 0 rgba(14, 15, 12, 0.06)',
} as const;

export const FONT_FAMILY = {
  displayMedium: 'SpaceGrotesk_500Medium',
  displaySemiBold: 'SpaceGrotesk_600SemiBold',
  displayBold: 'SpaceGrotesk_700Bold',
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
} as const;

/**
 * Role-separated typography scale per DESIGN.md.
 * Weight diatur langsung via nama font statis (tanpa fontWeight tambahan) agar konsisten di iOS & Android.
 */
export const TYPOGRAPHY = {
  displayXl: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 64,
    lineHeight: 60,
    letterSpacing: -2.56,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
  displayHero: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 84,
    lineHeight: 76,
    letterSpacing: -3.36,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
  displayMd: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -1.36,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
  numeralMd: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 26,
    lineHeight: 28,
    letterSpacing: -1.04,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
  numeralSm: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: -0.88,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
  numeralIdle: {
    fontFamily: FONT_FAMILY.displayMedium,
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: -0.44,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
  headlineMd: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 17,
    lineHeight: 21,
    letterSpacing: -0.17,
  } satisfies TextStyle,
  headlineSm: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: -0.15,
  } satisfies TextStyle,
  cardTitle: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 16,
    lineHeight: 19,
    letterSpacing: -0.16,
  } satisfies TextStyle,
  bodyMd: {
    fontFamily: FONT_FAMILY.bodyRegular,
    fontSize: 13,
    lineHeight: 18.2,
    letterSpacing: 0,
  } satisfies TextStyle,
  bodySm: {
    fontFamily: FONT_FAMILY.bodyRegular,
    fontSize: 12,
    lineHeight: 16.2,
    letterSpacing: 0,
  } satisfies TextStyle,
  labelMd: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: -0.12,
  } satisfies TextStyle,
  labelSm: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.11,
  } satisfies TextStyle,
  labelUppercase: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  } satisfies TextStyle,
  caption: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 1.35,
  } satisfies TextStyle,
} as const;

const buildLegacyTheme = (p: ThemePalette) => ({
  text: p.onSurface,
  textMuted: p.onSurfaceVariant,
  background: p.surface,
  card: p.surfaceAlt,
  cardRaised: p.surfaceRaised,
  cardInverse: p.surfaceFeature,
  border: p.border,
  tint: p.primary,
  accent: p.accent,
  tabIconDefault: p.onFeatureMuted,
  tabIconSelected: p.onPrimary,
  spotify: p.spotifyGreen,
  hudBackground: p.surfaceFeature,
  hudText: p.onFeature,
  hudAccent: p.accent,
});

export default {
  light: buildLegacyTheme(LIGHT_PALETTE),
  dark: buildLegacyTheme(DARK_PALETTE),
};
