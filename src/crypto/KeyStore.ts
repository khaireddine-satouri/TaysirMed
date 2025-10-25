// src/crypto/KeyStore.ts
// Petit wrapper minimaliste IndexedDB pour stocker des CryptoKey non-extractables.
// Compatible Chromium/Firefox/Safari récents.

const DB_NAME = "taysirmed-keystore";
const DB_VERSION = 1;
const STORE_KEYS = "keys";
const STORE_META = "meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        db.createObjectStore(STORE_KEYS);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function ksPutKey(keyId: string, key: CryptoKey): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, "readwrite");
    const store = tx.objectStore(STORE_KEYS);
    const req = store.put(key, keyId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

export async function ksGetKey<T extends CryptoKey = CryptoKey>(keyId: string): Promise<T | null> {
  const db = await openDb();
  const key = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, "readonly");
    const store = tx.objectStore(STORE_KEYS);
    const req = store.get(keyId);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return key;
}

export async function ksDeleteKey(keyId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, "readwrite");
    const store = tx.objectStore(STORE_KEYS);
    const req = store.delete(keyId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

export async function ksPutMeta<T = unknown>(key: string, value: T): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    const store = tx.objectStore(STORE_META);
    const req = store.put(value as any, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

export async function ksGetMeta<T = unknown>(key: string): Promise<T | null> {
  const db = await openDb();
  const val = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const store = tx.objectStore(STORE_META);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return val;
}
