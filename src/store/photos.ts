// Item photos: shrunk on the device before saving, shown via cached object URLs.

import { useEffect, useState } from 'react';
import { loadPhoto } from './db';

const MAX_SIDE = 640;
const JPEG_QUALITY = 0.82;

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall back to an <img> element below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Scales a camera or gallery photo down to at most 640 px and re-encodes it as JPEG. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const image = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  if ('close' in image) image.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode photo'))), 'image/jpeg', JPEG_QUALITY),
  );
}

export function newPhotoId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const urlCache = new Map<string, string>();

/** Remembers a just-saved photo so it shows immediately. */
export function cachePhotoUrl(photoId: string, photo: Blob): void {
  urlCache.set(photoId, URL.createObjectURL(photo));
}

/** Object URL of a stored photo (undefined while loading or when there is none). */
export function usePhotoUrl(photoId: string | undefined): string | undefined {
  const [url, setUrl] = useState(() => (photoId ? urlCache.get(photoId) : undefined));

  useEffect(() => {
    if (!photoId) {
      setUrl(undefined);
      return;
    }
    const cached = urlCache.get(photoId);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    void loadPhoto(photoId).then((blob) => {
      if (cancelled || !blob) return;
      const objectUrl = URL.createObjectURL(blob);
      urlCache.set(photoId, objectUrl);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  return url;
}
