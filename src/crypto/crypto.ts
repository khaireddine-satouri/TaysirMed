// src/crypto/crypto.ts
export type AesKey = CryptoKey;

const ivLen = 12; // AES-GCM IV length

export async function importRawKey(raw: ArrayBuffer): Promise<AesKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function generateKey(): Promise<AesKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export function utf8enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
export function utf8dec(b: ArrayBuffer | Uint8Array): string {
  const buf = b instanceof Uint8Array ? b : new Uint8Array(b);
  return new TextDecoder().decode(buf);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export async function encryptText(key: AesKey, plaintext: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(ivLen));
  const data = utf8enc(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  return concat(iv, ct);
}

export async function decryptText(key: AesKey, ivCipherConcat: Uint8Array): Promise<string> {
  if (ivCipherConcat.length <= ivLen) throw new Error("cipher too short");
  const iv = ivCipherConcat.slice(0, ivLen);
  const ct = ivCipherConcat.slice(ivLen);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return utf8dec(pt);
}
