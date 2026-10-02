// Device and install-state detection used for install hints.

import { useEffect, useState } from 'react';

export function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but has a touch screen.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

/** Browsers embedded in messengers and social apps can't install apps and often block the microphone. */
export function isInAppBrowser(): boolean {
  return /WhatsApp|FBAN|FBAV|Instagram|Line\/|Telegram/i.test(navigator.userAgent);
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

/** Android / Chrome install prompt. Returns null where the browser doesn't offer one (e.g. iPhone). */
export function useInstallPrompt(): (() => void) | null {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!promptEvent) return null;
  return () => {
    void promptEvent.prompt();
    setPromptEvent(null);
  };
}
