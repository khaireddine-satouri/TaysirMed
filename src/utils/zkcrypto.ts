// src/utils/zkcrypto.ts
// Utilitaires crypto ZK (WebCrypto + libsodium) : KDF Argon2id → KEK, wrap/unwrap DEK, AES-GCM.

import sodium from "libsodium-wrappers";

export type KekParams = {
  algo: "argon2id";
  ops: number;        // opslimit (ex: 3-5 en web, plus si desktop)
  mem: number;        // memlimit en bytes (ex: 1<<20 = 1 MiB; augmente si possible)
  parallelism: number;
  version: number;    // 1
};

// ---------- helpers ----------
export function hexToU8(hex: string): Uint8Array {
  const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("HEX_INVALID_LENGTH");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}
export function anyToU8(v: any): Uint8Array {
  if (!v) return new Uint8Array();
  if (v instanceof Uint8Array) return v;
  if (typeof v === "string") {
    // bytea renvoyé par PostgREST : "\\xdeadbeef..."
    return hexToU8(v);
  }
  if (Array.isArray(v)) return new Uint8Array(v);
  if (typeof v === "object" && "data" in v) return new Uint8Array(v.data as number[]);
  throw new Error("UNSUPPORTED_BYTE_FORMAT");
}

export function concatU8(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ---------- KDF → KEK ----------
export async function kdfToKEK(password: string, salt: Uint8Array, p: KekParams): Promise<CryptoKey> {
  await sodium.ready;
  const pwd = sodium.from_string(password);
  const keyBytes = sodium.crypto_pwhash(
    32,
    pwd,
    salt,
    p.ops,
    p.mem,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  ); // Uint8Array(32)

  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

// ---------- DEK ----------
export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
export async function exportRawKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey("raw", key);
}
export async function wrapDEK(KEK: CryptoKey, DEK: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey("raw", DEK, KEK, "AES-KW");
}
export async function unwrapDEK(KEK: CryptoKey, wrapped: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    KEK,
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// ---------- AES-GCM ----------
export async function aesGcmEncrypt(
  DEK: CryptoKey,
  plaintext: Uint8Array,
  aad?: Uint8Array
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    DEK,
    plaintext
  );
  return { iv, cipher: new Uint8Array(cipher) };
}

export async function aesGcmDecrypt(
  DEK: CryptoKey,
  iv: Uint8Array,
  cipher: Uint8Array,
  aad?: Uint8Array
) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    DEK,
    cipher
  );
  return new Uint8Array(plain);
}

// ---------- format pratique iv||ct ----------
export function packIvCt(iv: Uint8Array, ct: Uint8Array): Uint8Array {
  return concatU8(iv, ct);
}
export function unpackIvCt(buf: Uint8Array): { iv: Uint8Array; ct: Uint8Array } {
  if (buf.length < 12) throw new Error("BUFFER_TOO_SMALL");
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  return { iv, ct };
}
