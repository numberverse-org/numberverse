/**
 * #819 — parent-gate secret hashing (PIN + security answer).
 *
 * The old gate stored a fixed-salt FNV-1a hash: fast, but a 4-digit PIN is
 * only 10k guesses, so an offline localStorage copy fell to a script in
 * milliseconds. Secrets are now PBKDF2-SHA-256 with a fresh 16-byte random
 * salt and 150k iterations, stored as `pbkdf2-sha256$<iterations>$<saltHex>$
 * <hashHex>`. Legacy `fnv1a$…` values are still ACCEPTED on verify (existing
 * installs) and the caller can transparently re-hash on a successful login.
 */
const LEGACY_PREFIX = "fnv1a$";
const PBKDF2_PREFIX = "pbkdf2-sha256$";
const LEGACY_SALT = "numberverse-parent-pin-v1";

export const PIN_PBKDF2_ITERATIONS = 150_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Legacy verifier — retained ONLY so pre-#819 hashes keep working. */
function legacyFnv1a(value: string): string {
  let h = 0x811c9dc5;
  const s = `${LEGACY_SALT}:${value}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${LEGACY_PREFIX}${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function webcrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle || !c.getRandomValues) {
    throw new Error("WebCrypto is unavailable in this context");
  }
  return c;
}

async function derivePkdf2Hex(value: string, saltHex: string, iterations: number): Promise<string> {
  const saltBytes = hexToBytes(saltHex);
  if (!saltBytes) throw new Error("Invalid PBKDF2 salt");
  // WebCrypto requires BufferSource over a concrete ArrayBuffer (TS ≥5.7 typed
  // arrays); copy into a fresh Uint8Array backed by a real ArrayBuffer.
  const salt = new Uint8Array(new ArrayBuffer(saltBytes.byteLength));
  salt.set(saltBytes);
  const enc = new TextEncoder().encode(value);
  const keyMaterial = await webcrypto().subtle.importKey("raw", enc, "PBKDF2", false, ["deriveBits"]);
  const bits = await webcrypto().subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    KEY_BYTES * 8,
  );
  return bytesToHex(new Uint8Array(bits));
}

/** Hash a PIN/answer for storage. Throws when WebCrypto is unavailable. */
export async function hashParentSecret(value: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  webcrypto().getRandomValues(salt);
  const saltHex = bytesToHex(salt);
  const hashHex = await derivePkdf2Hex(value, saltHex, PIN_PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}${PIN_PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * #1775 — DETERMINISTIC derivation of the device-account credential from the
 * stored random seed. Salt = the device id, so the SAME seed produces a
 * DIFFERENT credential on another device: copying a localStorage blob from
 * one phone does not authenticate to a different device's account. The raw
 * seed in localStorage is no longer itself the account password.
 * Iterations are deliberately high (same PBKDF2-SHA-256 as the PIN gate) and
 * the result is hex-encoded.
 */
export const DEVICE_DERIVE_ITERATIONS = 150_000;

export async function deriveDeviceSecret(seed: string, deviceId: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(seed), "PBKDF2", false, ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(deviceId), iterations: DEVICE_DERIVE_ITERATIONS, hash: "SHA-256" },
      keyMaterial, 256,
    );
    return bytesToHex(new Uint8Array(bits));
  }
  // Insecure context (LAN http dev): crypto.subtle is unavailable — fall back
  // to the raw seed so the on-LAN kid flow keeps working. Prod is always https.
  return seed;
}

/** Verify a PIN/answer against a stored hash (legacy or PBKDF2). */
export async function verifyParentSecret(value: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith(LEGACY_PREFIX)) return legacyFnv1a(value) === stored;
  if (!stored.startsWith(PBKDF2_PREFIX)) return false;
  const rest = stored.slice(PBKDF2_PREFIX.length);
  const parts = rest.split("$");
  if (parts.length !== 3) return false;
  const iterations = Number(parts[0]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  const saltHex = parts[1];
  const storedHash = parts[2];
  try {
    const derived = await derivePkdf2Hex(value, saltHex, iterations);
    return timingSafeEqualHex(derived, storedHash);
  } catch {
    return false;
  }
}
