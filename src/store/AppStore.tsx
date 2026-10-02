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
  /** Replaces everything (restore from backup / import). */
  replaceAll: (overrides: Record<string, ItemOverride>, settings: Settings) => void;
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

  const items = useMemo(() => mergeItems(CATALOG, overrides), [overrides]);

  const updateItem = useCallback((id: string, patch: ItemPatch) => {
    setOverrides((previous) => ({ ...previous, [id]: applyPatch(previous[id] ?? { id }, patch) }));
  }, []);

  const addItem = useCallback((override: ItemOverride) => {
    setOverrides((previous) => ({ ...previous, [override.id]: { ...override, custom: true } }));
  }, []);

  const removeOrResetItem = useCallback((id: string) => {
    // Dropping the override deletes a custom item and returns a built-in one to catalog data.
    setOverrides((previous) => {
      const { [id]: removed, ...rest } = previous;
      if (removed?.photoId) void deletePhoto(removed.photoId);
      return rest;
    });
  }, []);

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
      setOverrides((previous) => {
        const old = previous[id]?.photoId;
        if (old) void deletePhoto(old);
        return { ...previous, [id]: applyPatch(previous[id] ?? { id }, { photoId }) };
      });
    },
    [],
  );

  const removePhoto = useCallback((id: string) => {
    setOverrides((previous) => {
      const old = previous[id]?.photoId;
      if (old) void deletePhoto(old);
      return { ...previous, [id]: applyPatch(previous[id] ?? { id }, { photoId: undefined }) };
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const replaceAll = useCallback((nextOverrides: Record<string, ItemOverride>, nextSettings: Settings) => {
    setOverrides(nextOverrides);
    setSettings(nextSettings);
  }, []);

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
    }),
    [ready, items, overrides, settings, updateItem, addItem, removeOrResetItem, learnAlias, setPhoto, removePhoto, updateSettings, replaceAll],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used inside AppStoreProvider');
  return value;
}
