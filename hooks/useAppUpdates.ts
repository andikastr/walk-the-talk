import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Hook untuk memonitor dan mengunduh over-the-air update (EAS Update) secara otomatis
 */
export function useAppUpdates() {
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    if (__DEV__) return; // Jangan jalankan di development mode

    async function checkAndApplyUpdate() {
      try {
        if (isUpdatePending) {
          Alert.alert(
            'Pembaruan Siap!',
            'Aplikasi telah mengunduh pembaruan terbaru. Muat ulang sekarang untuk menerapkan perubahan?',
            [
              { text: 'Nanti', style: 'cancel' },
              { text: 'Muat Ulang', onPress: async () => await Updates.reloadAsync() },
            ]
          );
        } else if (isUpdateAvailable) {
          await Updates.fetchUpdateAsync();
        }
      } catch (err: any) {
        console.warn('Gagal memeriksa/mengunduh pembaruan EAS Update:', err.message);
      }
    }

    checkAndApplyUpdate();
  }, [isUpdateAvailable, isUpdatePending]);

  const checkForUpdateManually = async () => {
    if (__DEV__) {
      Alert.alert('Development Mode', 'EAS Update tidak aktif saat mode development.');
      return;
    }

    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        Alert.alert(
          'Pembaruan Ditemukan',
          'Pembaruan telah berhasil diunduh. Tekan OK untuk memuat ulang aplikasi.',
          [{ text: 'OK', onPress: async () => await Updates.reloadAsync() }]
        );
      } else {
        Alert.alert('Aplikasi Terkini', 'Aplikasi Anda sudah menggunakan versi paling mutakhir.');
      }
    } catch (err: any) {
      Alert.alert('Pemeriksaan Gagal', err.message || 'Tidak dapat memeriksa pembaruan saat ini.');
    }
  };

  return {
    isUpdateAvailable,
    isUpdatePending,
    checkForUpdateManually,
  };
}

