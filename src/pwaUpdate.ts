// App updates: a new version is announced instead of reloading on its own, so a
// florist is never interrupted mid-dictation (SPEC §3).

import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/** 'stuck': the update was tried a moment ago, yet the new version is still waiting. */
let updateState: 'none' | 'available' | 'stuck' = 'none';

const JUST_UPDATED_KEY = 'app-just-updated';
const UPDATE_TRIED_KEY = 'update-tried-at';
const STUCK_WINDOW_MS = 60_000;

function updateTriedRecently(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(UPDATE_TRIED_KEY) ?? 0) < STUCK_WINDOW_MS;
  } catch {
    return false;
  }
}

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
let swRegistration: ServiceWorkerRegistration | undefined;

registerSW({
  immediate: true,
  onNeedRefresh() {
    updateState = updateTriedRecently() ? 'stuck' : 'available';
    listeners.forEach((listener) => listener());
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    swRegistration = registration;
    // An installed app resumes from the background without reloading: look for a new version then.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update();
    });
  },
});

export function useUpdateState(): typeof updateState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => updateState,
  );
}

/** How long to wait for the phone to report that the new version took over before reloading anyway. */
const SWITCH_TIMEOUT_MS = 2500;

/**
 * Switches to the waiting new version and reloads. iPhone home-screen apps don't always
 * report the switch ("controllerchange"), so the page also reloads once the new version is
 * active, or after a short wait at the latest — the button must never do nothing.
 */
export function reloadWithUpdate(): void {
  try {
    sessionStorage.setItem(JUST_UPDATED_KEY, 'yes');
    sessionStorage.setItem(UPDATE_TRIED_KEY, String(Date.now()));
  } catch {
    // Not critical: the next start just says "Loading…" instead of "Updating…".
  }
  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };
  const waiting = swRegistration?.waiting;
  if (!waiting) {
    // The new version is already active (or there is nothing to wait for): a reload shows it.
    reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', reload);
  waiting.addEventListener('statechange', () => {
    if (waiting.state === 'activated') reload();
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
  window.setTimeout(reload, SWITCH_TIMEOUT_MS);
}
