// src/crypto/bytes.ts

export const te = new TextEncoder();
export const td = new TextDecoder();

export function u8(arr: ArrayLike<number>): Uint8Array {
  return new Uint8Array(arr);
}

export function concatU8(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// Simple “envelope” binaire : [ver(1)][iv(12)][ciphertext..]
export function packAesGcm(iv: Uint8Array, ciphertext: Uint8Array, version = 1): Uint8Array {
  const ver = u8([version & 0xff]);
  return concatU8(ver, iv, ciphertext);
}

export function unpackAesGcm(packed: Uint8Array): { version: number; iv: Uint8Array; ciphertext: Uint8Array } {
  if (packed.length < 1 + 12) throw new Error("Invalid AES-GCM packet");
  const version = packed[0];
  const iv = packed.slice(1, 13);
  const ciphertext = packed.slice(13);
  return { version, iv, ciphertext };
}

// base64url helpers pour Edge Functions
export function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64;
}

export function b64urlDecode(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomIv(len = 12): Uint8Array {
  const iv = new Uint8Array(len);
  crypto.getRandomValues(iv);
  return iv;
}
