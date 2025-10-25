// src/crypto/keystore.ts
import type { AesKey } from "./crypto";

let masterKey: AesKey | null = null;

export function hasMasterKey(): boolean {
  return masterKey !== null;
}

export function getMasterKey(): AesKey {
  if (!masterKey) throw new Error("Master key not set");
  return masterKey;
}

/** A appeler au login (après récupération/derivation de clé) */
export function setMasterKey(key: AesKey) {
  masterKey = key;
}

/** Optionnel : logout/cleanup */
export function clearMasterKey() {
  masterKey = null;
}
