// Gemini results cached in this browser's IndexedDB, keyed by a hash of the exact request.
// Same mod again = no AI call, so retries after a rate limit only redo what failed.
// ponytail: per-browser cache; a shared server cache (e.g. Supabase) if this goes public and popular.

const DB = "quill";
const STORE = "gemini";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined; // private mode or blocked storage: behave as a cache miss
  }
}

export async function hashKey(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const cacheGet = <T>(key: string) => run<T>("readonly", (s) => s.get(key));
export const cacheSet = (key: string, value: unknown) => run("readwrite", (s) => s.put(value, key));
