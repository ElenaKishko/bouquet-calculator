// Saving and opening files on phones.

/**
 * Hands a file to the user. Phones get the share sheet (save to Files, send in
 * WhatsApp…); elsewhere it downloads. Resolves false if the user closed the share sheet.
 */
export async function saveFile(blob: Blob, fileName: string): Promise<boolean> {
  const file = new File([blob], fileName, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false; // closed the share sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Opens the system file picker and resolves with the chosen file (or null if cancelled). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
