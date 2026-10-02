// App updates: a new version is announced instead of reloading on its own, so a
// florist is never interrupted mid-dictation (SPEC §3).

import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

let updateAvailable = false;

const JUST_UPDATED_KEY = 'app-just-updated';

/** True from tapping "Update" until the app is ready again. */
export function wasJustUpdated(): boolean {
  try {
    return sessionStorage.getItem(JUST_UPDATED_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function clearJustUpdated(): void {
  try {
    sessionStorage.removeItem(JUST_UPDATED_KEY);
  } catch {
    // Nothing to clear.
  }
}
const listeners = new Set<() => void>();

const applyUpdate = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateAvailable = true;
    listeners.forEach((listener) => listener());
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    // An installed app resumes from the background without reloading: look for a new version then.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update();
    });
  },
});

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => updateAvailable,
  );
}

export function reloadWithUpdate(): void {
  try {
    sessionStorage.setItem(JUST_UPDATED_KEY, 'yes');
  } catch {
    // Not critical: the next start just says "Loading…" instead of "Updating…".
  }
  void applyUpdate(true);
}
