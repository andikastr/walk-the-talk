import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import * as Updates from 'expo-updates';
import { useAppDialog } from '@/context/AppDialogContext';
import { usePreferences } from '@/context/AppPreferencesContext';

export interface ManualUpdateResult {
  status: 'dev' | 'found' | 'latest' | 'error';
  title: string;
  message: string;
}

interface AppUpdatesContextValue {
  isUpdateAvailable: boolean;
  isUpdatePending: boolean;
  checkForUpdateManually: (options?: {
    suppressDialog?: boolean;
  }) => Promise<ManualUpdateResult>;
  applyPendingUpdate: () => Promise<void>;
}

const AppUpdatesContext = createContext<AppUpdatesContextValue | null>(null);

/**
 * Provider tunggal untuk monitoring OTA Expo Updates agar dialog konfirmasi
 * tidak pernah terduplikasi lintas screen/modal.
 */
export function AppUpdatesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isUpdateAvailable, isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const { confirm, showDialog } = useAppDialog();
  const { t } = usePreferences();

  const promptedPendingKeyRef = useRef<string | null>(null);
  const fetchedAvailableRef = useRef<boolean>(false);

  useEffect(() => {
    if (__DEV__) return;

    async function checkAndApplyUpdate() {
      try {
        if (isUpdatePending) {
          const pendingKey = downloadedUpdate?.updateId ?? 'pending';
          if (promptedPendingKeyRef.current === pendingKey) {
            return;
          }
          promptedPendingKeyRef.current = pendingKey;

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
        } else if (isUpdateAvailable && !fetchedAvailableRef.current) {
          fetchedAvailableRef.current = true;
          await Updates.fetchUpdateAsync();
        }
      } catch (err: any) {
        console.warn('Gagal memeriksa/mengunduh pembaruan aplikasi:', err.message);
      }
    }

    void checkAndApplyUpdate();
  }, [
    confirm,
    downloadedUpdate?.updateId,
    isUpdateAvailable,
    isUpdatePending,
    t,
  ]);

  const checkForUpdateManually = useCallback(
    async (options?: { suppressDialog?: boolean }): Promise<ManualUpdateResult> => {
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
    },
    [showDialog, t]
  );

  const applyPendingUpdate = useCallback(async () => {
    await Updates.reloadAsync();
  }, []);

  const value = useMemo<AppUpdatesContextValue>(
    () => ({
      isUpdateAvailable,
      isUpdatePending,
      checkForUpdateManually,
      applyPendingUpdate,
    }),
    [applyPendingUpdate, checkForUpdateManually, isUpdateAvailable, isUpdatePending]
  );

  return (
    <AppUpdatesContext.Provider value={value}>
      {children}
    </AppUpdatesContext.Provider>
  );
}

export function useAppUpdatesContext(): AppUpdatesContextValue {
  const ctx = useContext(AppUpdatesContext);
  if (!ctx) {
    throw new Error('useAppUpdates must be used inside AppUpdatesProvider');
  }
  return ctx;
}

