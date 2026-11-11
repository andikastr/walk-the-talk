import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { FONT_FAMILY, PALETTE, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Tidak Ditemukan' }} />
      <View style={styles.container}>
        <Text style={styles.kicker}>404 · HALAMAN TIDAK ADA</Text>
        <Text style={styles.title}>Halaman ini tidak ditemukan.</Text>

        <Link href="/" style={styles.linkButton}>
          <Text style={styles.linkText}>Kembali ke Beranda</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.gutter,
  },
  kicker: {
    ...TYPOGRAPHY.labelUppercase,
    color: PALETTE.onSurfaceVariant,
    marginBottom: SPACING.sm,
  },
  title: {
    ...TYPOGRAPHY.headlineMd,
    color: PALETTE.onSurface,
    textAlign: 'center',
  },
  linkButton: {
    marginTop: SPACING.xl,
    backgroundColor: PALETTE.surfaceInverse,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
  },
  linkText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.bodySemiBold,
    color: PALETTE.onInverse,
  },
});
