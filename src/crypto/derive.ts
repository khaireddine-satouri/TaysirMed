// src/crypto/derive.ts
/* Dérivation d'une clé depuis une passphrase utilisateur (PBKDF2) */

const SALT_KEY = "tm_kdf_salt_v1"; // clé LS
const SALT_LEN = 16; // 128 bits
const PBKDF2_ITERS = 310_000;

function getOrCreateSalt(): Uint8Array {
  const existing = localStorage.getItem(SALT_KEY);
  if (existing) {
    // stocké en base64 URL-safe
    const bin = atob(existing);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const b64 = btoa(String.fromCharCode(...salt));
  localStorage.setItem(SALT_KEY, b64);
  return salt;
}

export async function deriveKeyFromPassphrase(passphrase: string): Promise<CryptoKey> {
  const salt = getOrCreateSalt();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return key;
}

// Optionnel : reset du salt (réinitialise la possibilité de déchiffrer les anciennes données locales)
export function resetKdfSalt() {
  localStorage.removeItem(SALT_KEY);
}
