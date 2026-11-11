import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';

export default function ModalScreen() {
  const { palette, isDark, t } = usePreferences();

  return (
    <View style={[styles.container, { backgroundColor: palette.surface }]}>
      <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]}>
        {t.routes.infoKicker}
      </Text>
      <Text style={[styles.title, { color: palette.onSurface }]}>{t.routes.infoTitle}</Text>
      <View style={[styles.separator, { backgroundColor: palette.border }]} />
      <Text style={[styles.body, { color: palette.onSurfaceVariant }]}>
        {t.routes.infoBody}
      </Text>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
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
    marginBottom: SPACING.xs,
  },
  title: {
    ...TYPOGRAPHY.headlineMd,
  },
  separator: {
    marginVertical: SPACING.xl,
    height: 1,
    width: '60%',
  },
  body: {
    ...TYPOGRAPHY.bodyMd,
  },
});
