// Explicit attachment drafts only. API responses, roles and session tokens never enter IndexedDB.
const database = "idd-device-attachments-v1";
type Draft = { key: string; owner: string; file: File; savedAt: number };
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(database, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("files", { keyPath: "key" });
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
  });
}
export async function deviceDraft(
  owner: string,
  target: string,
  slot: string,
  file?: File | null,
) {
  const db = await open();
  const key = [owner, target, slot].join("/");
  try {
    return await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(
        "files",
        file === undefined ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("files");
      let result: File | null = null;
      const request =
        file === undefined
          ? store.get(key)
          : file === null
            ? store.delete(key)
            : store.put({
                key,
                owner,
                file,
                savedAt: Date.now(),
              } satisfies Draft);
      request.onsuccess = () => {
        if (file === undefined)
          result = (request.result as Draft | undefined)?.file ?? null;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function clearDeviceDrafts() {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
