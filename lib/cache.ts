// Gemini results cached in this browser's IndexedDB, keyed by a hash of the exact request.
// Same mod again = no AI call, so retries after a rate limit only redo what failed.
// ponytail: per-browser cache; a shared server cache (e.g. Supabase) if this goes public and popular.

const DB = "quill";
const STORES = ["gemini", "session"]; // session: the last work, so a reload doesn't lose it

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest, store = "gemini"): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = fn(db.transaction(store, mode).objectStore(store));
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

export const sessionGet = <T>(key: string) => run<T>("readonly", (s) => s.get(key), "session");
export const sessionSet = (key: string, value: unknown) => run("readwrite", (s) => s.put(value, key), "session");
export const sessionClear = () => run("readwrite", (s) => s.clear(), "session");
