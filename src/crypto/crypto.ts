// src/crypto/crypto.ts
// AES-GCM 256 avec IV aléatoire (12 bytes). On concatène [iv | ciphertext] en sortie.
// Clé conservée en mémoire (jamais en localStorage) pour v1.

export type AesKey = CryptoKey;

const ivLen = 12;

export async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<AesKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 210_000, // robuste et raisonnable
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function randomSalt(len = 16): Uint8Array {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return a;
}

export async function encryptAesGcm(key: AesKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = new Uint8Array(ivLen);
  crypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  const out = new Uint8Array(ivLen + ct.byteLength);
  out.set(iv, 0);
  out.set(ct, ivLen);
  return out;
}

export async function decryptAesGcm(key: AesKey, ivPlusCipher: Uint8Array): Promise<Uint8Array> {
  const iv = ivPlusCipher.slice(0, ivLen);
  const ct = ivPlusCipher.slice(ivLen);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Uint8Array(pt);
}

export const enc = new TextEncoder();
export const dec = new TextDecoder();

export function strToBytes(s: string): Uint8Array {
  return enc.encode(s);
}
export function bytesToStr(b: Uint8Array): string {
  return dec.decode(b);
}

// Conversions utiles si besoin (optionnel)
export function toHex(u8: Uint8Array): string {
  return [...u8].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return arr;
}
