// On-device storage (IndexedDB). Nothing leaves the phone.

import { createStore, del, get, set } from 'idb-keyval';
import type { ItemOverride, Settings } from '../model/types';

const store = createStore('bouquet-calculator', 'data');

const OVERRIDES_KEY = 'overrides';
const SETTINGS_KEY = 'settings';
const photoKey = (photoId: string) => `photo:${photoId}`;

export async function loadOverrides(): Promise<Record<string, ItemOverride>> {
  return (await get<Record<string, ItemOverride>>(OVERRIDES_KEY, store)) ?? {};
}

export function saveOverrides(overrides: Record<string, ItemOverride>): Promise<void> {
  return set(OVERRIDES_KEY, overrides, store);
}

export async function loadSettings(): Promise<Partial<Settings>> {
  return (await get<Partial<Settings>>(SETTINGS_KEY, store)) ?? {};
}

export function saveSettings(settings: Settings): Promise<void> {
  return set(SETTINGS_KEY, settings, store);
}

export function loadPhoto(photoId: string): Promise<Blob | undefined> {
  return get<Blob>(photoKey(photoId), store);
}

export function savePhoto(photoId: string, photo: Blob): Promise<void> {
  return set(photoKey(photoId), photo, store);
}

export function deletePhoto(photoId: string): Promise<void> {
  return del(photoKey(photoId), store);
}

/** Asks the browser not to clear our data when the phone runs low on space. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Not supported: data is still stored, just without the extra protection.
  }
}
