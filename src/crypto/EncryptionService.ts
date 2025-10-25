// src/crypto/EncryptionService.ts
import { randomIv, packAesGcm, unpackAesGcm, te, td } from "./bytes";
import { getDEK } from "./KeyService";

/** Chiffre un buffer avec la DEK en mémoire. Retourne le paquet [ver|iv|ciphertext]. */
export async function encryptBytes(plain: Uint8Array): Promise<Uint8Array> {
  const dek = await getDEK();
  if (!dek) throw new Error("DEK not available");

  const iv = randomIv(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, plain)
  );
  return packAesGcm(iv, ct, 1);
}

/** Déchiffre un paquet [ver|iv|ciphertext] avec la DEK. */
export async function decryptBytes(packed: Uint8Array): Promise<Uint8Array> {
  const dek = await getDEK();
  if (!dek) throw new Error("DEK not available");

  const { iv, ciphertext } = unpackAesGcm(packed);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, dek, ciphertext)
  );
  return plain;
}

/** Helpers string <-> bytea */
export async function encryptText(s: string): Promise<Uint8Array> {
  return encryptBytes(te.encode(s));
}

export async function decryptToText(packed: Uint8Array): Promise<string> {
  const plain = await decryptBytes(packed);
  return td.decode(plain);
}
