import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { PALETTE, SPACING, TYPOGRAPHY } from '@/constants/Colors';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>WALK THE TALK</Text>
      <Text style={styles.title}>Info</Text>
      <View style={styles.separator} />
      <Text style={styles.body}>Pelacak rute lari & kendali pemutar Spotify.</Text>
      <StatusBar style="dark" />
    </View>
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
    marginBottom: SPACING.xs,
  },
  title: {
    ...TYPOGRAPHY.headlineMd,
    color: PALETTE.onSurface,
  },
  separator: {
    marginVertical: SPACING.xl,
    height: 1,
    width: '60%',
    backgroundColor: PALETTE.border,
  },
  body: {
    ...TYPOGRAPHY.bodyMd,
    color: PALETTE.onSurfaceVariant,
  },
});
