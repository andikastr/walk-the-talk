import { TextStyle } from 'react-native';

/**
 * Paper & Lime Performance Mobile Design System Tokens
 * Source of truth: DESIGN.md
 */
export const PALETTE = {
  primary: '#D7FE47',          // Electric lime — accent only, never page surface
  primaryDeep: '#C8F02A',      // Pressed lime
  onPrimary: '#0E0F0C',        // Ink on lime
  accent: '#FF5A1F',           // Ember orange — hero metrics & alerts only
  surface: '#F4F2EC',          // Warm paper — global page background
  surfaceAlt: '#EBE8E0',       // Paper-alt — default tiles & grouped cards
  surfaceRaised: '#FFFFFF',    // Pure white — list-row cards on paper
  surfaceInverse: '#0E0F0C',   // Ink — dark feature cards & floating tab bar
  onSurface: '#0E0F0C',        // Ink — primary text
  onSurfaceVariant: '#8A8A82', // Mute — metadata, kickers, secondary text
  onInverse: '#F4F2EC',        // Paper text on ink
  onInverseMuted: 'rgba(244, 242, 236, 0.62)', // Subdued text on ink
  border: '#E3E0D7',           // Hairline dividers & ring tracks
  borderStrong: '#DDDAD1',     // Progress track fill
  neutralSoft: '#C8C5BA',      // De-emphasized data bar fill
  spotifyGreen: '#1DB954',     // Brand-compliant Spotify attribution & CTA
} as const;

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

const paperTheme = {
  text: PALETTE.onSurface,
  textMuted: PALETTE.onSurfaceVariant,
  background: PALETTE.surface,
  card: PALETTE.surfaceAlt,
  cardRaised: PALETTE.surfaceRaised,
  cardInverse: PALETTE.surfaceInverse,
  border: PALETTE.border,
  tint: PALETTE.primary,
  accent: PALETTE.accent,
  tabIconDefault: PALETTE.onInverseMuted,
  tabIconSelected: PALETTE.onPrimary,
  spotify: PALETTE.spotifyGreen,
  hudBackground: PALETTE.surfaceInverse,
  hudText: PALETTE.onInverse,
  hudAccent: PALETTE.accent,
};

export default {
  light: paperTheme,
  dark: paperTheme,
};
