import { describe, expect, it } from 'vitest';
import { backupNeeded, SNOOZE_MS } from './backupStatus';

const now = Date.UTC(2026, 9, 3);

describe('backup reminder', () => {
  it('stays quiet for a florist who changed nothing', () => {
    expect(backupNeeded({}, false, now)).toBe(false);
  });

  it('asks for a backup when there are changes and none was ever saved', () => {
    expect(backupNeeded({ lastChangeAt: now - 1000 }, true, now)).toBe(true);
  });

  it('stays quiet while the latest backup holds every change', () => {
    expect(backupNeeded({ lastChangeAt: now - 2000, lastBackupAt: now - 1000 }, true, now)).toBe(false);
  });

  it('asks again after a change made since the last backup', () => {
    expect(backupNeeded({ lastBackupAt: now - 2000, lastChangeAt: now - 1000 }, true, now)).toBe(true);
  });

  it('"Later" hides it for a week', () => {
    const status = { lastChangeAt: now - 1000, snoozedUntil: now + SNOOZE_MS };
    expect(backupNeeded(status, true, now)).toBe(false);
    expect(backupNeeded(status, true, now + SNOOZE_MS + 1)).toBe(true);
  });
});
