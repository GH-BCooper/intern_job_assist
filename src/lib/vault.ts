/**
 * Optional local encryption for the sensitive parts of the local store.
 *
 * Uses the browser's own Web Crypto API — AES-GCM with a PBKDF2-derived key —
 * so anyone sharing a device can put notes and contacts behind a passphrase.
 * Zero dependency, zero cost. The passphrase is never stored; only a
 * verifier blob is, so a wrong passphrase fails cleanly instead of producing
 * garbage.
 */

const ITERATIONS = 210_000;
const VERIFIER_KEY = 'interntrack.vault.verifier';
const VERIFIER_PLAINTEXT = 'interntrack-vault-v1';

function subtle(): SubtleCrypto | null {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  return crypto.subtle;
}

export function vaultSupported(): boolean {
  return !!subtle();
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const api = subtle();
  if (!api) throw new Error('This browser has no Web Crypto support.');
  const material = await api.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return api.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** `v1.<salt>.<iv>.<ciphertext>`, all base64 — self-describing so it can be decrypted later. */
export async function encryptString(plaintext: string, passphrase: string): Promise<string> {
  const api = subtle();
  if (!api) throw new Error('This browser has no Web Crypto support.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await api.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return ['v1', toBase64(salt), toBase64(iv), toBase64(new Uint8Array(cipher))].join('.');
}

export async function decryptString(payload: string, passphrase: string): Promise<string> {
  const api = subtle();
  if (!api) throw new Error('This browser has no Web Crypto support.');
  const [version, saltB64, ivB64, dataB64] = payload.split('.');
  if (version !== 'v1' || !saltB64 || !ivB64 || !dataB64) throw new Error('This does not look like an encrypted value.');
  const key = await deriveKey(passphrase, fromBase64(saltB64));
  try {
    const plain = await api.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivB64) as unknown as BufferSource },
      key,
      fromBase64(dataB64) as unknown as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('Wrong passphrase.');
  }
}

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith('v1.') && value.split('.').length === 4;
}

/* ------------------------------- verifier ------------------------------- */

/** Stores a known-plaintext blob so a passphrase can be checked without decrypting data. */
export async function setPassphrase(passphrase: string): Promise<void> {
  const verifier = await encryptString(VERIFIER_PLAINTEXT, passphrase);
  localStorage.setItem(VERIFIER_KEY, verifier);
}

export function hasPassphrase(): boolean {
  return !!localStorage.getItem(VERIFIER_KEY);
}

export function forgetPassphrase(): void {
  localStorage.removeItem(VERIFIER_KEY);
}

export async function verifyPassphrase(passphrase: string): Promise<boolean> {
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!verifier) return false;
  try {
    return (await decryptString(verifier, passphrase)) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

/* ----------------------------- session key ----------------------------- */

/**
 * The unlocked passphrase for this tab only — deliberately module state, so it
 * disappears on reload and is never written anywhere.
 */
let unlocked: string | null = null;

export function unlock(passphrase: string) {
  unlocked = passphrase;
}

export function lock() {
  unlocked = null;
}

export function isUnlocked(): boolean {
  return unlocked !== null;
}

export function currentPassphrase(): string | null {
  return unlocked;
}

/** Encrypts with the unlocked passphrase, or returns the text unchanged when locked/off. */
export async function protect(value: string): Promise<string> {
  if (!unlocked || !value || isEncrypted(value)) return value;
  return encryptString(value, unlocked);
}

/** Decrypts when possible; returns a placeholder rather than throwing in render paths. */
export async function reveal(value: string): Promise<string> {
  if (!isEncrypted(value)) return value;
  if (!unlocked) return '🔒 Locked';
  try {
    return await decryptString(value, unlocked);
  } catch {
    return '🔒 Locked';
  }
}
