// Tracks whether the florist's own changes are in a saved backup, to remind them to save one.
// On iPhone, removing the app from the home screen deletes everything stored on the phone.

export interface BackupStatus {
  /** When the florist last changed prices, names, items or photos. */
  lastChangeAt?: number;
  /** When a backup file was last saved or restored. */
  lastBackupAt?: number;
  /** "Later" hides the reminder until this time. */
  snoozedUntil?: number;
}

const STORAGE_KEY = 'backup-status';
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function loadBackupStatus(): BackupStatus {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as BackupStatus;
  } catch {
    return {};
  }
}

export function saveBackupStatus(status: BackupStatus): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  } catch {
    // Not critical: the reminder may just show again.
  }
}

/** True when the florist has changes that no saved backup holds, and hasn't snoozed the reminder. */
export function backupNeeded(status: BackupStatus, hasOwnChanges: boolean, now: number): boolean {
  if (!hasOwnChanges) return false;
  if (status.snoozedUntil !== undefined && now < status.snoozedUntil) return false;
  if (status.lastBackupAt === undefined) return true;
  return (status.lastChangeAt ?? 0) > status.lastBackupAt;
}
