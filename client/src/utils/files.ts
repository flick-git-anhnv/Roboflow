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

function walkEntry(entry: any, out: File[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file: File) => { out.push(file); resolve(); }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => {
        reader.readEntries(async (batch: any[]) => {
          if (!batch.length) { resolve(); return; }
          await Promise.all(batch.map((e) => walkEntry(e, out)));
          readBatch();
        }, () => resolve());
      };
      readBatch();
    } else {
      resolve();
    }
  });
}

export function isImageFile(file: File) {
  return /\.(jpe?g|png|webp|bmp)$/i.test(file.name);
}

export function isZipFile(file: File) {
  return /\.zip$/i.test(file.name);
}
