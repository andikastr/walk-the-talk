import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';

export default function NotFoundScreen() {
  const { palette, t } = usePreferences();

  return (
    <>
      <Stack.Screen options={{ title: t.routes.notFoundTitle }} />
      <View style={[styles.container, { backgroundColor: palette.surface }]}>
        <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]}>
          {t.routes.notFoundKicker}
        </Text>
        <Text style={[styles.title, { color: palette.onSurface }]}>
          {t.routes.notFoundHeading}
        </Text>

        <Link
          href="/"
          style={[styles.linkButton, { backgroundColor: palette.actionPrimary }]}
        >
          <Text style={[styles.linkText, { color: palette.onActionPrimary }]}>
            {t.routes.notFoundCta}
          </Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.gutter,
  },
  kicker: {
    ...TYPOGRAPHY.labelUppercase,
    marginBottom: SPACING.sm,
  },
  title: {
    ...TYPOGRAPHY.headlineMd,
    textAlign: 'center',
  },
  linkButton: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
  },
  linkText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.bodySemiBold,
  },
});
