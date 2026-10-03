// App updates (SPEC §3). A new version switches on by itself at moments that interrupt
// nothing: when the app is opened or brought back, or when it goes to the background —
// and only if no recording, open panel or typed text would be lost. Otherwise a banner
// offers the update. The current bouquet and tab survive the reload.

import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/** 'stuck': the update was tried a moment ago, yet the new version is still waiting. */
let updateState: 'none' | 'available' | 'stuck' = 'none';

const JUST_UPDATED_KEY = 'app-just-updated';
const UPDATE_TRIED_KEY = 'update-tried-at';
const STUCK_WINDOW_MS = 60_000;
/** An update found this soon after opening the app is applied right away. */
const JUST_OPENED_MS = 15_000;
/** How long to wait for the phone to report that the new version took over before reloading anyway. */
const SWITCH_TIMEOUT_MS = 2500;

let openedAt = Date.now();

function updateTriedRecently(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(UPDATE_TRIED_KEY) ?? 0) < STUCK_WINDOW_MS;
  } catch {
    return false;
  }
}

/** True from starting an update until the app is ready again. */
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

/**
 * Reloading now would lose something: a recording or recognition in progress, a first
 * model download, an open panel (e.g. a price being edited), or text being typed.
 */
function isBusy(): boolean {
  const body = document.body;
  if (body.classList.contains('has-sheet') || body.dataset.busy === 'true' || body.dataset.downloading === 'true') {
    return true;
  }
  if (document.activeElement?.closest('input, textarea, select')) return true;
  return [...document.querySelectorAll('textarea')].some((field) => field.value.trim() !== '');
}

/** Applies a waiting update now if that interrupts nothing. */
function applyIfQuiet(): void {
  if (updateState === 'available' && !isBusy()) reloadWithUpdate();
}

const listeners = new Set<() => void>();
let swRegistration: ServiceWorkerRegistration | undefined;

registerSW({
  immediate: true,
  onNeedRefresh() {
    // Still waiting right after an update attempt: don't retry by itself, ask the florist instead.
    updateState = updateTriedRecently() ? 'stuck' : 'available';
    listeners.forEach((listener) => listener());
    if (Date.now() - openedAt < JUST_OPENED_MS) applyIfQuiet();
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    swRegistration = registration;
    if (!registration.waiting) {
      try {
        sessionStorage.removeItem(UPDATE_TRIED_KEY); // the last update went through
      } catch {
        // Not critical.
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // An installed app resumes from the background without reloading: that counts as opening it.
        openedAt = Date.now();
        applyIfQuiet();
        void registration.update();
      } else {
        applyIfQuiet();
      }
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

/**
 * Switches to the waiting new version and reloads. iPhone home-screen apps don't always
 * report the switch ("controllerchange"), so the page also reloads once the new version is
 * active, or after a short wait at the latest — the Update button must never do nothing.
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
