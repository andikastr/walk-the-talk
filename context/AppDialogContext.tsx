import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  AppDialogAction,
  AppDialogOverlay,
  AppDialogTone,
} from '@/components/ui/AppDialogOverlay';
import { usePreferences } from '@/context/AppPreferencesContext';

export interface ShowDialogOptions {
  kicker?: string;
  title: string;
  message?: string;
  tone?: AppDialogTone;
  dismissible?: boolean;
  actions?: {
    id: string;
    label: string;
    variant?: 'primary' | 'secondary' | 'destructive';
  }[];
}

export interface ConfirmDialogOptions {
  kicker?: string;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export interface AlertDialogOptions {
  kicker?: string;
  title: string;
  message?: string;
  tone?: AppDialogTone;
  actionText?: string;
}

interface QueuedDialog {
  options: ShowDialogOptions;
  resolve: (actionId: string | null) => void;
}

interface AppDialogContextValue {
  showDialog: (options: ShowDialogOptions) => Promise<string | null>;
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  alert: (options: AlertDialogOptions) => Promise<void>;
}

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const { t } = usePreferences();
  const [active, setActive] = useState<QueuedDialog | null>(null);
  const queueRef = useRef<QueuedDialog[]>([]);
  const activeRef = useRef<QueuedDialog | null>(null);

  const presentNext = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
  }, []);

  const showDialog = useCallback(
    (options: ShowDialogOptions): Promise<string | null> => {
      return new Promise((resolve) => {
        const entry: QueuedDialog = { options, resolve };
        if (!activeRef.current) {
          activeRef.current = entry;
          setActive(entry);
        } else {
          queueRef.current.push(entry);
        }
      });
    },
    []
  );

  const handleClose = useCallback(
    (actionId: string | null) => {
      const current = activeRef.current;
      activeRef.current = null;
      setActive(null);
      current?.resolve(actionId);
      setTimeout(presentNext, 16);
    },
    [presentNext]
  );

  const confirm = useCallback(
    async ({
      kicker,
      title,
      message,
      confirmText,
      cancelText,
      destructive = false,
    }: ConfirmDialogOptions): Promise<boolean> => {
      const result = await showDialog({
        kicker,
        title,
        message,
        tone: destructive ? 'destructive' : 'confirm',
        dismissible: false,
        actions: [
          {
            id: 'cancel',
            label: cancelText ?? t.common.cancel,
            variant: 'secondary',
          },
          {
            id: 'confirm',
            label: confirmText ?? t.common.ok,
            variant: destructive ? 'destructive' : 'primary',
          },
        ],
      });
      return result === 'confirm';
    },
    [showDialog, t.common.cancel, t.common.ok]
  );

  const alert = useCallback(
    async ({
      kicker,
      title,
      message,
      tone = 'info',
      actionText,
    }: AlertDialogOptions): Promise<void> => {
      await showDialog({
        kicker,
        title,
        message,
        tone,
        dismissible: true,
        actions: [
          {
            id: 'ok',
            label: actionText ?? t.common.ok,
            variant: 'primary',
          },
        ],
      });
    },
    [showDialog, t.common.ok]
  );

  const overlayActions = useMemo<AppDialogAction[]>(() => {
    if (!active) return [];
    const provided = active.options.actions;
    if (!provided || provided.length === 0) {
      return [
        {
          id: 'ok',
          label: t.common.ok,
          variant: 'primary',
          onPress: () => handleClose('ok'),
        },
      ];
    }
    return provided.map((action) => ({
      id: action.id,
      label: action.label,
      variant: action.variant,
      onPress: () => handleClose(action.id),
    }));
  }, [active, handleClose, t.common.ok]);

  const value = useMemo<AppDialogContextValue>(
    () => ({ showDialog, confirm, alert }),
    [showDialog, confirm, alert]
  );

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      {active ? (
        <AppDialogOverlay
          visible
          kicker={active.options.kicker}
          title={active.options.title}
          message={active.options.message}
          tone={active.options.tone ?? 'info'}
          dismissible={active.options.dismissible}
          actions={overlayActions}
          onDismiss={() => handleClose(null)}
        />
      ) : null}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog(): AppDialogContextValue {
  const ctx = useContext(AppDialogContext);
  if (!ctx) {
    throw new Error('useAppDialog must be used inside AppDialogProvider');
  }
  return ctx;
}

