// src/crypto/crypto.ts
/* Primitives crypto (AES-GCM 256) + helpers encodage/hex
 * Toutes les données sensibles sont chiffrées côté client.
 */

const IV_LENGTH = 12; // 96 bits recommandé pour AES-GCM

// ---------- UTF-8 <-> bytes ----------
export function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
export function bytesToUtf8(b: ArrayBuffer | Uint8Array): string {
  const view = b instanceof Uint8Array ? b : new Uint8Array(b);
  return new TextDecoder().decode(view);
}

// ---------- concat ----------
export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ---------- hex <-> bytes ----------
// PostgREST accepte bytea au format texte “\\x<hex>”
export function bytesToHex(u8: Uint8Array): string {
  let out = "";
  for (let i = 0; i < u8.length; i++) out += u8[i].toString(16).padStart(2, "0");
  return out;
}
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("\\x") ? hex.slice(2) : hex.startsWith("0x") ? hex.slice(2) : hex;
  const len = clean.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

/** Normalise un champ bytea Postgres renvoyé par PostgREST en Uint8Array (gère string "\\x..." ou ArrayBuffer). */
export function normalizeBytea(val: any): Uint8Array {
  if (val == null) return new Uint8Array();
  if (typeof val === "string") return hexToBytes(val);
  if (val instanceof Uint8Array) return val;
  if (val instanceof ArrayBuffer) return new Uint8Array(val);
  // cas supabase-js peut renvoyer { data: number[] } dans certaines libs — fallback
  if (Array.isArray(val)) return new Uint8Array(val);
  throw new Error("Type bytea inconnu");
}

// ---------- AES-GCM ----------
export async function aesGcmEncrypt(plainUtf8: string, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      utf8ToBytes(plainUtf8)
    )
  );
  // on stocke [iv | ciphertext]
  return concatBytes(iv, ct);
}

export async function aesGcmDecrypt(ivPlusCipher: Uint8Array, key: CryptoKey): Promise<string> {
  if (ivPlusCipher.length <= IV_LENGTH) throw new Error("Cipher trop court");
  const iv = ivPlusCipher.slice(0, IV_LENGTH);
  const ct = ivPlusCipher.slice(IV_LENGTH);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return bytesToUtf8(plain);
}
