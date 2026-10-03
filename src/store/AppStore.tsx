// App-wide data: the merged item list, settings, and the actions that change them.
// Every change is saved to the device right away.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import catalogData from '../data/catalog.json';
import { mergeItems } from '../model/items';
import { DEFAULT_SETTINGS, type CatalogItem, type Item, type ItemOverride, type Settings } from '../model/types';
import {
  deletePhoto,
  loadOverrides,
  loadSettings,
  requestPersistentStorage,
  savePhoto,
  saveOverrides,
  saveSettings,
} from './db';
import { cachePhotoUrl, newPhotoId, shrinkPhoto } from './photos';
import { backupNeeded, loadBackupStatus, saveBackupStatus, SNOOZE_MS, type BackupStatus } from './backupStatus';

export const CATALOG = catalogData as CatalogItem[];

/** Fields to change; a field set to undefined is cleared (back to the catalog / default value). */
export type ItemPatch = { [K in keyof Omit<ItemOverride, 'id'>]?: ItemOverride[K] | undefined };

interface AppStoreValue {
  ready: boolean;
  /** All items, hidden ones included. */
  items: Item[];
  overrides: Record<string, ItemOverride>;
  settings: Settings;
  updateItem: (id: string, patch: ItemPatch) => void;
  addItem: (override: ItemOverride) => void;
  /** Custom items are deleted; built-in items return to their catalog state. */
  removeOrResetItem: (id: string) => void;
  /** Remembers another way the item was heard, so it is recognized next time. */
  learnAlias: (id: string, alias: string) => void;
  setPhoto: (id: string, file: Blob) => Promise<void>;
  removePhoto: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Replaces everything: restored from a backup file, or imported from Excel. */
  replaceAll: (overrides: Record<string, ItemOverride>, settings: Settings, source: 'backup' | 'import') => void;
  /** The florist has changes that no saved backup holds (see BackupReminder). */
  backupNeeded: boolean;
  lastBackupAt?: number;
  markBackedUp: () => void;
  snoozeBackupReminder: () => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

function applyPatch(base: ItemOverride, patch: ItemPatch): ItemOverride {
  const next: Record<string, unknown> = { ...base, ...patch };
  for (const [key, value] of Object.entries(next)) if (value === undefined) delete next[key];
  return next as unknown as ItemOverride;
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, ItemOverride>>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const loaded = useRef(false);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>(loadBackupStatus);

  useEffect(() => {
    void requestPersistentStorage();
    void Promise.all([loadOverrides(), loadSettings()]).then(([savedOverrides, savedSettings]) => {
      setOverrides(savedOverrides);
      setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
      loaded.current = true;
      setReady(true);
    });
  }, []);

  // Save after every change (but not the initial empty state before loading).
  useEffect(() => {
    if (loaded.current) void saveOverrides(overrides);
  }, [overrides]);
  useEffect(() => {
    if (loaded.current) void saveSettings(settings);
  }, [settings]);

  useEffect(() => saveBackupStatus(backupStatus), [backupStatus]);

  const items = useMemo(() => mergeItems(CATALOG, overrides), [overrides]);

  // Any change to the florist's own data is something a backup should hold.
  const markChanged = useCallback(() => {
    setBackupStatus((previous) => ({ ...previous, lastChangeAt: Date.now() }));
  }, []);

  const markBackedUp = useCallback(() => {
    setBackupStatus((previous) => ({ ...previous, lastBackupAt: Date.now(), snoozedUntil: undefined }));
  }, []);

  const snoozeBackupReminder = useCallback(() => {
    setBackupStatus((previous) => ({ ...previous, snoozedUntil: Date.now() + SNOOZE_MS }));
  }, []);

  const updateItem = useCallback(
    (id: string, patch: ItemPatch) => {
      markChanged();
      setOverrides((previous) => ({ ...previous, [id]: applyPatch(previous[id] ?? { id }, patch) }));
    },
    [markChanged],
  );

  const addItem = useCallback(
    (override: ItemOverride) => {
      markChanged();
      setOverrides((previous) => ({ ...previous, [override.id]: { ...override, custom: true } }));
    },
    [markChanged],
  );

  const removeOrResetItem = useCallback(
    (id: string) => {
      markChanged();
      // Dropping the override deletes a custom item and returns a built-in one to catalog data.
      setOverrides((previous) => {
      const { [id]: removed, ...rest } = previous;
        if (removed?.photoId) void deletePhoto(removed.photoId);
        return rest;
      });
    },
    [markChanged],
  );

  const learnAlias = useCallback(
    (id: string, alias: string) => {
      const spoken = alias.trim();
      if (!spoken) return;
      const item = items.find((entry) => entry.id === id);
      if (!item || item.aliases.includes(spoken)) return;
      updateItem(id, { aliases: [...item.aliases, spoken] });
    },
    [items, updateItem],
  );

  const setPhoto = useCallback(
    async (id: string, file: Blob) => {
      const photo = await shrinkPhoto(file);
      const photoId = newPhotoId();
      await savePhoto(photoId, photo);
      cachePhotoUrl(photoId, photo);
      markChanged();
      setOverrides((previous) => {
        const old = previous[id]?.photoId;
        if (old) void deletePhoto(old);
        return { ...previous, [id]: applyPatch(previous[id] ?? { id }, { photoId }) };
      });
    },
    [markChanged],
  );

  const removePhoto = useCallback(
    (id: string) => {
      markChanged();
      setOverrides((previous) => {
        const old = previous[id]?.photoId;
        if (old) void deletePhoto(old);
        return { ...previous, [id]: applyPatch(previous[id] ?? { id }, { photoId: undefined }) };
      });
    },
    [markChanged],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const replaceAll = useCallback(
    (nextOverrides: Record<string, ItemOverride>, nextSettings: Settings, source: 'backup' | 'import') => {
      // Data just restored from a backup file is already in that file.
      if (source === 'backup') markBackedUp();
      else markChanged();
      setOverrides(nextOverrides);
      setSettings(nextSettings);
    },
    [markBackedUp, markChanged],
  );

  const hasOwnChanges = Object.keys(overrides).length > 0;

  const value = useMemo<AppStoreValue>(
    () => ({
      ready,
      items,
      overrides,
      settings,
      updateItem,
      addItem,
      removeOrResetItem,
      learnAlias,
      setPhoto,
      removePhoto,
      updateSettings,
      replaceAll,
      backupNeeded: backupNeeded(backupStatus, hasOwnChanges, Date.now()),
      lastBackupAt: backupStatus.lastBackupAt,
      markBackedUp,
      snoozeBackupReminder,
    }),
    [
      ready,
      items,
      overrides,
      settings,
      updateItem,
      addItem,
      removeOrResetItem,
      learnAlias,
      setPhoto,
      removePhoto,
      updateSettings,
      replaceAll,
      backupStatus,
      hasOwnChanges,
      markBackedUp,
      snoozeBackupReminder,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used inside AppStoreProvider');
  return value;
}
