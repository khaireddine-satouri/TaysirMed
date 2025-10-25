// src/crypto/EncryptionService.ts
// Utilitaires simples de chiffrement côté client (WebCrypto)
// Schéma: AES-GCM 256, IV 12 octets, sortie binaire = [IV(12) | CIPHERTEXT+TAG]

/** Génère un IV aléatoire de 12 octets (recommandé pour AES-GCM) */
export function genIv(length = 12): Uint8Array {
  const iv = new Uint8Array(length);
  crypto.getRandomValues(iv);
  return iv;
}

/** Convertit une string UTF-8 en Uint8Array */
export function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Convertit un Uint8Array en string UTF-8 */
export function bytesToUtf8(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

/** Concatène deux Uint8Array */
export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Découpe un Uint8Array en [head, tail] */
function splitBytes(b: Uint8Array, headLen: number): [Uint8Array, Uint8Array] {
  return [b.slice(0, headLen), b.slice(headLen)];
}

/**
 * Chiffre un texte UTF-8 avec AES-GCM et retourne (iv|cipher) en Uint8Array
 * @param plain texte clair
 * @param key   CryptoKey AES-GCM 256 bits
 */
export async function encryptUtf8ToBytes(plain: string, key: CryptoKey): Promise<Uint8Array> {
  const iv = genIv();
  const data = utf8ToBytes(plain);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  const cipher = new Uint8Array(cipherBuf);
  return concatBytes(iv, cipher); // [IV|CIPHER]
}

/**
 * Déchiffre (iv|cipher) en texte UTF-8
 * @param boxed Uint8Array = [IV(12) | CIPHER+TAG]
 * @param key   CryptoKey AES-GCM 256 bits
 */
export async function decryptBytesToUtf8(boxed: Uint8Array, key: CryptoKey): Promise<string> {
  if (!boxed || boxed.length < 13) {
    throw new Error("Ciphertext invalide");
  }
  const [iv, ct] = splitBytes(boxed, 12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ct
  );
  return bytesToUtf8(new Uint8Array(plainBuf));
}

/** Helpers base64 si besoin ailleurs */
export function bytesToBase64(b: Uint8Array): string {
  let binary = "";
  b.forEach((x) => (binary += String.fromCharCode(x)));
  return btoa(binary);
}

export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
