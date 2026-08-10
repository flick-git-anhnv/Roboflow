// Recursively collects File objects from a DataTransfer, supporting both
// plain file drops and whole-folder drops (Chrome/Edge webkitGetAsEntry API).
export async function getFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items;
  if (!items || !items.length) return Array.from(dataTransfer.files || []);

  const supportsEntries = Array.from(items).some((it: any) => typeof it.webkitGetAsEntry === 'function');
  if (!supportsEntries) return Array.from(dataTransfer.files || []);

  const entries = Array.from(items)
    .map((it: any) => it.webkitGetAsEntry?.())
    .filter(Boolean) as any[];

  if (!entries.length) return Array.from(dataTransfer.files || []);

  const files: File[] = [];
  await Promise.all(entries.map((entry) => walkEntry(entry, files)));
  return files;
}

async function walkEntry(entry: any, out: File[]): Promise<void> {
  if (!entry) return;
  try {
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file(
          (file: File) => {
            out.push(file);
            resolve();
          },
          () => resolve()
        );
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readEntries = () => {
        return new Promise<any[]>((resolve, reject) => {
          reader.readEntries(resolve, reject);
        });
      };

      while (true) {
        const batch = await readEntries();
        if (!batch || !batch.length) break;
        await Promise.all(batch.map((e) => walkEntry(e, out)));
      }
    }
  } catch (err) {
    console.error('Error walking entry:', err);
  }
}

export function isImageFile(file: File) {
  return /\.(jpe?g|png|webp|bmp)$/i.test(file.name);
}

export function isZipFile(file: File) {
  return /\.zip$/i.test(file.name);
}
