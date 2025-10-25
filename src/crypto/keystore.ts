// src/crypto/keystore.ts
/* Keystore mémoire : on garde la masterKey seulement en RAM. */

let _masterKey: CryptoKey | null = null;

export function setMasterKey(k: CryptoKey) {
  _masterKey = k;
}

export function getMasterKey(): CryptoKey {
  if (!_masterKey) throw new Error("MasterKey absente. Déverrouillez d'abord (SecureGate).");
  return _masterKey;
}

export function hasMasterKey(): boolean {
  return !!_masterKey;
}

export function clearMasterKey() {
  _masterKey = null;
}
