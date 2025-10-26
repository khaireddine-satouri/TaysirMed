// src/utils/zkcrypto.ts
import sodium from "libsodium-wrappers";

export type KekParams = {
  algo: "argon2id";
  ops: number;        // opslimit
  mem: number;        // memlimit
  parallelism: number;
  version: number;    // 1
};

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
  ); // returns Uint8Array 32 bytes

  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

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

export async function aesGcmEncrypt(DEK: CryptoKey, plaintext: Uint8Array, aad: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, DEK, plaintext);
  return { iv, cipher: new Uint8Array(cipher) };
}

export async function aesGcmDecrypt(DEK: CryptoKey, iv: Uint8Array, cipher: Uint8Array, aad: Uint8Array) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, DEK, cipher);
  return new Uint8Array(plain);
}
