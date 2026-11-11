import { useEffect } from 'react';
import * as Updates from 'expo-updates';
import { useAppDialog } from '@/context/AppDialogContext';
import { usePreferences } from '@/context/AppPreferencesContext';

export interface ManualUpdateResult {
  status: 'dev' | 'found' | 'latest' | 'error';
  title: string;
  message: string;
}

/**
 * Hook untuk memonitor dan mengunduh pembaruan aplikasi otomatis di latar belakang.
 */
export function useAppUpdates() {
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
  const { confirm, showDialog } = useAppDialog();
  const { t } = usePreferences();

  useEffect(() => {
    if (__DEV__) return;

    async function checkAndApplyUpdate() {
      try {
        if (isUpdatePending) {
          const shouldReload = await confirm({
            kicker: t.updates.kicker,
            title: t.updates.pendingTitle,
            message: t.updates.pendingMessage,
            cancelText: t.common.later,
            confirmText: t.updates.reloadAction,
          });
          if (shouldReload) {
            await Updates.reloadAsync();
          }
        } else if (isUpdateAvailable) {
          await Updates.fetchUpdateAsync();
        }
      } catch (err: any) {
        console.warn('Gagal memeriksa/mengunduh pembaruan aplikasi:', err.message);
      }
    }

    checkAndApplyUpdate();
  }, [isUpdateAvailable, isUpdatePending, confirm, t]);

  const checkForUpdateManually = async (options?: {
    suppressDialog?: boolean;
  }): Promise<ManualUpdateResult> => {
    if (__DEV__) {
      const result: ManualUpdateResult = {
        status: 'dev',
        title: t.updates.devTitle,
        message: t.updates.devMessage,
      };
      if (!options?.suppressDialog) {
        await showDialog({
          kicker: t.updates.kicker,
          title: result.title,
          message: result.message,
          tone: 'info',
          actions: [{ id: 'ok', label: t.common.ok, variant: 'primary' }],
        });
      }
      return result;
    }

    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        const result: ManualUpdateResult = {
          status: 'found',
          title: t.updates.foundTitle,
          message: t.updates.foundMessage,
        };
        if (!options?.suppressDialog) {
          const picked = await showDialog({
            kicker: t.updates.kicker,
            title: result.title,
            message: result.message,
            tone: 'success',
            actions: [
              { id: 'later', label: t.common.later, variant: 'secondary' },
              { id: 'reload', label: t.updates.reloadAction, variant: 'primary' },
            ],
          });
          if (picked === 'reload') {
            await Updates.reloadAsync();
          }
        }
        return result;
      }

      const result: ManualUpdateResult = {
        status: 'latest',
        title: t.updates.latestTitle,
        message: t.updates.latestMessage,
      };
      if (!options?.suppressDialog) {
        await showDialog({
          kicker: t.updates.kicker,
          title: result.title,
          message: result.message,
          tone: 'success',
          actions: [{ id: 'ok', label: t.common.ok, variant: 'primary' }],
        });
      }
      return result;
    } catch (err: any) {
      const result: ManualUpdateResult = {
        status: 'error',
        title: t.updates.failTitle,
        message: err?.message || t.updates.failMessage,
      };
      if (!options?.suppressDialog) {
        await showDialog({
          kicker: t.updates.kicker,
          title: result.title,
          message: result.message,
          tone: 'error',
          actions: [{ id: 'ok', label: t.common.ok, variant: 'primary' }],
        });
      }
      return result;
    }
  };

  const applyPendingUpdate = async () => {
    await Updates.reloadAsync();
  };

  return {
    isUpdateAvailable,
    isUpdatePending,
    checkForUpdateManually,
    applyPendingUpdate,
  };
}
