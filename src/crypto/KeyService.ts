// src/crypto/KeyService.ts
import { ksGetKey, ksPutKey, ksGetMeta, ksPutMeta } from "./KeyStore";
import { b64urlEncode, b64urlDecode } from "./bytes";
import { supabase } from "../lib/supabase";

/**
 * Schéma logique :
 * - KEK (device) = CryptoKey AES-KW/AES-GCM non-extractable, stockée en IndexedDB
 * - DEK (tenant) = clé brute 256-bit (CryptoKey AES-GCM) conservée en mémoire
 * - Edge Functions stockent uniquement "dek_wrapped" (DEK chiffrée par KEK), jamais la DEK en clair
 */

const KEK_KEY_ID = "kek:aes256-gcm";         // identifiant local IndexedDB
const DEVICE_ID_KEY = "meta:device_id";      // device id stable côté front
const DEK_CACHE_MS = 12 * 60 * 60 * 1000;    // 12h en mémoire (safety)

let _dekKey: CryptoKey | null = null;
let _dekLoadedAt = 0;

export type DekBootstrapResult =
  | { status: "ok_existing" }
  | { status: "ok_new" }
  | { status: "missing_share" }
  | { status: "error"; message: string };

/** Génère/retourne un device_id stable (stocké en IndexedDB meta). */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await ksGetMeta<string>(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await ksPutMeta(DEVICE_ID_KEY, id);
  return id;
}

/** Obtient ou crée la KEK locale (CryptoKey non-extractable). */
export async function getOrCreateKEK(): Promise<CryptoKey> {
  let kek = await ksGetKey<CryptoKey>(KEK_KEY_ID);
  if (kek) return kek;

  // AES-GCM key, utilisable pour "wrap"/"unwrap" de la DEK
  kek = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
  );
  await ksPutKey(KEK_KEY_ID, kek);
  return kek;
}

/** Garde-fou biométrique (à brancher sur WebAuthn plus tard). */
export async function assertBiometric(): Promise<void> {
  // TODO: brancher ici un appel vers une Edge Function "begin-webauthn" (challenge) + navigator.credentials.get
  // Pour l’instant, no-op pour ne pas bloquer le flux de dev.
  return;
}

/** Wrap la DEK avec la KEK locale pour envoi à l’Edge Function. */
export async function wrapDEKForStorage(dek: CryptoKey): Promise<string> {
  const kek = await getOrCreateKEK();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(
    await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv })
  );
  // On stocke [iv|wrapped] en base64url
  const payload = new Uint8Array(iv.length + wrapped.length);
  payload.set(iv, 0);
  payload.set(wrapped, iv.length);
  return b64urlEncode(payload);
}

/** Unwrap d’une DEK (blob b64url venant d’Edge) via KEK locale. */
export async function unwrapDEKFromStorage(dekWrappedB64: string): Promise<CryptoKey> {
  const payload = b64urlDecode(dekWrappedB64);
  if (payload.length <= 12) throw new Error("Invalid wrapped DEK");
  const iv = payload.slice(0, 12);
  const wrapped = payload.slice(12);

  const kek = await getOrCreateKEK();
  const dek = (await crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    kek,
    { name: "AES-GCM", iv },
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"]
  )) as CryptoKey;
  return dek;
}

/** Génère une nouvelle DEK AES-GCM (non-extractable). */
export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Fournit la DEK en mémoire (ou la recharge depuis le share distant). */
export async function getDEK(): Promise<CryptoKey | null> {
  if (_dekKey && Date.now() - _dekLoadedAt < DEK_CACHE_MS) return _dekKey;
  return null;
}

/** Force le DEK en mémoire. */
export function setDEKInMemory(dek: CryptoKey) {
  _dekKey = dek;
  _dekLoadedAt = Date.now();
}

/** Supprime le DEK de la mémoire (ex: logout). */
export function clearDEKInMemory() {
  _dekKey = null;
  _dekLoadedAt = 0;
}

/** Bootstrap : tente de récupérer le share ; si absent, génère DEK + stocke share. */
export async function bootstrapDEK(): Promise<DekBootstrapResult> {
  try {
    await assertBiometric(); // placeholder biométrie

    const deviceId = await getOrCreateDeviceId();

    // 1) tenter de récupérer le share (dernier) pour l’utilisateur courant
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token;
    if (!jwt) return { status: "error", message: "No session" };

    const { data: shareResp, error: shareErr } = await supabase.functions.invoke("get-dek-share", {
      body: { latest: true, device_id: deviceId },
    });
    if (shareErr) return { status: "error", message: shareErr.message };

    const share = shareResp?.share ?? null;

    if (share?.dek_wrapped) {
      // 2) unwrap vers DEK et cache mémoire
      const dekB64 = b64urlEncode(new Uint8Array(share.dek_wrapped.data ?? share.dek_wrapped)); // compat supabase-js
      const dek = await unwrapDEKFromStorage(dekB64);
      setDEKInMemory(dek);
      return { status: "ok_existing" };
    }

    // 3) pas de share -> créer DEK + stocker share pour CE device
    const dek = await generateDEK();
    const dekWrappedB64 = await wrapDEKForStorage(dek);

    const { error: storeErr } = await supabase.functions.invoke("store-dek-share", {
      body: { device_id: deviceId, dek_wrapped_b64: dekWrappedB64 },
    });
    if (storeErr) return { status: "error", message: storeErr.message };

    setDEKInMemory(dek);
    return { status: "ok_new" };
  } catch (e: any) {
    return { status: "error", message: e?.message || "bootstrap failed" };
  }
}

/** Expose une fonction pour partager la DEK vers un autre utilisateur (cas admin) ou device. */
export async function shareDekTo(targetUserId: string, targetDeviceId: string): Promise<void> {
  const dek = await getDEK();
  if (!dek) throw new Error("DEK not loaded");
  const dekWrappedB64 = await wrapDEKForStorage(dek);
  const { error } = await supabase.functions.invoke("store-dek-share", {
    body: { user_id: targetUserId, device_id: targetDeviceId, dek_wrapped_b64: dekWrappedB64 },
  });
  if (error) throw error;
}
