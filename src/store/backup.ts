// Full backup: prices, names, settings and photos in one file (Excel can't hold photos).
// Restoring it brings the app back exactly, e.g. after removing the iPhone home-screen icon.

import type { ItemOverride, Settings } from '../model/types';
import { DEFAULT_SETTINGS } from '../model/types';
import { loadPhoto, savePhoto } from './db';

const FORMAT = 'bouquet-calculator-backup';
const VERSION = 1;

interface BackupFile {
  format: typeof FORMAT;
  version: number;
  createdAt: string;
  settings: Settings;
  overrides: Record<string, ItemOverride>;
  /** photoId → data URL */
  photos: Record<string, string>;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

export async function createBackup(overrides: Record<string, ItemOverride>, settings: Settings): Promise<Blob> {
  const photos: Record<string, string> = {};
  for (const override of Object.values(overrides)) {
    if (!override.photoId) continue;
    const photo = await loadPhoto(override.photoId);
    if (photo) photos[override.photoId] = await blobToDataUrl(photo);
  }
  const backup: BackupFile = {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    settings,
    overrides,
    photos,
  };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

export async function readBackup(file: Blob): Promise<{ overrides: Record<string, ItemOverride>; settings: Settings }> {
  const backup = JSON.parse(await file.text()) as BackupFile;
  if (backup.format !== FORMAT) throw new Error('Not a Bouquet Calculator backup');
  for (const [photoId, dataUrl] of Object.entries(backup.photos ?? {})) {
    await savePhoto(photoId, await dataUrlToBlob(dataUrl));
  }
  return { overrides: backup.overrides ?? {}, settings: { ...DEFAULT_SETTINGS, ...backup.settings } };
}

export function backupFileName(): string {
  return `bouquet-calculator-backup-${new Date().toISOString().slice(0, 10)}.json`;
}
