// src/utils/zkcrypto.ts
// Version 100% WebCrypto (sans libsodium).
// KDF: PBKDF2(SHA-256) -> KEK (AES-KW 256)
// Chiffrement: AES-GCM 256
// NOTE sécurité: PBKDF2 n'est pas "memory-hard" (contrairement à Argon2/scrypt).
// Monte "iterations" assez haut et privilégie WebAuthn comme second facteur si possible.

export type KekParams = {
  algo: "pbkdf2";
  iterations: number; // ex: 310000 (RFC 9106 recommande >= 100k ; monte si device le permet)
  hash: "SHA-256";    // SHA-256 recommandé
  version: number;    // 1
};

// ---------- helpers ----------
export function hexToU8(hex: string): Uint8Array {
  const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("HEX_INVALID_LENGTH");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return out;
}

export function anyToU8(v: any): Uint8Array {
  if (!v) return new Uint8Array();
  if (v instanceof Uint8Array) return v;
  if (typeof v === "string") return hexToU8(v); // bytea -> "\\x..."
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

export function packIvCt(iv: Uint8Array, ct: Uint8Array): Uint8Array { return concatU8(iv, ct); }
export function unpackIvCt(buf: Uint8Array): { iv: Uint8Array; ct: Uint8Array } {
  if (buf.length < 12) throw new Error("BUFFER_TOO_SMALL");
  return { iv: buf.slice(0, 12), ct: buf.slice(12) };
}

// ---------- KDF PBKDF2 → KEK (AES-KW 256) ----------
export async function kdfToKEK(password: string, salt: Uint8Array, p: KekParams): Promise<CryptoKey> {
  if (p.algo !== "pbkdf2") throw new Error("KDF_PARAMS_INVALID");
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  // On dérive des bits (32 octets) puis on les importe en AES-KW
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: p.iterations,
      hash: p.hash,
    },
    baseKey,
    256 // bits
  );

  return crypto.subtle.importKey("raw", bits, { name: "AES-KW", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}

// ---------- DEK (AES-GCM 256) ----------
export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
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
    { name: "AES-GCM", iv, ...(aad ? { additionalData: aad } : {}) },
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
    { name: "AES-GCM", iv, ...(aad ? { additionalData: aad } : {}) },
    DEK,
    cipher
  );
  return new Uint8Array(plain);
}
