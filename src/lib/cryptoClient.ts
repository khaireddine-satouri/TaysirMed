// src/lib/cryptoClient.ts
export type TMK = Uint8Array;

const enc = new TextEncoder();

export function randomBytes(n: number) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export async function kdfPBKDF2(passphrase: string, salt: Uint8Array, iterations = 310_000) {
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]);
  const kek = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt","decrypt"]
  );
  return { kek, params: { kdf: "pbkdf2", iters: iterations } };
}

export async function wrapWithKEK(kek: CryptoKey, raw: Uint8Array, aad?: Uint8Array) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, kek, raw);
  return { iv, ct: new Uint8Array(ct) };
}

export async function unwrapWithKEK(kek: CryptoKey, iv: Uint8Array, ct: Uint8Array, aad?: Uint8Array) {
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, kek, ct);
  return new Uint8Array(raw);
}

export function b64uToBytes(s: string) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const b64 = s + '='.repeat(pad);
  return new Uint8Array([...atob(b64)].map(c => c.charCodeAt(0)));
}
export function bytesToB64u(b: Uint8Array) {
  const s = b.reduce((a, x) => a + String.fromCharCode(x), "");
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}
