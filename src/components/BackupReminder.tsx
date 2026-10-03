// Asks the florist to save a backup when they have changes no saved file holds:
// on iPhone, removing the app from the home screen deletes everything on the phone.

import { useI18n } from '../i18n';
import { useAppStore } from '../store/AppStore';
import { useSaveBackup } from '../store/useSaveBackup';

export function BackupReminder() {
  const { t } = useI18n();
  const { backupNeeded, snoozeBackupReminder } = useAppStore();
  const saveBackup = useSaveBackup();
  if (!backupNeeded) return null;

  return (
    <section className="card welcome backup-reminder">
      <h2 className="welcome-title">{t.reminder.title}</h2>
      <p>{t.reminder.text}</p>
      <div className="welcome-actions">
        <button type="button" className="primary-button" onClick={() => void saveBackup()}>
          {t.reminder.save}
        </button>
        <button type="button" onClick={snoozeBackupReminder}>
          {t.reminder.later}
        </button>
      </div>
    </section>
  );
}
