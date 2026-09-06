import { draftSchema } from "./schema";
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("cadence-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export async function readDraft(key: string) {
  const database = await db();
  return new Promise<ReturnType<typeof draftSchema.parse> | undefined>(
    (resolve, reject) => {
      const request = database
        .transaction("drafts")
        .objectStore("drafts")
        .get(key);
      request.onsuccess = () => {
        if (request.result === undefined) resolve(undefined);
        else {
          const parsed = draftSchema.safeParse(request.result);
          if (parsed.success) resolve(parsed.data);
          else
            reject(
              new Error(
                "A saved browser draft is invalid; the original remains in browser storage.",
              ),
            );
        }
      };
      request.onerror = () => reject(request.error);
    },
  );
}
export async function storeDraft(
  key: string,
  value: ReturnType<typeof draftSchema.parse> | null,
) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction("drafts", "readwrite");
    if (value) tx.objectStore("drafts").put(value, key);
    else tx.objectStore("drafts").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
