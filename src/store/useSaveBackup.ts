// "Save everything": hands the full backup file to the florist and remembers that it was saved.

import { saveFile } from '../files';
import { useAppStore } from './AppStore';
import { backupFileName, createBackup } from './backup';

export function useSaveBackup(): () => Promise<void> {
  const { overrides, settings, markBackedUp } = useAppStore();
  return async () => {
    if (await saveFile(await createBackup(overrides, settings), backupFileName())) markBackedUp();
  };
}
