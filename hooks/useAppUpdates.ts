import { useAppUpdatesContext } from '@/context/AppUpdatesContext';

export type { ManualUpdateResult } from '@/context/AppUpdatesContext';

/**
 * Mengakses status dan aksi pembaruan aplikasi OTA dari provider tunggal.
 */
export function useAppUpdates() {
  return useAppUpdatesContext();
}
